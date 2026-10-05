"""FI Verify, research part: what a page claims, where a person checks each claim, and red flags found automatically.

Sites with a CAPTCHA or a login are never automated. They are left as links for a person, who records
each result in the draft (status "verified" with the link where it was confirmed, or "failed").
"""
from __future__ import annotations

from statistics import median
from urllib.parse import quote

from fi_products import NOT_STATED, is_stated

REGISTERS = {
    'China': ('National Enterprise Credit Information Publicity System (gsxt.gov.cn)', 'https://www.gsxt.gov.cn/',
              "Search the company's Chinese name or unified social credit code. The site has a CAPTCHA, so a person checks it."),
    'India': ('MCA company search', 'https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html',
              'Search the company name or CIN, then check the GSTIN at https://services.gst.gov.in/services/searchtp (CAPTCHA).'),
    'Australia': ('ABN Lookup', 'https://abr.business.gov.au/', 'Search the business name or ABN.'),
    'Vietnam': ('National Business Registration Portal', 'https://dangkykinhdoanh.gov.vn/', 'Search the company name or tax code.'),
}
CERT_SITES = {
    'ISO': ('IAF CertSearch', 'https://www.iafcertsearch.org/', 'Search the company name or certificate number, and note the certification body.'),
    'WaterMark': ('ABCB WaterMark Product Database', 'https://watermark.abcb.gov.au/', 'Search the licence number or the product. Taps sold in Australia must be listed.'),
    'WELS': ('WELS product database', 'https://www.waterrating.gov.au/', 'Search the WELS registration for this exact model.'),
    'CE': ('EU notified bodies database', 'https://webgate.ec.europa.eu/single-market-compliance-space/notified-bodies',
           "CE is usually self-declared. Ask for the declaration of conformity and check any notified body number it gives."),
    'TÜV': ('TÜV Rheinland Certipedia', 'https://www.certipedia.com/', 'Search the certificate number or company name.'),
    'SGS': ('SGS certified clients and products', 'https://www.sgs.com/en/certified-clients-and-products', 'Search the company or certificate number.'),
}
# Certificates that only make sense for one category. Any other product claiming them is a red flag.
CATEGORY_ONLY = {
    'WaterMark': 'taps', 'WELS': 'taps', 'cUPC': 'taps', 'NSF': 'taps', 'ACS': 'taps', 'KTW': 'taps', 'DVGW': 'taps', 'AS/NZS 4020': 'taps',
    'AS 4586': 'tiles', 'EN 14411': 'tiles', 'ISO 13006': 'tiles', 'AS 2047': 'windows',
}


def cert_site(claim: dict) -> tuple[str, str, str]:
    name, issuer = claim['name'], claim.get('issuer', NOT_STATED)
    if name.startswith('ISO'):
        return CERT_SITES['ISO']
    if name in CERT_SITES:
        return CERT_SITES[name]
    if issuer in ('TÜV', 'TUV'):
        return CERT_SITES['TÜV']
    if issuer == 'SGS' or name.startswith('SGS'):
        return CERT_SITES['SGS']
    query = quote(' '.join(part for part in (issuer if is_stated(issuer) else '', name, claim['number'] if is_stated(claim.get('number')) else '', 'certificate verification') if part))
    how = SELF_DECLARED.get(name, "Find the issuer's certificate check and search the number there.")
    return ("the issuer's own website", f'https://www.google.com/search?q={query}', how)


# Marks a maker declares itself, backed by a lab test report rather than a certificate in a public database.
SELF_DECLARED = {name: f"{name} is self-declared. Ask for the lab's test report, then check its report number on the lab's own website."
                 for name in ('RoHS', 'REACH', 'UKCA')}


