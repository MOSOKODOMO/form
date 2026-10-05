"""Fill checkout links in the catalogue from a spreadsheet.

Paste links into data/checkout-links.csv (columns: handle, shopify_url, stripe_link and,
optionally, stripe_price_aud), then run:

    py tools/apply-links.py            # Windows
    python3 tools/apply-links.py       # Mac or Linux
    py tools/apply-links.py --dry-run  # show what would change without saving

A blank cell leaves the product's current value alone. Write "none" in a cell to clear it.
Handles that don't match a product are printed, and nothing is saved for them.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fi_products import DATA, PRODUCTS, is_https, is_stripe_link, load_products, save_products  # noqa: E402

LINKS = DATA / 'checkout-links.csv'
FIELDS = ('shopify_url', 'stripe_link', 'stripe_price_aud')
CLEAR = {'none', 'clear', '-'}


def parse_cell(field: str, raw: str):
    value = raw.strip()
    if value.lower() in CLEAR:
        return ''
    if field == 'stripe_price_aud':
        number = float(value.replace('A$', '').replace('$', '').replace(',', ''))
        if number <= 0:
            raise ValueError('must be more than zero')
        return int(number) if number.is_integer() else round(number, 2)
    return value


def link_problem(field: str, value, product: dict) -> str | None:
    if value == '':
        return None
    if product.get('sample'):
        return 'is a sample product, and samples can never be bought'
    if field in ('shopify_url', 'stripe_link') and not is_https(value):
        return f'{field} is not an https link'
    if field == 'stripe_link' and not is_stripe_link(value):
        return 'stripe_link is not a Stripe Payment Link (https://buy.stripe.com/...)'
    return None


def apply_links(products: list[dict], rows: list[dict]) -> tuple[list[str], list[str], list[str]]:
    """Updates products in place. Returns (changes, unmatched handles, problems)."""
    by_handle = {product.get('handle'): product for product in products if isinstance(product, dict)}
    changes, unmatched, problems = [], [], []
    for line, row in rows:
        handle = (row.get('handle') or '').strip()
        if not handle:
            continue
        product = by_handle.get(handle)
        if product is None:
            unmatched.append(f'line {line}: {handle}')
            continue
        for field in FIELDS:
            raw = row.get(field)
            if raw is None or not raw.strip():
                continue
            try:
                value = parse_cell(field, raw)
            except ValueError as error:
                problems.append(f'line {line}, {handle}: {field} "{raw.strip()}" is not a price ({error}), skipped')
                continue
            problem = link_problem(field, value, product)
            if problem:
                problems.append(f'line {line}, {handle}: {problem}, skipped')
                continue
            if product.get(field) != value:
                before = product.get(field)
                product[field] = value
                changes.append(f'{handle}: {field} {before!r} -> {value!r}')
    return changes, unmatched, problems


def read_rows(path: Path) -> list[tuple[int, dict]]:
    with open(path, newline='', encoding='utf-8-sig') as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or 'handle' not in [name.strip().lower() for name in reader.fieldnames]:
            raise SystemExit(f'{path} needs a "handle" column (columns: handle, shopify_url, stripe_link, stripe_price_aud)')
        rows = []
        for line, row in enumerate(reader, start=2):
            rows.append((line, {(key or '').strip().lower(): value for key, value in row.items()}))
        return rows


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Fill checkout links in products.json from a CSV.')
    parser.add_argument('--csv', type=Path, default=LINKS, help='spreadsheet to read (default: data/checkout-links.csv)')
    parser.add_argument('--products', type=Path, default=PRODUCTS, help='catalogue to update (default: dist/data/products.json)')
    parser.add_argument('--dry-run', action='store_true', help='show the changes without saving')
    args = parser.parse_args(argv)

    products = load_products(args.products)
    changes, unmatched, problems = apply_links(products, read_rows(args.csv))

    for change in changes:
        print('  updated', change)
    if not changes:
        print('No changes.')
    if unmatched:
        print('\nThese handles match no product in products.json:')
        for item in unmatched:
            print('  ', item)
    if problems:
        print('\nSkipped:')
        for item in problems:
            print('  ', item)
    if changes and not args.dry_run:
        save_products(products, args.products)
        print(f'\nSaved {len(changes)} change(s) to {args.products}. Run tools/check-products.py next.')
    elif changes:
        print('\nDry run: nothing saved.')
    return 1 if unmatched or problems else 0


if __name__ == '__main__':
    sys.exit(main())
