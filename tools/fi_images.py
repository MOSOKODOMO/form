"""Product images for the shop: studio photos (with written permission), placeholder cards and labelled renders.

The site shows product images at 4:5 and crops the sides of a square image by 10% each, so the product
and the "Render" label always sit inside the middle 80%.
"""
from __future__ import annotations

import io
import os
import re
from html import escape
from pathlib import Path

from fi_products import ROOT, is_stated

BACKGROUND = (246, 242, 234)  # #F6F2EA
OLIVE, LIME, INK, MUTED = (37, 43, 35), (220, 233, 112), '#183d32', '#4d6358'
MASTER_SIZE, WEB_SIZE, WEB_LIMIT = 2000, 1200, 300_000
GENERIC_PLACEHOLDER = 'assets/products/photo-coming-soon.svg'
# U2-Net (Apache-2.0, about 176 MB, downloaded once). rembg's own default model is about 1 GB and licensed for
# non-commercial use only, so it is never used here. FI_REMBG_MODEL can name another rembg model with a suitable licence.
REMBG_MODEL = 'u2net'
NOUNS = {'handles': 'cabinet handle', 'knobs': 'cabinet knob', 'tiles': 'tile', 'taps': 'tap', 'bathroom': 'bathroom accessory', 'doors': 'door and wall fitting'}
ICONS = {'handles': 'handle', 'knobs': 'knob', 'tiles': 'tile', 'taps': 'tap', 'bathroom': 'bath', 'doors': 'door'}
FONTS = ('C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
         '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'DejaVuSans-Bold.ttf')


# ---------- alt text, written only from stated facts ----------

def describe(product: dict) -> str:
    """For example: "Brass cabinet handle in brushed gold, made by Example Hardware Co., Ltd. in China"."""
    noun = NOUNS.get(product.get('category'), 'product')
    material = product.get('material')
    words = f'{material.lower()} {noun}' if is_stated(material) and material.lower() not in noun else noun
    finishes = [finish for finish in product.get('finishes') or [] if is_stated(finish)]
    if finishes and finishes[0].lower() != (material or '').lower():
        words += f' in {finishes[0].lower()}'
    maker, country = product.get('maker'), product.get('country')
    if is_stated(maker):
        words += f', made by {maker}' + (f' in {country}' if is_stated(country) else '')
    elif is_stated(country):
        words += f', made in {country}'
    return words


def alt_text(product: dict, kind: str) -> str:
    description = describe(product)
    if kind == 'render':
        return f'AI render, not a photo: {description}.'
    if kind == 'placeholder':
        return f'Photo coming soon for this {description}.'
    return description[:1].upper() + description[1:] + '.'


# ---------- turning a photo into a studio image ----------

def remove_background(image, use_rembg: bool = True):
    """Returns (RGBA cut-out, method). rembg first; a plain-background fill if rembg isn't installed."""
    from PIL import Image
    image = image.convert('RGBA')
    if use_rembg:
        try:
            from rembg import new_session, remove
        except ImportError:
            use_rembg = False
        else:
            result = remove(image, session=new_session(os.environ.get('FI_REMBG_MODEL', REMBG_MODEL)))
            return (result if isinstance(result, Image.Image) else Image.open(io.BytesIO(result))).convert('RGBA'), f"rembg ({os.environ.get('FI_REMBG_MODEL', REMBG_MODEL)})"
    return plain_background_cutout(image), 'plain-background fill (install rembg for better edges)'


def plain_background_cutout(image, tolerance: int = 28):
    """Clears the background colour that touches the edges, which suits studio photos on white or grey."""
    from PIL import Image, ImageDraw, ImageFilter
    work = image.convert('RGBA')
    scale = min(1.0, 1400 / max(work.size))  # the fill is slow on very large images
    small = work.resize((max(1, round(work.width * scale)), max(1, round(work.height * scale)))) if scale < 1 else work.copy()
    w, h = small.size
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for seed in seeds:
        if small.getpixel(seed)[3]:
            ImageDraw.floodfill(small, seed, (0, 0, 0, 0), thresh=tolerance)
    mask = small.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    if scale < 1:
        mask = mask.resize(work.size, Image.LANCZOS)
    work.putalpha(mask)
    return work


def keep_main_object(cutout, share: float = 0.2):
    """Keeps the biggest object and any part at least 20% of its size (two knobs in one photo stay). Faint leftovers
    and other products in the background, which background removal sometimes half keeps, are cleared."""
    from PIL import Image
    try:
        import numpy as np
        from scipy import ndimage
    except ImportError:
        return cutout
    alpha = np.asarray(cutout.getchannel('A'), dtype=np.uint8)
    labels, count = ndimage.label(alpha >= 128)
    if count == 0:
        return cutout
    sizes = ndimage.sum(np.ones_like(labels), labels, range(1, count + 1))
    keep = np.isin(labels, [index + 1 for index, size in enumerate(sizes) if size >= sizes.max() * share])
    keep = ndimage.binary_dilation(keep, iterations=3)  # keeps the soft edge around what stays
    result = cutout.copy()
    result.putalpha(Image.fromarray(np.where(keep, alpha, 0).astype(np.uint8)))
    return result


def studio_image(cutout, category: str = '', size: int = MASTER_SIZE, fill: float = 0.75):
    """Centres the cut-out on #F6F2EA with a soft shadow. Upscales small photos so the product fills the frame."""
    from PIL import Image, ImageChops, ImageDraw, ImageFilter
    cutout = keep_main_object(cutout)
    box = cutout.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox()
    if not box:
        raise ValueError('nothing was left after removing the background')
    item = cutout.crop(box)
    scale = min(size * fill / item.width, size * fill / item.height)
    item = item.resize((max(1, round(item.width * scale)), max(1, round(item.height * scale))), Image.LANCZOS)
    if scale > 1.2:
        item = item.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))  # upscaled: bring back some crispness
    x = (size - item.width) // 2
    y = (size - item.height) // 2 - round(size * 0.02)

    shade = Image.new('L', (size, size), 0)
    drop = Image.new('L', (size, size), 0)
    drop.paste(item.getchannel('A').point(lambda a: round(a * 0.20)), (x, y + round(size * 0.014)))
    shade = ImageChops.lighter(shade, drop.filter(ImageFilter.GaussianBlur(size * 0.018)))
    if category != 'tiles':  # tiles are shown flat, so they get no contact shadow
        contact = Image.new('L', (size, size), 0)
        width, height = item.width * 0.82, max(size * 0.02, item.height * 0.07)
        bottom = y + item.height
        ImageDraw.Draw(contact).ellipse([size / 2 - width / 2, bottom - height / 2, size / 2 + width / 2, bottom + height / 2], fill=80)
        shade = ImageChops.lighter(shade, contact.filter(ImageFilter.GaussianBlur(size * 0.016)))

    canvas = Image.new('RGBA', (size, size), BACKGROUND + (255,))
    canvas = Image.composite(Image.new('RGBA', (size, size), (52, 46, 38, 255)), canvas, shade)
    canvas.alpha_composite(item, (x, y))
    return canvas.convert('RGB')


