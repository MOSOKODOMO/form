"""Reads a supplier product page (fetched once, or saved by a person) into draft fields.

Only facts the page states are kept. Every extracted value is checked against the page's own text,
and anything missing is written as "not stated".
"""
from __future__ import annotations

import email
import json
import re
import urllib.robotparser
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from urllib.parse import urljoin, urlparse

from fi_products import NOT_STATED, is_https, slugify

USER_AGENT = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
              'Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0')
HEADERS = {'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-AU,en;q=0.9'}
INBOX_HELP = ("Couldn't read this page. Save it in your browser (Ctrl+S, 'Webpage, complete') into `inbox/`, "
              "or paste the page text into `inbox/<handle>.txt`, then run `tools/add-product.py --from-file inbox/<file>`.")
STRONG_BLOCK = ('slide to verify', 'verify you are human', 'unusual traffic', 'are you a robot', 'captcha', 'security verification')
WEAK_BLOCK = ('access denied', 'please log in', 'sign in to view', 'log in to view', 'please sign in', 'forbidden')

COUNTRIES = ('China', 'India', 'Vietnam', 'Viet Nam', 'Thailand', 'Malaysia', 'Indonesia', 'Taiwan', 'Turkey', 'Italy', 'Spain',
             'Portugal', 'Australia', 'Germany', 'Japan', 'South Korea', 'Korea', 'United States', 'USA', 'Mexico', 'Poland', 'Pakistan')
LABELS = {
    'material': ('material', 'main material', 'materials', 'product material', 'handle material', 'body material'),
    'finishes': ('finish', 'finishing', 'surface finish', 'surface treatment', 'surface finishing', 'surface', 'color', 'colour',
                 'colors', 'colours', 'finish color'),
    'sizes': ('size', 'sizes', 'dimension', 'dimensions', 'product size', 'hole distance', 'hole to hole', 'center to center',
              'centre to centre', 'length'),
    'moq': ('min. order', 'min order', 'min.order', 'moq', 'minimum order', 'minimum order quantity'),
    'lead_time': ('lead time', 'production lead time', 'delivery time', 'production time'),
    'origin': ('place of origin', 'origin', 'country of origin'),
    'location': ('location', 'company location', 'province & city', 'city'),
    'brand': ('brand name', 'brand', 'trademark'),
    'certification': ('certification', 'certifications', 'certificate', 'certificates', 'management system certification',
                      'product certification'),
    'established': ('year of establishment', 'year established', 'established year', 'established', 'founded'),
    'company': ('company name', 'supplier', 'manufacturer', 'company', 'seller'),
    'port': ('port', 'fob port', 'loading port'),
    'factory_size': ('factory size', 'plant area', 'factory area'),
    'employees': ('number of employees', 'employees', 'total employees'),
}
LABEL_FIELD = {label: name for name, labels in LABELS.items() for label in labels}
CERTIFICATES = [
    ('ISO 9001', r'ISO\s?9001', re.I), ('ISO 14001', r'ISO\s?14001', re.I), ('ISO 45001', r'ISO\s?45001', re.I),
    ('ISO 13006', r'ISO\s?13006', re.I), ('EN 14411', r'EN\s?14411', re.I), ('AS 4586', r'AS\s?4586', re.I),
    ('AS 2047', r'AS\s?2047', re.I), ('AS/NZS 4020', r'AS\s?/?\s?NZS\s?4020', re.I), ('WaterMark', r'\bWater\s?Mark\b', re.I),
    ('WELS', r'\bWELS\b', 0), ('NSF', r'\bNSF\b', 0), ('ACS', r'\bACS\b', 0), ('KTW', r'\bKTW\b', 0),
    ('DVGW', r'\bDVGW\b', 0), ('CE', r'\bCE\b', 0), ('RoHS', r'\bRoHS\b', 0), ('REACH', r'\bREACH\b', 0), ('UKCA', r'\bUKCA\b', 0),
    ('cUPC', r'\bcUPC\b', 0),
    ('BSCI', r'\bBSCI\b', 0), ('FSC', r'\bFSC\b', 0), ('SGS test report', r'\bSGS\b[^\n]{0,30}\b(?:test|report)\b', re.I),
]
ISSUERS = ('SGS', 'TÜV', 'TUV', 'Bureau Veritas', 'BV', 'Intertek', 'CQC', 'BSI', 'UL', 'DEKRA', 'Eurofins', 'ITS', 'CTI')
BADGES = [
    r'Verified Supplier', r'Verified Manufacturer', r'Verified Pro', r'Audited Supplier', r'Gold Supplier', r'Trade Assurance',
    r'Diamond Member(?: Since \d{4})?', r'Gold Member(?: Since \d{4})?', r'Member Since \d{4}', r'Onsite Check(?:ed)?',
    r'Audited by (?:SGS|T[ÜU]V(?: Rheinland| S[ÜU]D)?|Bureau Veritas|BV|Intertek)', r'\b[A-Z]{2} \d{1,2} ?yrs?\b',
]
CATEGORY_WORDS = [('taps', r'\b(?:tap|taps|faucet|faucets|mixer|basin mixer)\b'), ('knobs', r'\bknobs?\b'),
                  ('handles', r'\b(?:handles?|pulls?|pull bar|t-bar)\b'), ('tiles', r'\btiles?\b')]