def claim_checks(draft: dict) -> list[dict]:
    """One row per claim: what the page says, its status, and where a person checks it."""
    rows = []
    maker = draft.get('maker', NOT_STATED)
    registration = draft.get('company_registration', {})
    site = REGISTERS.get(draft.get('country'), ('the official company register', '', "Search the official company register for the maker's country."))
    rows.append({'claim': f'Company registration: {maker}', 'status': registration.get('status', 'claimed' if is_stated(maker) else NOT_STATED),
                 'where': site[0], 'link': site[1], 'how': site[2]})
    for claim in draft.get('certificates_claimed', []):
        where, link, how = cert_site(claim)
        number = claim['number'] if is_stated(claim.get('number')) else 'number not stated'
        rows.append({'claim': f"{claim['name']} ({number}{', issued by ' + claim['issuer'] if is_stated(claim.get('issuer')) else ''})",
                     'status': claim.get('status', 'claimed'), 'where': where, 'link': claim.get('check_link') or link, 'how': how})
    for badge in draft.get('platform_badges', []):
        audit = any(word in badge for word in ('Audited', 'Verified', 'Onsite Check'))
        rows.append({'claim': f'Platform badge: {badge}', 'status': 'claimed', 'where': f"the maker's page on {draft.get('source_site', 'the platform')}",
                     'link': draft.get('maker_url') if is_stated(draft.get('maker_url')) else draft.get('source_url', ''),
                     'how': 'Open the audit or verification report on the platform and note who did the audit. It usually needs a login, so a person checks it.'
                     if audit else 'A membership level or account age shown by the platform. Paid membership is not a check of the maker.'})
    if is_stated(maker):
        rows.append({'claim': 'Export history', 'status': 'not checked', 'where': 'ImportYeti',
                     'link': f'https://www.importyeti.com/search?q={quote(maker)}',
                     'how': 'Look for shipments under the maker name. No results is not a red flag on its own.'})
    return rows


def similar_prices(draft: dict, catalogue: list[dict], drafts: list[dict]) -> list[float]:
    prices = []
    for product in catalogue:
        if product.get('category') == draft.get('category') and not product.get('sample') and isinstance(product.get('price_aud'), (int, float)):
            prices.append(float(product['price_aud']))
    for other in drafts:
        estimate = other.get('price_aud_estimate')
        if other.get('handle') != draft.get('handle') and other.get('category') == draft.get('category') and isinstance(estimate, dict):
            if isinstance(estimate.get('min'), (int, float)):
                prices.append(float(estimate['min']))
    return prices


def red_flags(draft: dict, comparison_prices: list[float], ratio: float = 0.5) -> list[str]:
    flags = []
    if not is_stated(draft.get('maker')):
        flags.append('No company name on the page.')
    platform_years = draft.get('platform_years')
    if isinstance(platform_years, (int, float)) and platform_years <= 1:
        flags.append(f'Brand-new account: {platform_years} year(s) on the platform.')
    years = draft.get('maker_years_in_business')
    if isinstance(years, (int, float)) and years < 2:
        flags.append(f'The company says it was established in {draft.get("maker_established")}, under 2 years ago.')
    for claim in draft.get('certificates_claimed', []):
        if not is_stated(claim.get('number')):
            flags.append(f"{claim['name']} is claimed without a certificate number.")
        home = CATEGORY_ONLY.get(claim['name'])
        if home and is_stated(draft.get('category')) and draft['category'] != home:
            flags.append(f"{claim['name']} is a {home} certification, which doesn't fit a product in {draft['category']}.")
    estimate = draft.get('price_aud_estimate')
    if isinstance(estimate, dict) and isinstance(estimate.get('max'), (int, float)) and len(comparison_prices) >= 2:
        typical = median(comparison_prices)
        if estimate['max'] < ratio * typical:
            flags.append(f"Price far below similar items: estimate up to A${estimate['max']:.2f} against a typical A${typical:.2f} for {draft['category']}.")
    return flags