def font(px: int):
    from PIL import ImageFont
    for path in FONTS:
        try:
            return ImageFont.truetype(path, px)
        except OSError:
            continue
    return ImageFont.load_default(px)


def stamp_render_label(image):
    """A visible "Render" label, inside the part of the image the site never crops."""
    from PIL import ImageDraw
    image = image.convert('RGB')
    size = image.width
    draw = ImageDraw.Draw(image)
    face = font(round(size * 0.034))
    left, top, right, bottom = draw.textbbox((0, 0), 'Render', font=face)
    pad_x, pad_y = round(size * 0.018), round(size * 0.012)
    x, y = round(size * 0.14), round(size * 0.07)
    draw.rounded_rectangle([x, y, x + (right - left) + 2 * pad_x, y + (bottom - top) + 2 * pad_y], radius=round(size * 0.008), fill=OLIVE)
    draw.text((x + pad_x - left, y + pad_y - top), 'Render', fill=LIME, font=face)
    return image


def save_web(image, path: Path, size: int = WEB_SIZE, limit: int = WEB_LIMIT) -> tuple[int, int]:
    """Saves a square WebP under the size limit. Returns (quality, bytes)."""
    from PIL import Image
    small = image.resize((size, size), Image.LANCZOS) if image.size != (size, size) else image
    path.parent.mkdir(parents=True, exist_ok=True)
    for quality in (86, 82, 78, 74, 70, 65, 60, 55, 50, 45, 40):
        buffer = io.BytesIO()
        small.save(buffer, 'WEBP', quality=quality, method=6)
        if buffer.tell() <= limit:
            path.write_bytes(buffer.getvalue())
            return quality, buffer.tell()
    raise ValueError(f'could not get {path.name} under {limit // 1000} KB')