@dataclass
class Page:
    html: str | None
    text: str
    source_url: str
    fetched_with: str
    structured: str = ''
    soup: object = None
    base_dir: Path | None = None
    notes: list = field(default_factory=list)

    @property
    def source_text(self) -> str:
        """Everything a person can check: the visible text plus the page's structured data."""
        return self.text + ('\n\n--- Structured data on the page ---\n' + self.structured if self.structured else '')


# ---------- fetching ----------

def robots_allowed(url: str, session) -> tuple[bool, str]:
    import requests
    parts = urlparse(url)
    robots_url = f'{parts.scheme}://{parts.netloc}/robots.txt'
    try:
        response = session.get(robots_url, headers=HEADERS, timeout=15)
    except requests.RequestException as error:
        return True, f'robots.txt could not be read ({error.__class__.__name__}), so the page is treated as allowed'
    if response.status_code in (401, 403):
        return False, f'{robots_url} refused access (HTTP {response.status_code})'
    if response.status_code >= 400:
        return True, 'the site has no robots.txt'
    parser = urllib.robotparser.RobotFileParser()
    parser.parse(response.text.splitlines())
    allowed = parser.can_fetch(USER_AGENT, url)
    return allowed, f'{robots_url} {"allows" if allowed else "disallows"} this page'


def block_reason(status: int, text: str) -> str | None:
    lowered = text.lower()
    if status in (401, 403, 429, 503):
        return f'the site refused the request (HTTP {status})'
    if status >= 400:
        return f'the page returned HTTP {status}'
    if any(phrase in lowered[:1500] for phrase in STRONG_BLOCK) or (len(text) < 3000 and any(p in lowered for p in STRONG_BLOCK)):
        return 'the site showed a CAPTCHA or bot check'
    if len(text) < 1500 and any(phrase in lowered for phrase in WEAK_BLOCK):
        return 'the site asked for a login or denied access'
    return None


def looks_empty(page: Page) -> bool:
    return len(page.text) < 600 and 'Product' not in page.structured


def fetch(url: str, render_fallback: bool = True) -> tuple[Page | None, str]:
    """One polite request. Returns (page, note) or (None, reason) when the page can't be read."""
    import requests
    session = requests.Session()
    allowed, robots_note = robots_allowed(url, session)
    if not allowed:
        return None, f'robots.txt asks bots not to fetch this page ({robots_note})'
    try:
        response = session.get(url, headers=HEADERS, timeout=30)
    except requests.RequestException as error:
        return None, f'the request failed ({error.__class__.__name__})'
    response.encoding = response.encoding or response.apparent_encoding
    page = page_from_html(response.text, response.url, 'one request with a normal browser user agent')
    page.notes.append(robots_note)
    reason = block_reason(response.status_code, page.text)
    if reason:
        return None, reason
    if looks_empty(page) and render_fallback:
        rendered, note = render(url)
        if rendered is None:
            return None, f'the page needs JavaScript and {note}'
        page = page_from_html(rendered, url, 'rendered once in Edge with Playwright, because the page needs JavaScript')
        page.notes.append(robots_note)
        reason = block_reason(200, page.text)
        if reason or looks_empty(page):
            return None, reason or 'the page was still empty after rendering'
    return page, 'ok'


