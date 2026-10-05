"""Add a product draft from a supplier page.

    py tools/add-product.py <url>
    py tools/add-product.py --from-file inbox/<file>     # a page saved in your browser, or page text pasted into a .txt

The page is fetched once, politely (normal browser user agent, robots.txt respected, no other pages).
If a site blocks bots or shows a CAPTCHA, the tool stops and asks you to save the page into inbox/ instead.

Writes, all in data/drafts/ (never published):
  <handle>.json        the draft, status "draft"; anything the page doesn't state is "not stated"
  <handle>.raw.txt     the page text, so a person can check every value
  <handle>.verify.md   what the page claims, where to check each claim, and red flags
  shopify-import.csv   a draft row for Shopify (Published FALSE, Status draft)

A person approves a draft with:  py tools/approve.py <handle>
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fi_extract import INBOX_HELP, extract, fetch, read_saved, suggest_handle  # noqa: E402
from fi_price import estimate  # noqa: E402
from fi_products import (DRAFTS, NOT_STATED, PRODUCTS, ROOT, SETTINGS, SHOPIFY_COLUMNS, SHOPIFY_TYPES, is_stated,  # noqa: E402
                         load_env, load_products, load_settings, slugify, today)
from fi_verify import claim_checks, not_stated_fields, red_flags, report, similar_prices  # noqa: E402


def shopify_row(draft: dict) -> dict:
    facts = []
    if is_stated(draft['material']):
        facts.append(f"Material: {draft['material']}")
    if draft['finishes'] != [NOT_STATED]:
        facts.append(f"Finishes: {', '.join(draft['finishes'])}")
    if draft['sizes'] != [NOT_STATED]:
        facts.append(f"Sizes: {', '.join(draft['sizes'])}")
    made = ', '.join(part for part in (draft['city'], draft['country']) if is_stated(part))
    if is_stated(draft['maker']):
        facts.append(f"Made by {draft['maker']}{' in ' + made if made else ''}")
    estimate_ = draft.get('price_aud_estimate')
    category = draft.get('category')
    finishes = [] if draft['finishes'] == [NOT_STATED] else draft['finishes']
    return {
        'Handle': draft['handle'], 'Title': draft['product'],
        'Body (HTML)': ''.join(f'<p>{fact}.</p>' for fact in facts),
        'Vendor': 'Fabrication Intelligence', 'Type': SHOPIFY_TYPES.get(category, ''),
        'Tags': ', '.join(([category] if is_stated(category) else []) + ['verified-pending', 'price-to-confirm']),
        'Published': 'FALSE', 'Option1 Name': 'Finish' if finishes else 'Title', 'Option1 Value': finishes[0] if finishes else 'Default Title',
        'Variant SKU': '', 'Variant Grams': '', 'Variant Inventory Policy': 'deny', 'Variant Fulfillment Service': 'manual',
        'Variant Price': f"{estimate_['with_gst_max']:.2f}" if isinstance(estimate_, dict) else '',
        'Variant Requires Shipping': 'TRUE', 'Variant Taxable': 'TRUE', 'Status': 'draft',
    }


def write_shopify_row(row: dict, path: Path) -> None:
    rows = []
    if path.exists():
        with open(path, newline='', encoding='utf-8-sig') as handle:
            rows = [old for old in csv.DictReader(handle) if old.get('Handle') != row['Handle']]
    rows.append(row)
    with open(path, 'w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=SHOPIFY_COLUMNS, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)


def load_drafts(folder: Path) -> list[dict]:
    drafts = []
    for path in folder.glob('*.json'):
        try:
            drafts.append(json.loads(path.read_text(encoding='utf-8')))
        except ValueError:
            continue
    return drafts


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Add a product draft from a supplier page.')
    parser.add_argument('url', nargs='?', help='the product page to read')
    parser.add_argument('--from-file', type=Path, help='a page saved in inbox/ (.html, .mhtml) or pasted page text (.txt)')
    parser.add_argument('--source-url', default='', help='where a saved page came from, if the file does not say')
    parser.add_argument('--handle', default='', help='the handle to use (default: made from the product name, or the .txt file name)')
    parser.add_argument('--no-llm', action='store_true', help="don't use the optional LLM even if OPENROUTER_API_KEY is set")
    parser.add_argument('--no-render', action='store_true', help="don't open JavaScript-only pages in a browser")
    parser.add_argument('--drafts', type=Path, default=DRAFTS, help=argparse.SUPPRESS)
    parser.add_argument('--products', type=Path, default=PRODUCTS, help=argparse.SUPPRESS)
    parser.add_argument('--settings', type=Path, default=SETTINGS, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if bool(args.url) == bool(args.from_file):
        parser.error('give either a URL or --from-file inbox/<file>')

    if args.from_file:
        if not args.from_file.exists():
            print(f'{args.from_file} does not exist.')
            return 1
        page = read_saved(args.from_file, args.source_url)
    else:
        if not args.url.startswith(('https://', 'http://')):
            parser.error('the URL must start with https://')
        page, reason = fetch(args.url, render_fallback=not args.no_render)
        if page is None:
            print(f'Stopped: {reason}.')
            print(INBOX_HELP)
            return 2

    draft = extract(page)
    llm_note = 'not used'
    env = load_env()
    if env.get('OPENROUTER_API_KEY') and not args.no_llm:
        from fi_llm import ask, fill_gaps
        try:
            filled = fill_gaps(draft, ask(page.source_text, env['OPENROUTER_API_KEY'], env.get('OPENROUTER_MODEL', '')), page.source_text)
            llm_note = f"filled {', '.join(filled)}" if filled else 'found nothing new on the page'
        except Exception as error:  # noqa: BLE001 - the rules-based draft still stands
            llm_note = f'skipped ({error.__class__.__name__}: {str(error)[:120]})'

    if args.handle:
        handle = slugify(args.handle)
    elif args.from_file and args.from_file.suffix.lower() == '.txt':
        handle = slugify(args.from_file.stem)
    else:
        handle = suggest_handle(draft)
    settings = load_settings(args.settings)
    draft = {'handle': handle, 'status': 'draft', 'created': today(), 'fetched_with': page.fetched_with, **draft,
             'company_registration': {'status': 'claimed' if is_stated(draft['maker']) else NOT_STATED, 'check_link': ''},
             'photo_permission': 'no', 'llm': llm_note}
    draft['price_aud_estimate'] = estimate(draft, settings)

    args.drafts.mkdir(parents=True, exist_ok=True)
    others = [other for other in load_drafts(args.drafts) if other.get('handle') != handle]
    catalogue = load_products(args.products) if args.products.exists() else []
    comparison = similar_prices(draft, catalogue, others)
    flags = red_flags(draft, comparison, settings.get('price_red_flag_ratio', 0.5))
    draft['red_flags'] = flags
    draft['not_stated'] = not_stated_fields(draft)
    draft['raw_text_file'] = f'{handle}.raw.txt'
    draft['verify_report'] = f'{handle}.verify.md'

    (args.drafts / f'{handle}.raw.txt').write_text(f'Source: {page.source_url}\nRead with: {page.fetched_with}\n\n{page.source_text}\n', encoding='utf-8')
    (args.drafts / f'{handle}.json').write_text(json.dumps(draft, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    (args.drafts / f'{handle}.verify.md').write_text(report(draft, claim_checks(draft), flags, len(comparison)), encoding='utf-8')
    write_shopify_row(shopify_row(draft), args.drafts / 'shopify-import.csv')

    found = [key for key in ('product', 'category', 'maker', 'country', 'material', 'moq', 'lead_time') if is_stated(draft.get(key))]
    price = draft['price_aud_estimate']
    folder = args.drafts.resolve()
    shown = folder.relative_to(ROOT).as_posix() if folder.is_relative_to(ROOT) else str(folder)
    print(f"Draft saved: {shown}/{handle}.json (status: draft)")
    print(f"  {draft['product']}")
    print(f"  Found: {', '.join(found) or 'nothing much'}; {len(draft['certificates_claimed'])} certificate claim(s); "
          f"{len(draft['platform_badges'])} badge(s); {len(draft['image_urls']) + len(draft['image_files'])} image(s)")
    if isinstance(price, dict):
        unit = f" {price['unit']}" if is_stated(price.get('unit')) else ''
        print(f"  Price estimate: A${price['with_gst_min']:.2f} to A${price['with_gst_max']:.2f} incl. GST{unit} (estimate, not final)")
    else:
        print(f'  Price: {price}')
    print(f"  Not stated: {', '.join(draft['not_stated']) or 'nothing'}")
    print(f"  Red flags: {len(flags)}" + ''.join(f'\n    - {flag}' for flag in flags))
    print(f'  LLM: {llm_note}')
    print(f'Next: read {shown}/{handle}.verify.md, check the claims, then run: py tools/approve.py {handle}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