def save_master(image, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, 'JPEG', quality=90, optimize=True, progressive=True)
    return path.stat().st_size


# ---------- placeholder card ----------

def icon_paths(category: str, icons_file: Path = ROOT / 'dist' / 'assets' / 'category-icons.svg') -> str:
    symbol = ICONS.get(category)
    if not symbol or not icons_file.exists():
        return ''
    match = re.search(rf'<symbol id="{symbol}"[^>]*>([\s\S]*?)</symbol>', icons_file.read_text(encoding='utf-8'))
    return match.group(1).strip() if match else ''


def wrap(text: str, width: int = 26, lines: int = 3) -> list[str]:
    words, rows = text.split(), ['']
    for word in words:
        if len(rows[-1]) + len(word) + 1 > width and rows[-1]:
            rows.append(word)
        else:
            rows[-1] = f'{rows[-1]} {word}'.strip()
    if len(rows) > lines:
        rows = rows[:lines]
        rows[-1] = rows[-1].rstrip(',.;:') + '…'
    return rows


def placeholder_card(product: dict) -> str:
    """An 800 x 1000 card shown until the maker allows their photos: the category icon, the name and the reason."""
    icon = icon_paths(product.get('category', ''))
    name_rows = wrap(product.get('product', 'Product'))
    maker = product.get('maker')
    origin = ', '.join(part for part in (maker, product.get('country')) if is_stated(part))
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000">',
        '  <!-- Placeholder card made by tools/make-images.py. No supplier photo is used. -->',
        '  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0ece2"/><stop offset="1" stop-color="#f7f4ed"/></linearGradient></defs>',
        '  <rect width="800" height="1000" fill="url(#bg)"/>',
        '  <rect x="40" y="40" width="720" height="920" fill="none" stroke="#d7d2c5" stroke-width="2" stroke-dasharray="10 10"/>',
    ]
    if icon:
        lines.append(f'  <g color="#285444" transform="translate(304 170) scale(3)">{icon}</g>')
    lines.append('  <text x="400" y="470" text-anchor="middle" fill="#285444" font-family="DM Sans, Arial, sans-serif" font-size="20" letter-spacing="4">PHOTO COMING SOON</text>')
    for index, row in enumerate(name_rows):
        lines.append(f'  <text x="400" y="{540 + index * 46}" text-anchor="middle" fill="{INK}" font-family="DM Sans, Arial, sans-serif" '
                     f'font-size="36" font-weight="700">{escape(row)}</text>')
    if origin:
        lines.append(f'  <text x="400" y="{560 + len(name_rows) * 46}" text-anchor="middle" fill="{MUTED}" font-family="DM Sans, Arial, sans-serif" '
                     f'font-size="22">{escape(origin[:60])}</text>')
    lines += ['  <text x="400" y="890" text-anchor="middle" fill="#4d6358" font-family="DM Sans, Arial, sans-serif" font-size="22">'
              'We only show photos the maker has allowed us to use.</text>', '</svg>', '']
    return '\n'.join(lines)


# ---------- which image the shop shows ----------

def site_photo(handle: str, permission: str, assets: Path, render_ok: bool = False) -> tuple[str, str]:
    """(photo_url, kind) in order of preference: the maker's photo (with permission), a checked render, the card, the generic placeholder."""
    if permission == 'yes' and (assets / f'{handle}.webp').exists():
        return f'assets/products/{handle}.webp', 'photo'
    if render_ok and (assets / f'{handle}-render.webp').exists():
        return f'assets/products/{handle}-render.webp', 'render'
    if (assets / f'{handle}-card.svg').exists():
        return f'assets/products/{handle}-card.svg', 'placeholder'
    return GENERIC_PLACEHOLDER, 'placeholder'