def render(url: str) -> tuple[str | None, str]:
    """Opens the page once in the installed Edge (or Playwright's Chromium). Never solves CAPTCHAs or logs in."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None, 'Playwright is not installed (py -m pip install playwright)'
    with sync_playwright() as playwright:
        browser, problem = None, ''
        for options in ({'channel': 'msedge'}, {}):
            try:
                browser = playwright.chromium.launch(headless=True, **options)
                break
            except Exception as error:  # noqa: BLE001 - try the next browser
                problem = str(error).splitlines()[0]
        if browser is None:
            return None, f'no browser was available for Playwright ({problem})'
        try:
            page = browser.new_page(user_agent=USER_AGENT, locale='en-AU')
            page.goto(url, wait_until='domcontentloaded', timeout=45000)
            page.wait_for_timeout(2500)
            return page.content(), 'rendered'
        except Exception as error:  # noqa: BLE001
            return None, f'the browser could not open it ({str(error).splitlines()[0]})'
        finally:
            browser.close()


# ---------- reading saved pages ----------

def read_saved(path: Path, source_url: str = '') -> Page:
    suffix = path.suffix.lower()
    if suffix in ('.html', '.htm'):
        html = path.read_text(encoding='utf-8', errors='replace')
    elif suffix in ('.mhtml', '.mht'):
        html = html_from_mhtml(path.read_bytes())
    elif suffix == '.txt':
        text = normalise_text(path.read_text(encoding='utf-8', errors='replace'))
        return Page(None, text, source_url or NOT_STATED, f'page text pasted into {path.name}', base_dir=path.parent)
    else:
        raise SystemExit(f'{path.name}: save the page as .html (Webpage, complete), .mhtml or paste its text into a .txt file')
    page = page_from_html(html, source_url or saved_url(html) or NOT_STATED, f'page saved in a browser ({path.name})')
    page.base_dir = path.parent
    return page


def html_from_mhtml(data: bytes) -> str:
    message = email.message_from_bytes(data)
    for part in message.walk():
        if part.get_content_type() == 'text/html':
            payload = part.get_payload(decode=True) or b''
            return payload.decode(part.get_content_charset() or 'utf-8', errors='replace')
    raise SystemExit('No web page was found inside the .mhtml file.')


def saved_url(html: str) -> str:
    for pattern in (r'<!--\s*saved from url=\(\d+\)(\S+?)\s*-->', r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)',
                    r'<meta[^>]+property=["\']og:url["\'][^>]+content=["\']([^"\']+)'):
        match = re.search(pattern, html, re.I)
        if match and match.group(1).startswith('http'):
            return match.group(1)
    return ''


# ---------- parsing ----------

def normalise_text(text: str) -> str:
    lines = [re.sub(r'[ \t ​]+', ' ', line).strip() for line in text.splitlines()]
    return '\n'.join(line for line in lines if line)


def page_from_html(html: str, source_url: str, fetched_with: str) -> Page:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')
    structured = []
    for item in json_ld(soup):
        structured.append(json.dumps(item, ensure_ascii=False, indent=1))
    for tag in soup.find_all('meta'):
        key = tag.get('property') or tag.get('name') or ''
        if key.startswith(('og:', 'product:', 'twitter:title', 'description')) and tag.get('content'):
            structured.append(f'{key}: {tag["content"]}')
    reader = BeautifulSoup(html, 'html.parser')
    for tag in reader(['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'head']):
        tag.decompose()
    text = normalise_text(reader.get_text('\n'))
    return Page(html, text, source_url, fetched_with, '\n'.join(structured), soup)


def json_ld(soup) -> list[dict]:
    items = []
    for tag in soup.find_all('script', attrs={'type': re.compile('ld\\+json', re.I)}):
        try:
            data = json.loads(tag.string or tag.get_text() or '')
        except ValueError:
            continue
        for item in data if isinstance(data, list) else [data]:
            if isinstance(item, dict):
                items.append(item)
                items += [node for node in item.get('@graph', []) if isinstance(node, dict)]
    return items


def ld_product(items: list[dict]) -> dict:
    for item in items:
        kind = item.get('@type')
        if kind == 'Product' or (isinstance(kind, list) and 'Product' in kind):
            return item
    return {}


def meta(soup, key: str) -> str:
    if soup is None:
        return ''
    tag = soup.find('meta', attrs={'property': key}) or soup.find('meta', attrs={'name': key})
    return (tag.get('content') or '').strip() if tag else ''


def clean(value: str, limit: int = 160) -> str:
    value = re.sub(r'\s+', ' ', str(value)).strip(' :;,-|')
    return value[:limit].strip()


def key_values(page: Page) -> list[tuple[str, str]]:
    pairs = []
    if page.soup is not None:
        for row in page.soup.find_all('tr'):
            cells = [cell.get_text(' ', strip=True) for cell in row.find_all(['th', 'td'])]
            for index in range(0, len(cells) - 1, 2):
                pairs.append((cells[index], cells[index + 1]))
        for term in page.soup.find_all('dt'):
            value = term.find_next_sibling('dd')
            if value:
                pairs.append((term.get_text(' ', strip=True), value.get_text(' ', strip=True)))
    lines = page.text.splitlines()
    for index, line in enumerate(lines):
        match = re.match(r'^([A-Za-z][A-Za-z ./()&-]{1,40}?)\s*[:：]\s*(.+)$', line)
        if match:
            pairs.append((match.group(1), match.group(2)))
        elif line.strip(' :').lower() in LABEL_FIELD and index + 1 < len(lines):
            # A label on its own line and its value on the next (Alibaba, Made-in-China). A size list can run over several lines.
            values = [lines[index + 1]]
            if LABEL_FIELD[line.strip(' :').lower()] == 'sizes' and re.search(r'\d', values[0]):
                for following in lines[index + 2:index + 13]:
                    if following.strip(' :').lower() in LABEL_FIELD or len(following) > 60 or not re.search(r'\d', following):
                        break
                    values.append(following)
            if values[0].strip(' :').lower() not in LABEL_FIELD:
                pairs.append((line, '; '.join(values)))
        elif re.fullmatch(r'\(\s*MOQ\s*\)', line, re.I) and index > 0 and QUANTITY.match(lines[index - 1]):
            pairs.append(('moq', lines[index - 1]))  # "100 Pieces" with "(MOQ)" under it (Made-in-China)
    return [(clean(label, 60), clean(value, 400)) for label, value in pairs if label and value]


QUANTITY = re.compile(r'^[≥>]?\s*\d[\d,.]*\s*([A-Za-z²]+(?: [A-Za-z²]+)?)$')
# Values that answer nothing, such as "In Parameter Diagram" or "See picture", count as not stated.
NON_ANSWERS = re.compile(
    r'^(?:(?:see|as|in|refer to|according to|per)\s+(?:the\s+|our\s+|your\s+)?(?:pictures?|pics?|photos?|images?|drawings?|diagrams?|'
    r'parameters?|descriptions?|details?|charts?|tables?|shown|requests?|requested|requirements?|customers?|buyers?)\b'
    r'|please\b|contact\b|customi[sz](?:ed|able)\b|custom\b|optional\b|various\b|any\b|others?\b|multiple\b|oem\b|odm\b|available$)', re.I)


def attributes(page: Page) -> dict:
    """The page's own label and value pairs. When several labels give the same field, the closer label wins
    (Size before Hole distance, Finish before Color), then the first on the page."""
    found, ranks = {}, {}
    for label, value in key_values(page):
        label = label.strip(' :').lower()
        name = LABEL_FIELD.get(label)
        if not name or value.lower() in ('-', 'n/a', 'na', 'none') or NON_ANSWERS.match(value):
            continue
        if name in ('moq', 'lead_time') and not re.search(r'\d', value):
            continue  # "Negotiable" is not a quantity or a time
        rank = LABELS[name].index(label)
        if name not in found or rank < ranks[name]:
            found[name], ranks[name] = value, rank
    return found


def split_list(value: str) -> list[str]:
    # Lists of sizes like "T bar: 50*12*33mm; 64: 116*12*33mm" split on ";" only; short lists also split on "," and "/".
    parts = value.split(';') if ';' in value else re.split(r'\s*(?:,|/|\||、|\band\b)\s*', value)
    return [clean(part, 60) for part in parts if clean(part, 60)][:12]


PRICE = re.compile(r'(US\s?\$|USD|AU\s?\$|A\$|AUD|\$)\s?([0-9]+(?:[.,][0-9]+)?)(?:\s*(?:-|–|~|to)\s*(?:US\s?\$|USD|AU\s?\$|A\$|\$)?\s?([0-9]+(?:[.,][0-9]+)?))?'
                   r'(?:\s*/\s*([A-Za-z²]+(?: [A-Za-z²]+)?))?')


def no_price() -> dict:
    return {'price_min_usd': NOT_STATED, 'price_max_usd': NOT_STATED, 'price_min_aud': NOT_STATED, 'price_max_aud': NOT_STATED,
            'price_unit': NOT_STATED, 'price_currency': NOT_STATED, 'price_evidence': ''}


def currency_of(marker: str, page_text: str) -> str | None:
    marker = marker.replace(' ', '').upper()
    if marker in ('US$', 'USD'):
        return 'USD'
    if marker in ('AU$', 'A$', 'AUD'):
        return 'AUD'
    return 'USD' if re.search(r'\bUS\s?\$|\bUSD\b', page_text) else None  # a bare $ counts only on a page that prices in US dollars


def singular(unit: str) -> str:
    words = unit.split()
    if re.search(r'(?:x|ch|sh|ss)es$', words[-1], re.I):
        words[-1] = words[-1][:-2]
    elif re.search(r'[^s]s$', words[-1], re.I):
        words[-1] = words[-1][:-1]
    return ' '.join(words)


def text_price(page: Page) -> dict:
    """The first price in the page text, widened by the tier prices listed right under it."""
    result = no_price()
    lines = page.text.splitlines()
    for index, line in enumerate(lines):
        match = PRICE.search(line)
        if not match:
            continue
        currency = currency_of(match.group(1), page.text)
        if currency is None:
            result['price_evidence'] = f'"{clean(line)}" (no currency stated, so not converted)'
            return result
        numbers = [to_number(match.group(2)), to_number(match.group(3) or match.group(2))]
        block = [line]
        for other in lines[index + 1:index + 8]:  # tier prices usually sit together; a sample price ends the block
            if re.search(r'sample', other, re.I):
                break
            block.append(other)
        for other in block[1:]:
            for extra in PRICE.finditer(other):
                if currency_of(extra.group(1), page.text) == currency:
                    numbers += [to_number(extra.group(2)), to_number(extra.group(3) or extra.group(2))]
        unit = match.group(4)
        following = block[1] if len(block) > 1 else ''
        if not unit and re.fullmatch(r'/\s*[A-Za-z²]+(?: [A-Za-z²]+)?', following):
            unit = following.lstrip('/ ')  # "US$1.30" with "/ Piece" under it
        if not unit and len(block) > 2 and re.fullmatch(r'\(\s*MOQ\s*\)', block[2], re.I) and QUANTITY.match(following):
            unit = singular(QUANTITY.match(following).group(1))  # "US$1.98-7.76", "100 Pieces", "(MOQ)": priced per piece
        key = currency.lower()
        result.update({f'price_min_{key}': min(numbers), f'price_max_{key}': max(numbers), 'price_currency': currency,
                       'price_evidence': clean(' '.join(block[:3]), 200)})
        if unit:
            result['price_unit'] = clean(unit, 30)
        return result
    return result


def parse_price(page: Page, product: dict) -> dict:
    """Structured data first. When the page text shows a range around the structured price (structured data
    often gives only the lowest tier), the page's range and unit are used."""
    shown = text_price(page)
    offers = product.get('offers') if isinstance(product, dict) else None
    offers = offers[0] if isinstance(offers, list) and offers else offers
    if isinstance(offers, dict):
        currency = str(offers.get('priceCurrency') or '').upper()
        low = offers.get('lowPrice') or offers.get('price')
        high = offers.get('highPrice') or low
        if currency in ('USD', 'AUD') and low:
            key, low, high = currency.lower(), to_number(low), to_number(high)
            result = {**no_price(), f'price_min_{key}': low, f'price_max_{key}': high, 'price_currency': currency,
                      'price_evidence': f'structured data: {currency} {low}-{high}'}
            if shown[f'price_min_{key}'] != NOT_STATED and shown[f'price_min_{key}'] <= low <= high <= shown[f'price_max_{key}']:
                result.update({f'price_min_{key}': shown[f'price_min_{key}'], f'price_max_{key}': shown[f'price_max_{key}'],
                               'price_unit': shown['price_unit'], 'price_evidence': f"{shown['price_evidence']} (structured data: {currency} {low}-{high})"})
            return result
    return shown


