"""Price estimate in AUD: factory price x usd_to_aud + shipping per unit + packaging, then GST.

It is always labelled an estimate. A person sets the final price when approving the product.
"""
from __future__ import annotations

import re

from fi_products import NOT_STATED, is_stated


def estimate(draft: dict, settings: dict) -> dict | str:
    rate = settings.get('usd_to_aud')
    shipping = settings.get('shipping_per_unit_aud')
    packaging = settings.get('packaging_per_unit_aud')
    gst = settings.get('gst_rate', 0.1)
    if is_stated(draft.get('price_min_aud')):
        low, high, basis = float(draft['price_min_aud']), float(draft.get('price_max_aud') or draft['price_min_aud']), 'the page price in AUD'
    elif is_stated(draft.get('price_min_usd')):
        if not isinstance(rate, (int, float)) or rate <= 0:
            return 'not estimated: set usd_to_aud in data/settings.json'
        low = float(draft['price_min_usd']) * rate
        high = float(draft['price_max_usd'] if is_stated(draft.get('price_max_usd')) else draft['price_min_usd']) * rate
        basis = f"US${draft['price_min_usd']} to US${draft.get('price_max_usd')} x {rate}"
    else:
        return 'not estimated: the page does not state a price in USD or AUD'
    extras = (shipping or 0) + (packaging or 0)
    missing = [name for name, value in (('shipping', shipping), ('packaging', packaging)) if value is None]
    parts = [basis] + [f'{name} A${value}' for name, value in (('shipping', shipping), ('packaging', packaging)) if value is not None]
    note = 'Estimate only, not a final price.'
    if missing:
        note += f" {' and '.join(missing).capitalize()} not set in data/settings.json, so they are not included."
    return {
        'min': round(low + extras, 2), 'max': round(high + extras, 2),
        'with_gst_min': round((low + extras) * (1 + gst), 2), 'with_gst_max': round((high + extras) * (1 + gst), 2),
        'unit': site_unit(draft.get('price_unit')), 'formula': ' + '.join(parts), 'usd_to_aud': rate, 'note': note,
    }


def site_unit(unit) -> str:
    """Turns a page's unit (Piece, Sets, Square Meter...) into the shop's wording (each, per set, per m²)."""
    if not is_stated(unit):
        return NOT_STATED
    word = unit.strip().lower()
    if re.fullmatch(r'pieces?|pcs?|pc\.?|units?|items?', word):
        return 'each'
    if re.fullmatch(r'square ?met(?:er|re)s?|sqm|m2|m²|sq\.? ?m', word):
        return 'per m²'
    if word.endswith('s') and not word.endswith('ss'):
        word = word[:-1]
    return f'per {word}'
