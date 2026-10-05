"""Optional: asks an LLM through OpenRouter to read page text into draft fields.

Used only when OPENROUTER_API_KEY is set in .env. It only fills fields the rules left as "not stated",
and every value it returns must appear in the page text, or it is thrown away.
"""
from __future__ import annotations

import json
import re

from fi_extract import grounded
from fi_products import NOT_STATED

ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
DEFAULT_MODEL = 'anthropic/claude-haiku-4.5'
SYSTEM = ('You read supplier product pages. Extract facts into JSON with these keys: product, maker, country, city, material, '
          'finishes (list), sizes (list), moq, price_min_usd, price_max_usd, price_unit, lead_time, '
          'certificates_claimed (list of {name, number, issuer}), platform_badges (list). '
          'Copy every value exactly as written in the page text. Do not guess, translate, convert units or currencies, or add anything '
          'the text does not say. If the page does not state a value, write "not stated". Return only the JSON object.')


def ask(text: str, api_key: str, model: str = '', timeout: int = 90) -> dict:
    import requests
    response = requests.post(ENDPOINT, timeout=timeout, headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json',
                                                                 'X-Title': 'FABINT add-product'},
                             json={'model': model or DEFAULT_MODEL, 'temperature': 0,
                                   'messages': [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': 'PAGE TEXT:\n' + text[:15000]}]})
    response.raise_for_status()
    content = response.json()['choices'][0]['message']['content'] or ''
    match = re.search(r'\{[\s\S]*\}', content)
    return json.loads(match.group(0)) if match else {}


def fill_gaps(draft: dict, answer: dict, source: str) -> list[str]:
    """Copies grounded answers into fields that are still "not stated". Returns the fields it filled."""
    filled = []
    for key in ('product', 'maker', 'country', 'city', 'material', 'moq', 'lead_time', 'price_unit'):
        value = answer.get(key)
        if draft.get(key) == NOT_STATED and isinstance(value, str) and value.strip().lower() not in ('', NOT_STATED) and grounded(value, source):
            draft[key] = value.strip()
            filled.append(key)
    for key in ('finishes', 'sizes'):
        values = answer.get(key)
        if draft.get(key) == [NOT_STATED] and isinstance(values, list):
            kept = [str(value).strip() for value in values if str(value).strip().lower() not in ('', NOT_STATED) and grounded(value, source)]
            if kept:
                draft[key] = kept[:12]
                filled.append(key)
    for key in ('price_min_usd', 'price_max_usd'):
        value = answer.get(key)
        if draft.get(key) == NOT_STATED and isinstance(value, (int, float)) and not isinstance(value, bool) and grounded(value, source):
            draft[key] = value
            filled.append(key)
    known = {claim['name'].lower() for claim in draft.get('certificates_claimed', [])}
    for claim in answer.get('certificates_claimed') or []:
        name = str((claim or {}).get('name', '')).strip()
        if not name or name.lower() in known or not grounded(name, source):
            continue
        number = str(claim.get('number', '')).strip()
        issuer = str(claim.get('issuer', '')).strip()
        draft['certificates_claimed'].append({
            'name': name, 'number': number if number and grounded(number, source) else NOT_STATED,
            'issuer': issuer if issuer and grounded(issuer, source) else NOT_STATED,
            'status': 'claimed', 'check_link': '', 'evidence': f'read by the LLM: "{name}" appears in the page text'})
        known.add(name.lower())
        filled.append(f'certificate {name}')
    for badge in answer.get('platform_badges') or []:
        badge = str(badge).strip()
        if badge and badge not in draft['platform_badges'] and grounded(badge, source):
            draft['platform_badges'].append(badge)
            filled.append(f'badge {badge}')
    return filled