def to_number(value) -> float:
    text = str(value).strip()
    if ',' in text and '.' in text:
        text = text.replace(',', '')
    elif ',' in text:
        whole, _, fraction = text.rpartition(',')
        text = f'{whole}.{fraction}' if len(fraction) == 2 else text.replace(',', '')  # 1,20 is a decimal; 1,200 is a thousand
    number = float(text)
    return int(number) if number.is_integer() else number


# Short acronyms only count where the page is talking about certificates, so "UPC" barcodes and the like are ignored.
CERT_CONTEXT = re.compile(r'certif|certificate|approved|approval|standard|complian|conform|test(?:ed)? report|listed', re.I)
DISTINCTIVE = {'ISO 9001', 'ISO 14001', 'ISO 45001', 'ISO 13006', 'EN 14411', 'AS 4586', 'AS 2047', 'AS/NZS 4020', 'WaterMark', 'WELS', 'SGS test report'}


def certificates(page: Page, attrs: dict) -> list[dict]:
    claims = {}
    lines = page.text.splitlines()
    attribute = attrs.get('certification')
    sources = ([(attribute, True)] if attribute else []) + [(line, bool(CERT_CONTEXT.search(line))) for line in lines]
    for line, in_context in sources:
        for name, pattern, flags in CERTIFICATES:
            if name not in DISTINCTIVE and not in_context:
                continue
            match = re.search(pattern, line, flags)
            if not match or name in claims:
                continue
            after = line[match.end():]
            number = re.search(r'(?:No\.?|Number|#)\s*[:：]?\s*([A-Z0-9][A-Z0-9/.-]{4,})', after, re.I) or re.search(r'\b([A-Z]{1,4}[0-9]{2}[A-Z0-9/.-]{3,})\b', after)
            issuer = next((name_ for name_ in ISSUERS if re.search(rf'\b{re.escape(name_)}\b', line)), None)
            claims[name] = {'name': name, 'number': number.group(1) if number else NOT_STATED,
                            'issuer': issuer or NOT_STATED, 'status': 'claimed', 'check_link': '', 'evidence': clean(line, 200)}
    return list(claims.values())


