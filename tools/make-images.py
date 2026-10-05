"""Make the shop images for one product.

    py tools/make-images.py <handle>

1. Saves the product's source photos into data/drafts/<handle>/source/, for reference only (never published).
   One request per photo, robots.txt respected, nothing retried if a site says no.
2. If photo_permission is "yes" (the maker allowed it in writing): removes the background with rembg, adds a soft
   shadow and centres the product on #F6F2EA, upscaling small photos. Writes, in dist/assets/products/:
     <handle>-2000.jpg   2000 x 2000, for Shopify
     <handle>.webp       1200 x 1200, under 300 KB, for the site
3. Otherwise it writes a placeholder card, <handle>-card.svg. An AI render is optional: --render-from <file> (made
   anywhere) or --ai-render (OpenRouter, needs OPENROUTER_API_KEY in .env). A render always carries a visible
   "Render" label, and it is only published after a person confirms it looks like the real product.
4. Writes alt text from the product facts and points the product (and its draft) at the new image.

The first run with rembg downloads the U2-Net background-removal model (about 176 MB, Apache-2.0) once.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import mimetypes
import shutil
import sys
import time
import urllib.robotparser
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fi_extract import HEADERS, USER_AGENT  # noqa: E402
from fi_images import (alt_text, placeholder_card, remove_background, save_master, save_web, site_photo,  # noqa: E402
                       stamp_render_label, studio_image)
from fi_products import DRAFTS, PRODUCTS, ROOT, is_https, load_env, load_products, save_products, today  # noqa: E402

ASSETS = ROOT / 'dist' / 'assets' / 'products'
IMAGE_TYPES = ('.jpg', '.jpeg', '.png', '.webp')


def robots_ok(url: str, session, cache: dict) -> bool:
    import requests
    parts = urlparse(url)
    if parts.netloc not in cache:
        try:
            response = session.get(f'{parts.scheme}://{parts.netloc}/robots.txt', headers=HEADERS, timeout=15)
        except requests.RequestException:
            cache[parts.netloc] = None  # no robots.txt to read: treated as allowed, like a browser
        else:
            if response.status_code in (401, 403):
                cache[parts.netloc] = False
            elif response.status_code >= 400:
                cache[parts.netloc] = None
            else:
                rules = urllib.robotparser.RobotFileParser()
                rules.parse(response.text.splitlines())
                cache[parts.netloc] = rules
    rules = cache[parts.netloc]
    return rules is None or (rules is not False and rules.can_fetch(USER_AGENT, url))


def save_sources(draft: dict, folder: Path, session=None, pause: float = 1.0) -> tuple[list[Path], list[str]]:
    """Saves the draft's photos for reference. Photos saved with a page (image_files) are copied; links are fetched once each."""
    import requests
    session = session or requests.Session()
    folder.mkdir(parents=True, exist_ok=True)
    saved, notes, cache = [], [], {}
    seen = {hashlib.sha1(path.read_bytes()).hexdigest() for path in folder.glob('*') if path.is_file()}
    for index, file in enumerate(draft.get('image_files', [])[:12], start=1):
        source = Path(file)
        if source.is_file() and source.suffix.lower() in IMAGE_TYPES:
            target = folder / f'file-{index:02d}{source.suffix.lower()}'
            if not target.exists():
                shutil.copy2(source, target)
            saved.append(target)
    fetched = 0
    for index, url in enumerate(draft.get('image_urls', [])[:12], start=1):
        if not is_https(url):
            continue
        suffix = Path(urlparse(url).path).suffix.lower()
        target = folder / f'{index:02d}{suffix if suffix in IMAGE_TYPES else ".jpg"}'
        if target.exists():
            saved.append(target)
            continue
        if not robots_ok(url, session, cache):
            notes.append(f'{url}: robots.txt asks bots not to fetch it, so it was skipped')
            continue
        if fetched:
            time.sleep(pause)
        fetched += 1
        try:
            response = session.get(url, headers={**HEADERS, 'Accept': 'image/avif,image/webp,image/*;q=0.8'}, timeout=30)
        except requests.RequestException as error:
            notes.append(f'{url}: not saved ({error.__class__.__name__})')
            continue
        if response.status_code != 200 or not response.headers.get('Content-Type', '').startswith('image/'):
            notes.append(f'{url}: not saved (HTTP {response.status_code})')
            continue
        digest = hashlib.sha1(response.content).hexdigest()
        if len(response.content) < 5000:
            notes.append(f'{url}: skipped, too small to be a product photo')
            continue
        if digest in seen:
            continue  # the same photo under another link
        seen.add(digest)
        target.write_bytes(response.content)
        saved.append(target)
    return sorted(set(saved)), notes  # links first (01, 02...), then photos saved with a page (file-01...)


def shown(path: Path) -> str:
    path = path.resolve()
    return path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else str(path)


