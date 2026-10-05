"""Approve a draft and add it to the catalogue with status "approved". Setting a product live stays a manual edit.

    py tools/approve.py <handle>

It asks you to confirm the price, photo permission and checkout link, lets you record the claims you checked
(company registration and each certificate), shows the early FI Score, and only then adds the product to
dist/data/products.json. Every question can also be answered with a flag, e.g. --price 39 --photo-permission no.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fi_products import (CATEGORY_IDS, DRAFTS, NOT_STATED, PRODUCTS, ROOT, is_https, is_stated, is_stripe_link,  # noqa: E402
                         load_products, save_products, today)
from fi_images import alt_text, site_photo  # noqa: E402
from fi_score import score  # noqa: E402

ASSETS = ROOT / 'dist' / 'assets' / 'products'
CHECK_STATES = ('verified', 'failed', 'claimed')


class Asker:
    def __init__(self, assume_defaults: bool):
        self.assume = assume_defaults

    def __call__(self, question: str, default: str = '', given=None, check=None) -> str:
        if given is not None:
            answer = str(given).strip()
            problem = check(answer) if check else None
            if problem:
                raise SystemExit(f'{question}: {problem}')
            return answer
        while True:
            if self.assume:
                answer = default
            else:
                answer = input(f'{question}{f" [{default}]" if default else ""}: ').strip() or default
            problem = check(answer) if check else None
            if not problem:
                return answer
            if self.assume:
                raise SystemExit(f'{question}: {problem}')
            print(f'  {problem}')


def price_check(answer: str):
    if answer.lower() == NOT_STATED:
        return None
    try:
        return None if float(answer) > 0 else 'must be more than zero'
    except ValueError:
        return 'write a number like 39 or 39.50, or "not stated"'


def as_price(answer: str):
    if not answer or answer.lower() == NOT_STATED:
        return NOT_STATED
    number = round(float(answer), 2)
    return int(number) if number.is_integer() else number


def optional_link(kind: str):
    def check(answer: str):
        if not answer:
            return None
        if kind == 'stripe' and not is_stripe_link(answer):
            return 'a Stripe Payment Link looks like https://buy.stripe.com/...'
        if not is_https(answer):
            return 'must be an https link'
        return None
    return check


def site_certificates(draft: dict) -> list[dict]:
    registration = draft.get('company_registration', {})
    entries = [{'name': 'Company registration', 'status': registration.get('status', NOT_STATED) if is_stated(draft.get('maker')) else NOT_STATED,
                'link': registration.get('check_link', '') if registration.get('status') == 'verified' else ''}]
    for claim in draft.get('certificates_claimed', []):
        entries.append({'name': claim['name'], 'status': claim.get('status', 'claimed'),
                        'link': claim.get('check_link', '') if claim.get('status') == 'verified' else '',
                        'number': claim.get('number', NOT_STATED), 'issuer': claim.get('issuer', NOT_STATED)})
    return entries


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Approve a draft and add it to products.json with status "approved".')
    parser.add_argument('handle')
    parser.add_argument('--category', choices=CATEGORY_IDS)
    parser.add_argument('--price', help='final price in AUD incl. GST, or "not stated"')
    parser.add_argument('--local-price', help='Australian retail price for a similar product, for the value score')
    parser.add_argument('--photo-permission', choices=('yes', 'no'))
    parser.add_argument('--permission-note', help='where the written permission is kept')
    parser.add_argument('--shopify-url')
    parser.add_argument('--stripe-link')
    parser.add_argument('--stripe-price')
    parser.add_argument('--registration', choices=CHECK_STATES, help='company registration result')
    parser.add_argument('--registration-link', help='where you confirmed the registration')
    parser.add_argument('--yes', action='store_true', help='accept the suggested answers without asking')
    parser.add_argument('--drafts', type=Path, default=DRAFTS, help=argparse.SUPPRESS)
    parser.add_argument('--products', type=Path, default=PRODUCTS, help=argparse.SUPPRESS)
    parser.add_argument('--assets', type=Path, default=ASSETS, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    path = args.drafts / f'{args.handle}.json'
    if not path.exists():
        print(f'No draft called {args.handle} in {args.drafts}. Run tools/add-product.py first.')
        return 1
    draft = json.loads(path.read_text(encoding='utf-8'))
    ask = Asker(args.yes)
    print(f"Approving: {draft['product']}\n  Maker: {draft['maker']}\n  Source: {draft['source_url']}")
    for flag in draft.get('red_flags', []):
        print(f'  Red flag: {flag}')
    if draft.get('not_stated'):
        print(f"  Not stated: {', '.join(draft['not_stated'])}")

    category_default = draft['category'] if draft.get('category') in CATEGORY_IDS else ''
    category = ask(f"Category ({', '.join(CATEGORY_IDS)})", category_default, args.category,
                   lambda answer: None if answer in CATEGORY_IDS else f"choose one of {', '.join(CATEGORY_IDS)}")

    estimate = draft.get('price_aud_estimate')
    unit = estimate['unit'] if isinstance(estimate, dict) else NOT_STATED
    suggested = f"{estimate['with_gst_max']:.2f}" if isinstance(estimate, dict) else NOT_STATED
    price = as_price(ask(f'Final price in AUD incl. GST{" " + unit if is_stated(unit) else ""} (the estimate is a starting point)', suggested, args.price, price_check))
    local_answer = ask('Local retail price for a similar product, incl. GST (Enter to skip)', '', args.local_price,
                       lambda answer: None if not answer else price_check(answer))
    local_price = as_price(local_answer) if local_answer else None

    permission = ask('Has the maker given written permission to use their photos? (yes/no)', 'no', args.photo_permission,
                     lambda answer: None if answer in ('yes', 'no') else 'answer yes or no')
    permission_note = ''
    if permission == 'yes':
        permission_note = ask('Where is that permission kept (for example, the email and its date)?', '', args.permission_note,
                              lambda answer: None if answer else 'say where the written permission is, so it can be found later')

    shopify_url = ask('Shopify product URL (Enter if none yet)', '', args.shopify_url, optional_link('https'))
    stripe_link = ask('Stripe Payment Link (Enter if none yet)', '', args.stripe_link, optional_link('stripe'))
    stripe_price = ''
    if stripe_link:
        stripe_price = as_price(ask('Price the Stripe link charges, in AUD', str(price) if is_stated(price) else '', args.stripe_price, price_check))

    registration = draft.setdefault('company_registration', {'status': 'claimed', 'check_link': ''})
    if is_stated(draft.get('maker')):
        result = ask(f"Company registration for {draft['maker']}: verified, failed or claimed (not checked yet)",
                     registration.get('status', 'claimed'), args.registration, lambda answer: None if answer in CHECK_STATES else 'answer verified, failed or claimed')
        registration['status'] = result
        if result == 'verified':
            registration['check_link'] = ask('Link where you confirmed it', registration.get('check_link', ''), args.registration_link,
                                             lambda answer: None if is_https(answer) else 'paste the https link of the register page you checked')
    for claim in draft.get('certificates_claimed', []):
        if args.yes:
            continue  # unchecked claims stay "claimed"
        result = ask(f"{claim['name']} ({claim['number']}): verified, failed or claimed", claim.get('status', 'claimed'),
                     check=lambda answer: None if answer in CHECK_STATES else 'answer verified, failed or claimed')
        claim['status'] = result
        if result == 'verified':
            claim['check_link'] = ask('Link where you confirmed it', claim.get('check_link', ''),
                                      check=lambda answer: None if is_https(answer) else 'paste the https link of the issuer page you checked')

    certificates = site_certificates(draft)
    result = score(registration=registration.get('status', NOT_STATED), badges=draft.get('platform_badges', []), audit_verified=False,
                   years=draft.get('maker_years_in_business'), certificates=certificates, category=category,
                   price_aud=price, local_price_aud=local_price, reviews=[])
    print(f"\nEarly FI Score: {result['total']} out of 100 (based on our research; no reviews yet)")
    for part, points in result['parts'].items():
        print(f"  {part.replace('_', ' ')}: {points}  {' '.join(result['notes'][part])}")

    confirm = ask('Add it to the catalogue as approved? (yes/no)', 'yes' if args.yes else '', None,
                  lambda answer: None if answer in ('yes', 'no') else 'answer yes or no')
    if confirm != 'yes':
        print('Not approved. The draft is unchanged.')
        return 1

    # The image tools/make-images.py made: the maker's photo (with permission), a render a person checked, or a placeholder card.
    photo_url, photo_kind = site_photo(draft['handle'], permission, args.assets, render_ok=bool(draft.get('photo_is_render')))
    product = {
        'handle': draft['handle'], 'sample': False, 'status': 'approved', 'product': draft['product'], 'category': category,
        'maker': draft['maker'], 'maker_url': draft['maker_url'] if is_https(draft.get('maker_url')) else '',
        'country': draft['country'], 'ships_from': NOT_STATED, 'material': draft['material'],
        'finishes': draft['finishes'], 'sizes': draft['sizes'], 'price_aud': price, 'price_unit': unit,
        'delivery_estimate': NOT_STATED, 'fi_score': result['total'], 'certificates': certificates,
        'photo_url': photo_url, 'photo_is_render': photo_kind == 'render',
        'story_en': NOT_STATED, 'shopify_url': shopify_url, 'shopify_buy_button': '', 'stripe_link': stripe_link,
        'stripe_price_aud': stripe_price,
        'city': draft.get('city', NOT_STATED), 'source_url': draft['source_url'], 'source_site': draft.get('source_site', NOT_STATED),
        'moq': draft.get('moq', NOT_STATED), 'lead_time': draft.get('lead_time', NOT_STATED),
        'maker_years_in_business': draft.get('maker_years_in_business', NOT_STATED), 'platform_badges': draft.get('platform_badges', []),
        'photo_permission': permission, 'photo_permission_note': permission_note, 'local_price_aud': local_price if local_price is not None else '',
        'score_parts': result['parts'], 'score_notes': result['notes'], 'score_checked': today(), 'reviews': [], 'approved_on': today(),
    }
    product['photo_alt'] = alt_text(product, photo_kind)
    products = load_products(args.products)
    products = [existing for existing in products if existing.get('handle') != product['handle']] + [product]
    save_products(products, args.products)

    draft.update({'status': 'approved', 'approved_on': today(), 'approved_price_aud': price, 'photo_permission': permission,
                  'photo_permission_note': permission_note, 'shopify_url': shopify_url, 'stripe_link': stripe_link})
    path.write_text(json.dumps(draft, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f"\nAdded {product['handle']} to {args.products} with status approved.")
    if photo_kind == 'placeholder':
        print(f"Photo: a placeholder for now. Run py tools/make-images.py {product['handle']} to make the card (or the photo, once you have permission).")
    print('Next: py tools/check-products.py. The shop shows it with "Request a quote" until you set "status": "live" by hand.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