def badges(text: str) -> list[str]:
    found = []
    for pattern in BADGES:
        for match in re.finditer(pattern, text):
            value = clean(match.group(0), 60)
            if not any(value in existing for existing in found):  # "Member Since 2025" is already in "Diamond Member Since 2025"
                found.append(value)
    return found[:10]


def years(text: str, attrs: dict) -> dict:
    out = {'maker_established': NOT_STATED, 'maker_years_in_business': NOT_STATED, 'platform_years': NOT_STATED}
    this_year = date.today().year
    established = attrs.get('established', '')
    match = re.search(r'\b(19[5-9]\d|20[0-4]\d)\b', established) or re.search(r'(?:Established|Founded)(?: in)?\s*[:：]?\s*(19[5-9]\d|20[0-4]\d)', text, re.I)
    if match and int(match.group(1)) <= this_year:
        out['maker_established'] = match.group(1)
        out['maker_years_in_business'] = this_year - int(match.group(1))
    platform = re.search(r'\b[A-Z]{2} (\d{1,2}) ?yrs?\b', text) or re.search(r'Member Since (\d{4})', text)
    if platform:
        value = int(platform.group(1))
        out['platform_years'] = this_year - value if value > 1900 else value
    return out


def maker_name(page: Page, attrs: dict, product: dict) -> str:
    """The maker the page names: a company name from its labels or structured data first (a brand only counts
    when it is a company name), then the company name the page repeats most, then a supplier name without a suffix."""
    product = product if isinstance(product, dict) else {}

    def name_of(value):
        return value.get('name') if isinstance(value, dict) else value

    def usable(name):
        return isinstance(name, str) and len(name.strip()) > 3 and not PLATFORM_COMPANIES.search(name)

    offers = product.get('offers') if isinstance(product.get('offers'), dict) else {}
    suppliers = [attrs.get('company'), name_of(product.get('manufacturer')), name_of(offers.get('seller'))]
    for name in suppliers + [name_of(product.get('brand'))]:
        if usable(name) and COMPANY.fullmatch(clean(name, 100)):
            return clean(name, 100)
    counts, forms = {}, {}
    for match in COMPANY.finditer(page.source_text):
        name = clean(match.group(0), 100)
        if not PLATFORM_COMPANIES.search(name):
            key = name.rstrip('.').lower()  # "Co., Ltd" and "Co., Ltd." are the same company
            counts[key] = counts.get(key, 0) + 1
            forms.setdefault(key, name)
    if counts:
        return forms[max(counts, key=counts.get)]  # on a tie, the name the page shows first
    return next((clean(name, 100) for name in suppliers if usable(name)), NOT_STATED)