def ask_yes_no(question: str, given) -> str:
    if given:
        return given
    if not sys.stdin.isatty():
        return 'no'  # nobody to ask, so nothing is published
    answer = ''
    while answer not in ('yes', 'no'):
        answer = input(f'{question} (yes/no): ').strip().lower()
    return answer


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Make the shop images for one product.')
    parser.add_argument('handle')
    parser.add_argument('--source', type=Path, help='use this photo, for example one the maker emailed with permission')
    parser.add_argument('--image', type=int, default=1, help='which saved source photo to use (default: the first)')
    parser.add_argument('--no-download', action='store_true', help="don't fetch the source photos")
    parser.add_argument('--render-from', type=Path, help='an AI render made elsewhere (used only without photo permission)')
    parser.add_argument('--ai-render', action='store_true',
                        help='make a render with OpenRouter. Sends the reference photo and the product facts. Needs OPENROUTER_API_KEY in .env')
    parser.add_argument('--render-looks-right', choices=('yes', 'no'), help='your answer to "does the render look like the real product?"')
    parser.add_argument('--no-rembg', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--drafts', type=Path, default=DRAFTS, help=argparse.SUPPRESS)
    parser.add_argument('--products', type=Path, default=PRODUCTS, help=argparse.SUPPRESS)
    parser.add_argument('--assets', type=Path, default=ASSETS, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    handle = args.handle

    draft_path = args.drafts / f'{handle}.json'
    draft = json.loads(draft_path.read_text(encoding='utf-8')) if draft_path.exists() else None
    products = load_products(args.products) if args.products.exists() else []
    product = next((item for item in products if item.get('handle') == handle), None)
    if product is None and draft is None:
        print(f'No draft or product called {handle}. Run tools/add-product.py first.')
        return 1
    if product is not None and product.get('sample'):
        print(f'{handle} is a sample product. Its illustration is drawn by hand, so there is nothing to make.')
        return 1
    record = product if product is not None else draft
    permission = record.get('photo_permission', 'no')
    category = record.get('category', '')
    work = args.drafts / handle
    print(f"Images for {record.get('product', handle)}")

    sources = sorted(path for path in (work / 'source').glob('*') if path.suffix.lower() in IMAGE_TYPES) if (work / 'source').exists() else []
    if draft is not None and not args.no_download:
        sources, notes = save_sources(draft, work / 'source')
        for note in notes:
            print(f'  {note}')
    if sources:
        print(f'  Source photos: {len(sources)} saved in {shown(work / "source")}/ for reference (never published)')
    print(f'  Photo permission: {permission}')

    from PIL import Image
    kind = 'placeholder'
    render_ok = bool(record.get('photo_is_render'))
    if permission == 'yes':
        source = args.source or (sources[args.image - 1] if 0 < args.image <= len(sources) else None)
        if source is None or not Path(source).is_file():
            print('  No photo to use. Give one with --source <file>, or check that the draft has image links.')
            return 1
        with Image.open(source) as opened:
            cutout, method = remove_background(opened, use_rembg=not args.no_rembg)
        master = studio_image(cutout, category)
        size = save_master(master, args.assets / f'{handle}-2000.jpg')
        quality, web_size = save_web(master, args.assets / f'{handle}.webp')
        print(f'  Background removed with {method}')
        print(f'  Wrote {shown(args.assets / f"{handle}-2000.jpg")} (2000 x 2000, {size // 1000} KB) for Shopify')
        print(f'  Wrote {shown(args.assets / f"{handle}.webp")} (1200 x 1200, {web_size // 1000} KB, quality {quality}) for the site')
        render_ok = False
    else:
        for old in (args.assets / f'{handle}.webp', args.assets / f'{handle}-2000.jpg'):
            if old.exists():
                old.unlink()  # permission was withdrawn: the maker's photo must not stay online
                print(f'  Removed {shown(old)}, because photo permission is not "yes"')
        card = args.assets / f'{handle}-card.svg'
        card.parent.mkdir(parents=True, exist_ok=True)
        card.write_text(placeholder_card(record), encoding='utf-8')
        print(f'  Wrote {shown(card)} (placeholder card)')
        if args.render_from or args.ai_render:
            if args.render_from:
                if not args.render_from.is_file():
                    print(f'  {args.render_from} does not exist.')
                    return 1
                with Image.open(args.render_from) as opened:
                    picture = opened.copy()
            else:
                key = load_env().get('OPENROUTER_API_KEY', '')
                reference = args.source or (sources[args.image - 1] if 0 < args.image <= len(sources) else None)
                if not key:
                    print('  An AI render needs OPENROUTER_API_KEY in .env. Or make one elsewhere and use --render-from <file>.')
                    return 1
                if reference is None:
                    print('  An AI render needs a reference photo of the real product. None was saved.')
                    return 1
                from fi_llm import render_image
                mime = mimetypes.guess_type(str(reference))[0] or 'image/jpeg'
                made = render_image(record, Path(reference).read_bytes(), mime, key, load_env().get('OPENROUTER_IMAGE_MODEL', ''))
                with Image.open(io.BytesIO(made)) as opened:
                    picture = opened.copy()
            cutout, method = remove_background(picture, use_rembg=not args.no_rembg)
            render = stamp_render_label(studio_image(cutout, category))
            check = work / 'render-check.webp'
            save_web(render, check)
            answer = ask_yes_no(f'  Open {shown(check)}. Does it look like the real product: same shape, proportions and finish?',
                                args.render_looks_right)
            if answer == 'yes':
                save_web(render, args.assets / f'{handle}-render.webp')
                render_ok = True
                print(f'  Wrote {shown(args.assets / f"{handle}-render.webp")} with a visible "Render" label')
            else:
                render_ok = False
                print('  Render not published. The placeholder card stays.')

    photo_url, kind = site_photo(handle, permission, args.assets, render_ok)
    alt = alt_text(record, kind)
    for target in (product, draft):
        if target is not None:
            target.update({'photo_url': photo_url, 'photo_alt': alt, 'photo_is_render': kind == 'render'})
    if product is not None:
        save_products(products, args.products)
    if draft is not None:
        draft['images'] = {'made': today(), 'kind': kind, 'sources': [path.name for path in sources]}
        draft_path.write_text(json.dumps(draft, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'  Shop image: {photo_url} ({kind})')
    print(f'  Alt text: {alt}')
    if product is None:
        print(f'Next: py tools/approve.py {handle}. It will use this image.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
