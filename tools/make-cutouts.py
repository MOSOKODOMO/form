"""Make transparent product cut-outs for the room preview (dist/room.html).

    py tools/make-cutouts.py                      # the handles listed in HANDLES below
    py tools/make-cutouts.py <handle> [<handle>]  # just these products

Each cut-out comes from the product's own studio render in dist/assets/products/ (the images the shop already
shows, labelled as renders). It writes dist/assets/products/cutouts/<handle>.webp (transparent, 720 px at most) and
rebuilds dist/data/room-products.json, which lists what the room preview offers.

Nothing here reads a supplier's page or photo. Needs: py -m pip install pillow "rembg[cpu]" scipy
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fi_images import keep_main_object, remove_background  # noqa: E402
from fi_products import ROOT, is_stated, load_products  # noqa: E402

DIST = ROOT / 'dist'
OUT = DIST / 'assets' / 'products' / 'cutouts'
LIST = DIST / 'data' / 'room-products.json'
MAX_SIDE = 720
# A spread of finishes and shapes that read well on a wall, door or cabinet front.
HANDLES = [
    'yila-matte-black-brass-t-bar',
    'qiansi-knurled-antique-bronze-pull',
    'mugu-brass-marble-t-bar',
    'matte-black-cabinet-pulls-20-pack',
    'retro-brass-cabinet-knobs-elegant-ribbed-handles-for-drawers-dressing-tables-mod',
    'black-cabinet-knobs-aluminium-alloy-kitchen-cabinet-handles-drawer-knobs-pulls-b',
    'matte-black-towel-hooks-stainless-steel-wall-mounted-heavy-duty-robe-coat-hook-b',
    'dooroom-brass-bearing-hooks-bathroom-indoor-kitchen-hallway-wall-clothes-hooks-w',
]


def cut_out(source: Path, target: Path) -> tuple[int, int, int]:
    """Writes the transparent WebP. Returns (width, height, bytes)."""
    from PIL import Image, ImageFilter
    with Image.open(source) as opened:
        rgba, _ = remove_background(opened)
    rgba = keep_main_object(rgba)
    alpha = rgba.getchannel('A')
    box = alpha.point(lambda value: 255 if value > 12 else 0).getbbox()
    if not box:
        raise ValueError('nothing was left after removing the background')
    pad = round(max(box[2] - box[0], box[3] - box[1]) * 0.03)
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(rgba.width, box[2] + pad), min(rgba.height, box[3] + pad))
    item = rgba.crop(box)
    # Pull the edge in by a pixel so the studio background doesn't leave a pale halo on a dark wall.
    edge = item.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    item.putalpha(edge)
    item.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    item.save(target, 'WEBP', quality=88, method=6, alpha_quality=92)
    return item.width, item.height, target.stat().st_size


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Make transparent cut-outs for the room preview.')
    parser.add_argument('handles', nargs='*', help='product handles (default: the built-in list)')
    args = parser.parse_args(argv)

    products = {product['handle']: product for product in load_products()}
    chosen = args.handles or HANDLES
    made = {}
    for handle in chosen:
        product = products.get(handle)
        if product is None:
            print(f'  {handle}: no such product, skipped')
            continue
        source = DIST / str(product.get('photo_url', '')).split('?')[0]
        if not source.is_file() or source.suffix.lower() not in ('.webp', '.png', '.jpg', '.jpeg'):
            print(f'  {handle}: render not found at {product.get("photo_url")}, skipped')
            continue
        width, height, size = cut_out(source, OUT / f'{handle}.webp')
        made[handle] = {'handle': handle, 'product': product['product'], 'category': product['category'],
                        'cutout': f'assets/products/cutouts/{handle}.webp', 'width': width, 'height': height}
        print(f'  {handle}: {width} x {height}, {size // 1000} KB')

    existing = json.loads(LIST.read_text(encoding='utf-8')) if LIST.exists() else []
    merged = {entry['handle']: entry for entry in existing if (OUT / f"{entry['handle']}.webp").exists()}
    merged.update(made)
    order = [handle for handle in HANDLES if handle in merged] + [handle for handle in merged if handle not in HANDLES]
    LIST.write_text(json.dumps([merged[handle] for handle in order], indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{len(order)} products in {LIST.relative_to(ROOT).as_posix()}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