# One to seven capitalised words, then a company suffix that ends the word ("Inc" inside "Inch" doesn't count).
COMPANY = re.compile(r"(?:(?:[A-Z][A-Za-z0-9().']*|&|and)[ \t]+){1,7}(?:Co\.,?\s?Ltd\.?|Co\.,?\s?Limited|Company Limited|Pvt\.?\s?Ltd\.?|Private Limited|Ltd\.?|Limited|Inc\.?|Corporation|Corp\.)(?![A-Za-z])")
# The marketplaces themselves, named in page footers. They are never the maker.
PLATFORM_COMPANIES = re.compile(r'Focus Technology|Alibaba|Made-in-China|Global Sources|AliExpress|Alipay|Ant Group', re.I)


def location(attrs: dict, text: str) -> tuple[str, str]:
    for value in (attrs.get('location'), attrs.get('origin')):
        if value:
            parts = [clean(part, 40) for part in value.split(',') if clean(part, 40)]
            country = next((c for c in COUNTRIES if parts and parts[-1].lower() == c.lower()), None)
            if country:
                city = ', '.join(parts[:-1]) or NOT_STATED
                return city, country
            if len(parts) == 1 and parts[0] in COUNTRIES:
                return NOT_STATED, parts[0]
    match = re.search(r'\b([A-Z][a-z]+(?:, [A-Z][a-z]+)?), (' + '|'.join(COUNTRIES) + r')\b', text)
    if match:
        return match.group(1), match.group(2)
    return NOT_STATED, NOT_STATED


