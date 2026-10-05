"""Shared helpers for the FI product tools. Standard library only.

The published catalogue is dist/data/products.json (the site loads it as data/products.json).
Working files for the tools live in the top-level data/ folder, which is never published.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRODUCTS = ROOT / 'dist' / 'data' / 'products.json'
DATA = ROOT / 'data'

PRODUCT_STATUSES = ('draft', 'approved', 'live', 'rejected')
NOT_STATED = 'not stated'

# Keys that must never be in the repo or the site: Stripe secret, restricted and webhook keys,
# Shopify Admin API tokens and private keys. Public Stripe Payment Links and Shopify storefront tokens are fine.
SECRET_PATTERNS = [
    re.compile(r'\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{6,}'),
    re.compile(r'\bwhsec_[A-Za-z0-9]{6,}'),
    re.compile(r'\bshp(?:at|ca|pa|ss)_[A-Za-z0-9]{6,}'),
    re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----'),
]


def load_products(path: Path = PRODUCTS) -> list[dict]:
    products = json.loads(Path(path).read_text(encoding='utf-8'))
    if not isinstance(products, list):
        raise ValueError(f'{path} must contain a list of products')
    return products


def save_products(products: list[dict], path: Path = PRODUCTS) -> None:
    Path(path).write_text(json.dumps(products, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def is_https(value) -> bool:
    return isinstance(value, str) and re.fullmatch(r'https://[^\s"\'<>]+', value) is not None


def is_stripe_link(value) -> bool:
    return isinstance(value, str) and re.fullmatch(r'https://buy\.stripe\.com/[A-Za-z0-9_-]+', value) is not None


def is_stated(value) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return True
    return isinstance(value, str) and value.strip() != '' and value.strip().lower() != NOT_STATED


def find_secrets(value) -> list[str]:
    """Every secret-looking string inside value, shortened so the report never repeats a whole key."""
    found = []
    if isinstance(value, str):
        for pattern in SECRET_PATTERNS:
            found += [match.group(0)[:12] + '...' for match in pattern.finditer(value)]
    elif isinstance(value, list):
        for item in value:
            found += find_secrets(item)
    elif isinstance(value, dict):
        for item in value.values():
            found += find_secrets(item)
    return found


def parse_shopify_buy_button(snippet) -> dict | None:
    """Store, public storefront token and product id from a pasted Buy Button snippet, as the site reads them."""
    if not isinstance(snippet, str) or not snippet.strip():
        return None
    domain = re.search(r'domain:\s*[\'"]([a-z0-9][a-z0-9-]*\.myshopify\.com)[\'"]', snippet, re.I)
    token = re.search(r'storefrontAccessToken:\s*[\'"]([a-f0-9]{32})[\'"]', snippet, re.I)
    product = re.search(r'createComponent\(\s*[\'"]product[\'"]\s*,\s*\{[\s\S]*?\bid:\s*\[?\s*[\'"]?(\d+)[\'"]?', snippet)
    if not (domain and token and product):
        return None
    return {'domain': domain.group(1).lower(), 'storefront_access_token': token.group(1), 'product_id': product.group(1)}


def label(product, index: int) -> str:
    handle = product.get('handle') if isinstance(product, dict) else None
    return handle or f'product #{index + 1}'


# Part 2: drafts, settings and the inbox for pages saved by hand.
DRAFTS = DATA / 'drafts'
INBOX = ROOT / 'inbox'
SETTINGS = DATA / 'settings.json'
CATEGORY_IDS = ('handles', 'knobs', 'tiles', 'taps')
# Same columns as Prem's fi-shopify-products-draft.csv.
SHOPIFY_COLUMNS = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value',
                   'Variant SKU', 'Variant Grams', 'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price',
                   'Variant Requires Shipping', 'Variant Taxable', 'Status']
SHOPIFY_TYPES = {'handles': 'Cabinet hardware', 'knobs': 'Cabinet hardware', 'tiles': 'Tiles', 'taps': 'Tapware'}


def load_settings(path: Path = SETTINGS) -> dict:
    return json.loads(Path(path).read_text(encoding='utf-8')) if Path(path).exists() else {}


def load_env(path: Path = ROOT / '.env') -> dict:
    """Reads KEY=VALUE lines from .env (never committed). Values already set in the environment win."""
    import os
    values = {}
    if Path(path).exists():
        for line in Path(path).read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    for key in list(values):
        if os.environ.get(key):
            values[key] = os.environ[key]
    return values


def slugify(text: str, limit: int = 60) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', str(text).lower()).strip('-')
    return slug[:limit].rstrip('-') or 'product'


def today() -> str:
    from datetime import date
    return date.today().isoformat()


def stated_or(value, fallback=NOT_STATED):
    return value if is_stated(value) else fallback
