"""Check the catalogue before publishing.

    py tools/check-products.py           # Windows
    python3 tools/check-products.py      # Mac or Linux
    py tools/check-products.py --strict  # treat warnings as failures too

Errors (exit code 1): a secret key anywhere in the repo or site, a missing field, or an unknown status.
Warnings: a live product with no way to buy, a Stripe price that differs from price_aud, a link that
isn't https, and other things worth a second look.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fi_products import (  # noqa: E402
    PRODUCT_STATUSES, PRODUCTS, ROOT, SECRET_PATTERNS, find_secrets, is_https, is_stated, is_stripe_link,
    label, load_products, parse_shopify_buy_button,
)

REQUIRED_TEXT = ('handle', 'status', 'product', 'category', 'maker', 'country', 'ships_from', 'material', 'photo_url',
                 'story_en', 'price_unit', 'delivery_estimate')
TEXT_SUFFIXES = {'.html', '.js', '.mjs', '.cjs', '.css', '.json', '.csv', '.md', '.txt', '.py', '.svg', '.yml', '.yaml', '.sql'}
SKIP_DIRS = {'.git', 'node_modules', '.vite', '__pycache__', 'inbox'}


def check_product(product: dict) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    if not isinstance(product, dict):
        return ['is not a product object'], []
    if find_secrets(product):
        errors.append(f'contains what looks like a secret key ({", ".join(find_secrets(product))}); remove it now and rotate the key')
    for key in REQUIRED_TEXT:
        if not isinstance(product.get(key), str) or not product[key].strip():
            errors.append(f'{key} is missing (write "not stated" if the source does not say); the site leaves this product out')
    status = product.get('status')
    if status not in PRODUCT_STATUSES:
        errors.append(f'status "{status}" must be one of {", ".join(PRODUCT_STATUSES)}')

    links = {'maker_url': product.get('maker_url'), 'shopify_url': product.get('shopify_url'), 'stripe_link': product.get('stripe_link')}
    for index, check in enumerate(product.get('certificates') or []):
        if isinstance(check, dict):
            links[f'certificate {index + 1} link'] = check.get('link')
    for name, value in links.items():
        if value and not is_https(value):
            warnings.append(f'{name} is not an https link: {value}')
    if product.get('stripe_link') and is_https(product['stripe_link']) and not is_stripe_link(product['stripe_link']):
        warnings.append('stripe_link is not a Stripe Payment Link (https://buy.stripe.com/...), so the site ignores it')

    snippet = product.get('shopify_buy_button') or ''
    embed = parse_shopify_buy_button(snippet)
    if snippet and not embed:
        warnings.append("shopify_buy_button can't be read (store, storefront token or product id missing); the site falls back to the next option")
    if snippet and 'sdks.shopifycdn.com' not in snippet:
        warnings.append("shopify_buy_button doesn't look like Shopify's own snippet")

    has_buy = bool(embed) or is_https(product.get('shopify_url')) or is_stripe_link(product.get('stripe_link'))
    if status == 'live' and not has_buy:
        warnings.append('is live but has no buy option, so it shows "Request a quote"')
    if status == 'live' and product.get('sample'):
        errors.append("is a sample and can't be live")
    if product.get('sample') and has_buy:
        errors.append('is a sample but has checkout links; samples can never be bought')

    stripe_price = product.get('stripe_price_aud')
    price = product.get('price_aud')
    if product.get('stripe_link') and stripe_price in (None, ''):
        warnings.append("has a Stripe link but no stripe_price_aud, so its price can't be compared")
    if stripe_price not in (None, '') and isinstance(price, (int, float)) and isinstance(stripe_price, (int, float)):
        if abs(stripe_price - price) > 0.005:
            warnings.append(f'Stripe charges A${stripe_price:g} but the page says A${price:g}')
    elif stripe_price not in (None, '') and not is_stated(price):
        warnings.append(f'Stripe charges A${stripe_price} but price_aud is not stated')

    if status in ('draft', 'rejected'):
        warnings.append(f"is {status}, so the shop doesn't list it")
    return errors, warnings


def scan_for_secrets(root: Path) -> list[str]:
    """Secret-looking strings anywhere in the repo's text files (.env files are ignored by git and skipped)."""
    hits = []
    for path in root.rglob('*'):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES or path.name.startswith('.env'):
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(root).parts):
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except (UnicodeDecodeError, OSError):
            continue
        for pattern in SECRET_PATTERNS:
            for match in pattern.finditer(text):
                hits.append(f'{path.relative_to(root)}: {match.group(0)[:12]}...')
    return hits


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Check products.json before publishing.')
    parser.add_argument('--products', type=Path, default=PRODUCTS, help='catalogue to check (default: dist/data/products.json)')
    parser.add_argument('--root', type=Path, default=ROOT, help='folder to scan for secret keys (default: the repo)')
    parser.add_argument('--strict', action='store_true', help='fail on warnings too')
    args = parser.parse_args(argv)

    products = load_products(args.products)
    error_count = warning_count = 0
    handles = set()
    for index, product in enumerate(products):
        errors, warnings = check_product(product)
        handle = product.get('handle') if isinstance(product, dict) else None
        if handle in handles:
            errors.append('handle is used twice')
        handles.add(handle)
        if errors or warnings:
            print(f'{label(product, index)}:')
            for message in errors:
                print('  ERROR  ', message)
            for message in warnings:
                print('  warning', message)
        error_count += len(errors)
        warning_count += len(warnings)

    secrets = scan_for_secrets(args.root)
    if secrets:
        print('\nSecret keys found in the repo. Remove them, then rotate each key in Stripe or Shopify:')
        for hit in secrets:
            print('  ERROR  ', hit)
        error_count += len(secrets)

    live = sum(1 for product in products if isinstance(product, dict) and product.get('status') == 'live')
    print(f'\nChecked {len(products)} product(s), {live} live: {error_count} error(s), {warning_count} warning(s).')
    return 1 if error_count or (args.strict and warning_count) else 0


if __name__ == '__main__':
    sys.exit(main())
