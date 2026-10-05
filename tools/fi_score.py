"""The FI Score out of 100, in four parts: maker check 40, product proof 30, value against local prices 15, buyers' experience 15.

Until a product has buyer reviews, its score is an early score, based on our research only.
Makers never pay for a score or a better rank.
"""
from __future__ import annotations



WEIGHTS = {'maker_check': 40, 'product_proof': 30, 'value': 15, 'buyers': 15}
AUDIT_WORDS = ('Audited', 'Verified Supplier', 'Verified Manufacturer', 'Onsite Check')
CATEGORY_ONLY = {'WaterMark': 'taps', 'WELS': 'taps', 'cUPC': 'taps', 'NSF': 'taps', 'ACS': 'taps', 'KTW': 'taps', 'DVGW': 'taps',
                 'AS/NZS 4020': 'taps', 'AS 4586': 'tiles', 'EN 14411': 'tiles', 'ISO 13006': 'tiles', 'AS 2047': 'windows'}


def maker_check(registration: str, badges: list[str], audit_verified: bool, years) -> tuple[int, list[str]]:
    points, notes = 0, []
    points += {'verified': 20, 'claimed': 6}.get(registration, 0)
    notes.append({'verified': 'Company registration verified on the official register (+20).',
                  'claimed': 'Company named but its registration is not checked yet (+6).',
                  'failed': 'Company registration check failed (+0).'}.get(registration, 'No company registration found (+0).'))
    if any(word in badge for badge in badges for word in AUDIT_WORDS):
        points += 10 if audit_verified else 4
        notes.append('Third-party audit verified (+10).' if audit_verified else 'Audit badge shown on the platform, not checked yet (+4).')
    if isinstance(years, (int, float)):
        bonus = 10 if years >= 10 else 7 if years >= 5 else 4 if years >= 2 else 0
        points += bonus
        notes.append(f'{years} years in business (+{bonus}).')
    else:
        notes.append('Years in business not stated (+0).')
    return min(points, WEIGHTS['maker_check']), notes


def product_proof(certificates: list[dict], category: str) -> tuple[int, list[str]]:
    points, notes = 0, []
    for certificate in certificates:
        if certificate.get('name') == 'Company registration':
            continue
        home = CATEGORY_ONLY.get(certificate.get('name'))
        if home and home != category:
            notes.append(f"{certificate['name']} doesn't apply to {category}, so it doesn't count.")
            continue
        status = certificate.get('status')
        change = {'verified': 12, 'claimed': 3, 'failed': -8}.get(status, 0)
        points += change
        notes.append(f"{certificate['name']}: {status} ({'+' if change >= 0 else ''}{change}).")
    if not notes:
        notes.append('No product certificates stated (+0).')
    return max(0, min(points, WEIGHTS['product_proof'])), notes


def value(price_aud, local_price_aud) -> tuple[int, list[str]]:
    if not (isinstance(price_aud, (int, float)) and isinstance(local_price_aud, (int, float)) and local_price_aud > 0):
        return 0, ['Not compared with a local price yet (+0).']
    saving = 1 - price_aud / local_price_aud
    points = round(WEIGHTS['value'] * min(max(saving, 0), 0.5) / 0.5)
    return points, [f'{saving:.0%} under the local price of A${local_price_aud:g} (+{points}). Full marks at 50% under.']


def buyers(reviews: list) -> tuple[int, list[str]]:
    if not reviews:
        return 0, ['No reviews yet.']
    ratings = [review['rating'] for review in reviews if isinstance(review, dict) and isinstance(review.get('rating'), (int, float))]
    if not ratings:
        return 0, ['No rated reviews yet.']
    average = sum(ratings) / len(ratings)
    points = round(WEIGHTS['buyers'] * max(0, min(average, 5)) / 5)
    return points, [f'{len(ratings)} review(s), average {average:.1f} out of 5 (+{points}).']


def score(*, registration: str, badges: list[str], audit_verified: bool, years, certificates: list[dict], category: str,
          price_aud, local_price_aud=None, reviews=None) -> dict:
    parts, notes = {}, {}
    parts['maker_check'], notes['maker_check'] = maker_check(registration, badges, audit_verified, years)
    parts['product_proof'], notes['product_proof'] = product_proof(certificates, category)
    parts['value'], notes['value'] = value(price_aud, local_price_aud)
    parts['buyers'], notes['buyers'] = buyers(reviews or [])
    return {'total': sum(parts.values()), 'parts': parts, 'notes': notes, 'early': not reviews}