def category(title: str) -> str:
    lowered = title.lower()
    for name, pattern in CATEGORY_WORDS:
        if re.search(pattern, lowered):
            return name
    return NOT_STATED


def product_title(page: Page, product: dict) -> str:
    title = product.get('name') if isinstance(product, dict) else ''
    title = title or meta(page.soup, 'og:title')
    if not title and page.soup is not None:
        heading = page.soup.find('h1')
        title = heading.get_text(' ', strip=True) if heading else ''
    if not title and page.soup is not None and page.soup.title:
        title = page.soup.title.get_text(' ', strip=True)
    if not title:
        title = next((line for line in page.text.splitlines() if len(line) > 15), NOT_STATED)
    title = re.sub(r'\s*[-|]\s*(?:Made-in-China\.com|Alibaba\.com|Alibaba|Global Sources).*$', '', title, flags=re.I)
    return clean(title, 140) or NOT_STATED


def images(page: Page, product: dict) -> tuple[list[str], list[str]]:
    urls, files = [], []

    def add(src: str):
        if not src or src.startswith('data:'):
            return
        if src.startswith('//'):
            src = 'https:' + src
        if src.startswith('http'):
            if is_https(src) and src not in urls:
                urls.append(src)
        elif page.base_dir is not None:
            from urllib.parse import unquote
            local = (page.base_dir / unquote(src.split('?')[0])).resolve()
            # Skip icons and logos: product photos saved with the page are bigger than 10 KB.
            if local.is_file() and local.suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp') and local.stat().st_size > 10_000 and str(local) not in files:
                files.append(str(local))

    image = product.get('image') if isinstance(product, dict) else None
    for src in image if isinstance(image, list) else [image]:
        add(src.get('url') if isinstance(src, dict) else src or '')
    add(meta(page.soup, 'og:image'))
    if page.soup is not None:
        for tag in page.soup.find_all('img'):
            src = tag.get('data-src') or tag.get('data-original') or tag.get('src') or ''
            if re.search(r'image\.made-in-china\.com|alicdn\.com/kf/|/kf/', src) or (page.base_dir is not None and not src.startswith('http')):
                add(src)
            if len(urls) + len(files) >= 12:
                break
    return urls[:12], files[:12]


def grounded(value, source: str) -> bool:
    """True when value appears in the page (case and spacing ignored)."""
    if isinstance(value, (int, float)):
        forms = {str(value), f'{value:.2f}', f'{value:.1f}'} if isinstance(value, float) else {str(value)}
        return any(form in source for form in forms)
    haystack = re.sub(r'\s+', ' ', source).lower()
    needle = re.sub(r'\s+', ' ', str(value)).strip().lower()
    return bool(needle) and needle in haystack