def not_stated_fields(draft: dict) -> list[str]:
    keys = ('product', 'category', 'maker', 'maker_url', 'country', 'city', 'material', 'finishes', 'sizes', 'moq', 'price_min_usd',
            'price_unit', 'lead_time', 'maker_years_in_business', 'platform_years', 'factory_size')
    missing = []
    for key in keys:
        value = draft.get(key)
        if value in (None, NOT_STATED, [NOT_STATED], []):
            if key == 'price_min_usd' and is_stated(draft.get('price_min_aud')):
                continue
            missing.append(key)
    if not draft.get('certificates_claimed'):
        missing.append('certificates')
    if not draft.get('image_urls') and not draft.get('image_files'):
        missing.append('images')
    return missing


def report(draft: dict, checks: list[dict], flags: list[str], comparison_count: int) -> str:
    title = draft.get('product', NOT_STATED)
    lines = [f'# FI Verify: {title}', '',
             f"Draft `{draft['handle']}`, created {draft['created']} from {draft.get('source_url', NOT_STATED)}.",
             f"Read with: {draft.get('fetched_with', NOT_STATED)}. The page text is saved next to this file as `{draft['handle']}.raw.txt`.",
             'Nothing here is published. A person approves the draft with `py tools/approve.py ' + draft['handle'] + '`.', '',
             '## What the page claims', '']
    location = ', '.join(part for part in (draft.get('city'), draft.get('country')) if is_stated(part)) or NOT_STATED
    years = draft.get('maker_years_in_business')
    years_text = f"{years} (established {draft.get('maker_established')})" if is_stated(years) else NOT_STATED
    lines += [f"- Maker: {draft.get('maker', NOT_STATED)} ({location})",
              f'- Years in business: {years_text}',
              f"- Years on the platform: {draft.get('platform_years', NOT_STATED)}",
              f"- Factory size: {draft.get('factory_size', NOT_STATED)}",
              f"- Platform badges: {', '.join(draft.get('platform_badges') or []) or NOT_STATED}"]
    if draft.get('certificates_claimed'):
        for claim in draft['certificates_claimed']:
            lines.append(f"- Certificate: {claim['name']}, number {claim['number']}, issuer {claim['issuer']} (page says: \"{claim['evidence']}\")")
    else:
        lines.append('- Certificates: not stated')
    lines += ['', '## Check each claim', '',
              'Open each link, check the claim on the issuer\'s own database, and record the result in '
              f"`data/drafts/{draft['handle']}.json`: set the status to `verified` and save the link where you confirmed it, or set it to `failed`. "
              'The tools never automate sites with a CAPTCHA or a login.', '',
              '| Claim | Status | Where to check | How |', '|---|---|---|---|']
    for row in checks:
        where = f"[{row['where']}]({row['link']})" if row['link'] else row['where']
        lines.append(f"| {row['claim']} | {row['status']} | {where} | {row['how']} |")
    lines += ['', '## Red flags found automatically', '']
    lines += [f'- {flag}' for flag in flags] or ['- None found. That does not mean the maker is safe; check the claims above.']
    if comparison_count < 2:
        lines.append(f'- Note: the price was not compared, because there are fewer than 2 similar products in {draft.get("category", "this category")} yet.')
    lines += ['', '## Not stated on the page', '', ', '.join(not_stated_fields(draft)) or 'Everything we look for was stated.', '',
              '## Photos', '',
              f"Photo permission: {draft.get('photo_permission', 'no')}. The source photos are for reference only and are not published "
              'until the maker gives written permission (photo_permission "yes").', '',
              '## Price estimate', '']
    estimate = draft.get('price_aud_estimate')
    if isinstance(estimate, dict):
        unit = f" {estimate['unit']}" if is_stated(estimate.get('unit')) else ''
        lines += [f"- Landed cost estimate: A${estimate['min']:.2f} to A${estimate['max']:.2f}{unit}, before GST.",
                  f"- With GST: A${estimate['with_gst_min']:.2f} to A${estimate['with_gst_max']:.2f}.",
                  f"- How: {estimate['formula']}.",
                  f"- {estimate['note']}"]
    else:
        lines.append(f'- Not estimated: {estimate or NOT_STATED}.')
    return '\n'.join(lines) + '\n'