def extract(page: Page) -> dict:
    """Draft fields from the page. Values that can't be found on the page are "not stated"."""
    structured = json_ld(page.soup) if page.soup is not None else []
    product = ld_product(structured)
    attrs = attributes(page)
    badge_text = re.sub(r'\bMember\s*\n\s*Since\b', 'Member Since', page.text)  # "Diamond Member" with "Since 2023" under it
    title = product_title(page, product)
    city, country = location(attrs, page.text)
    price = parse_price(page, product)
    maker = maker_name(page, attrs, product)
    image_urls, image_files = images(page, product)
    host = urlparse(page.source_url).netloc.lower() if page.source_url.startswith('http') else ''
    maker_url = NOT_STATED
    if host.endswith('.en.made-in-china.com') or re.match(r'^[a-z0-9-]+\.en\.alibaba\.com$', host):
        maker_url = f'https://{host}/'  # the product page sits on the maker's own storefront
    elif page.soup is not None:
        for link in page.soup.find_all('a', href=True):
            store = re.match(r'^(?:https?:)?//([a-z0-9-]+)\.en\.(alibaba|made-in-china)\.com', link['href'].strip().lower())
            if store and store.group(1) not in ('www', 'm', 'login', 'passport'):
                maker_url = f'https://{store.group(1)}.en.{store.group(2)}.com/'
                break
    draft = {
        'product': title,
        'category': category(title),
        'maker': maker,
        'maker_url': maker_url,
        'source_url': page.source_url,
        'source_site': re.sub(r'^(?:www\.|[a-z0-9-]+\.en\.)', '', host) if host else NOT_STATED,
        'country': country,
        'city': city,
        'material': attrs.get('material', NOT_STATED),
        'finishes': split_list(attrs['finishes']) if attrs.get('finishes') else [NOT_STATED],
        'sizes': split_list(attrs['sizes']) if attrs.get('sizes') else [NOT_STATED],
        'moq': attrs.get('moq', NOT_STATED),
        'price_min_usd': price['price_min_usd'],
        'price_max_usd': price['price_max_usd'],
        'price_min_aud': price['price_min_aud'],
        'price_max_aud': price['price_max_aud'],
        'price_unit': price['price_unit'],
        'price_evidence': price['price_evidence'] or NOT_STATED,
        'lead_time': attrs.get('lead_time', NOT_STATED),
        'port': attrs.get('port', NOT_STATED),
        'certificates_claimed': certificates(page, attrs),
        'platform_badges': badges(badge_text),
        'factory_size': attrs.get('factory_size', NOT_STATED),
        'employees': attrs.get('employees', NOT_STATED),
        **years(badge_text, attrs),
        'image_urls': image_urls,
        'image_files': image_files,
    }
    return enforce_grounding(draft, page.source_text)


GROUNDED_FIELDS = ('product', 'maker', 'country', 'city', 'material', 'moq', 'lead_time', 'port', 'factory_size', 'employees')


def enforce_grounding(draft: dict, source: str) -> dict:
    for key in GROUNDED_FIELDS:
        if draft.get(key) not in (None, NOT_STATED) and not grounded(draft[key], source):
            draft[key] = NOT_STATED
    for key in ('finishes', 'sizes'):
        kept = [item for item in draft.get(key, []) if item == NOT_STATED or grounded(item, source)]
        draft[key] = kept or [NOT_STATED]
    for key in ('price_min_usd', 'price_max_usd', 'price_min_aud', 'price_max_aud'):
        if isinstance(draft.get(key), (int, float)) and not grounded(draft[key], source):
            draft[key] = NOT_STATED
    claims = []
    for claim in draft.get('certificates_claimed', []):
        if not grounded(claim['evidence'], source):
            continue
        for part in ('number', 'issuer'):
            if claim[part] != NOT_STATED and not grounded(claim[part], source):
                claim[part] = NOT_STATED
        claims.append(claim)
    draft['certificates_claimed'] = claims
    draft['platform_badges'] = [badge for badge in draft.get('platform_badges', []) if grounded(badge, source)]
    return draft


def suggest_handle(draft: dict) -> str:
    return slugify(draft['product'] if draft['product'] != NOT_STATED else 'product')
