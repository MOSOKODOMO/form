"""Tests for tools/make-images.py. Run:  py -m unittest discover -s tests -p "test_*.py"

They draw their own test photo and use the plain-background fill instead of rembg, so no model is downloaded.
"""
import contextlib
import importlib.util
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
from PIL import Image, ImageDraw  # noqa: E402

import fi_images  # noqa: E402
import fi_llm  # noqa: E402


def load_tool(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT / 'tools' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


make_images = load_tool('make-images')
approve = load_tool('approve')
check_products = load_tool('check-products')
HANDLE = 'example-knurled-brass-pull'


def run(tool, *args):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = tool.main([str(arg) for arg in args])
    return code, out.getvalue()


def draw_photo(path: Path, size=(900, 700)):
    """A brass-coloured pull on a white studio background."""
    image = Image.new('RGB', size, (250, 250, 250))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([150, 300, 750, 380], radius=30, fill=(170, 125, 60))
    draw.rectangle([230, 380, 260, 470], fill=(150, 108, 50))
    draw.rectangle([640, 380, 670, 470], fill=(150, 108, 50))
    image.save(path)
    return path


def close(colour, expected, tolerance):
    return all(abs(a - b) <= tolerance for a, b in zip(colour, expected))


class MakeImagesTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.drafts, self.assets = self.dir / 'drafts', self.dir / 'assets'
        self.drafts.mkdir()
        self.products = self.dir / 'products.json'
        shutil.copy(ROOT / 'tests' / 'fixtures' / 'sample-products.json', self.products)
        self.photo = draw_photo(self.dir / 'photo.png')
        self.write_draft(photo_permission='no')

    def tearDown(self):
        shutil.rmtree(self.dir)

    def write_draft(self, **changes):
        draft = {'handle': HANDLE, 'status': 'draft', 'product': 'Example Knurled Brass Pull', 'category': 'handles',
                 'maker': 'Example Hardware Co., Ltd.', 'maker_url': 'not stated', 'country': 'China', 'material': 'Brass',
                 'finishes': ['Brushed Gold'], 'sizes': ['128mm'], 'source_url': 'https://example.com/pull', 'image_urls': [],
                 'image_files': [], 'certificates_claimed': [], 'platform_badges': [], 'price_aud_estimate': 'not estimated',
                 'company_registration': {'status': 'claimed', 'check_link': ''}, **changes}
        (self.drafts / f'{HANDLE}.json').write_text(json.dumps(draft), encoding='utf-8')

    def draft(self):
        return json.loads((self.drafts / f'{HANDLE}.json').read_text(encoding='utf-8'))

    def make(self, *args):
        return run(make_images, HANDLE, '--drafts', self.drafts, '--products', self.products, '--assets', self.assets,
                   '--no-download', '--no-rembg', *args)

    def test_with_permission_the_photo_becomes_a_centred_studio_image(self):
        self.write_draft(photo_permission='yes')
        code, out = self.make('--source', self.photo)
        self.assertEqual(code, 0, out)
        with Image.open(self.assets / f'{HANDLE}-2000.jpg') as opened:
            master = opened.convert('RGB')
        self.assertEqual(master.size, (2000, 2000))
        self.assertTrue(close(master.getpixel((5, 5)), fi_images.BACKGROUND, 3), 'background is #F6F2EA')
        web = self.assets / f'{HANDLE}.webp'
        with Image.open(web) as small:
            self.assertEqual(small.size, (1200, 1200))
        self.assertLessEqual(web.stat().st_size, 300_000)

        brass = master.point(lambda value: 255 if value < 200 else 0).convert('L').point(lambda value: 255 if value > 0 else 0)
        left, top, right, bottom = brass.getbbox()
        self.assertAlmostEqual((left + right) / 2, 1000, delta=40, msg='centred left to right')
        self.assertLessEqual(right - left, 1520, 'inside the middle 80% the site keeps when it crops to 4:5')
        self.assertGreater(right - left, 1300, 'small photos are scaled up to fill the frame')
        below = master.getpixel((1000, bottom + 20))
        self.assertLess(sum(below), sum(fi_images.BACKGROUND) - 15, 'a soft shadow sits under the product')

        draft = self.draft()
        self.assertEqual(draft['photo_url'], f'assets/products/{HANDLE}.webp')
        self.assertEqual(draft['photo_alt'], 'Brass cabinet handle in brushed gold, made by Example Hardware Co., Ltd. in China.')
        code, out = run(approve, HANDLE, '--drafts', self.drafts, '--products', self.products, '--assets', self.assets, '--yes',
                        '--price', '20', '--photo-permission', 'yes', '--permission-note', 'Email from the maker, 1 Oct 2026')
        self.assertEqual(code, 0, out)
        product = next(p for p in json.loads(self.products.read_text(encoding='utf-8')) if p['handle'] == HANDLE)
        self.assertEqual((product['photo_url'], product['photo_alt']), (draft['photo_url'], draft['photo_alt']))
        self.assertEqual(check_products.photo_problems(product), [])

    def test_without_permission_a_card_is_made_and_no_supplier_photo_is_published(self):
        self.assets.mkdir()
        (self.assets / f'{HANDLE}.webp').write_bytes(b'old photo')  # made while permission was "yes"
        code, out = self.make('--source', self.photo)
        self.assertEqual(code, 0, out)
        self.assertFalse((self.assets / f'{HANDLE}.webp').exists(), 'withdrawn permission removes the photo')
        self.assertFalse((self.assets / f'{HANDLE}-2000.jpg').exists())
        card = (self.assets / f'{HANDLE}-card.svg').read_text(encoding='utf-8')
        for text in ('PHOTO COMING SOON', 'Example Knurled Brass Pull', 'Example Hardware Co., Ltd., China', 'rect x="8" y="20"'):
            self.assertIn(text, card)
        self.assertNotIn('<image', card, 'the card never embeds a photo')
        draft = self.draft()
        self.assertEqual(draft['photo_url'], f'assets/products/{HANDLE}-card.svg')
        self.assertEqual(draft['photo_alt'], 'Photo coming soon for this brass cabinet handle in brushed gold, made by Example Hardware Co., Ltd. in China.')
        self.assertFalse(draft['photo_is_render'])

    def test_a_render_is_labelled_and_only_published_once_a_person_confirms_it(self):
        render = draw_photo(self.dir / 'render.png')
        code, out = self.make('--render-from', render, '--render-looks-right', 'no')
        self.assertEqual(code, 0, out)
        self.assertFalse((self.assets / f'{HANDLE}-render.webp').exists())
        self.assertTrue((self.drafts / HANDLE / 'render-check.webp').exists(), 'a copy is kept for checking')
        self.assertEqual(self.draft()['photo_url'], f'assets/products/{HANDLE}-card.svg')

        code, out = self.make('--render-from', render, '--render-looks-right', 'yes')
        self.assertEqual(code, 0, out)
        with Image.open(self.assets / f'{HANDLE}-render.webp') as opened:
            published = opened.convert('RGB')
        self.assertTrue(close(published.getpixel((round(1200 * 0.14) + 6, round(1200 * 0.07) + 6)), fi_images.OLIVE, 14), 'the Render label is visible')
        draft = self.draft()
        self.assertEqual(draft['photo_url'], f'assets/products/{HANDLE}-render.webp')
        self.assertTrue(draft['photo_alt'].startswith('AI render, not a photo: brass cabinet handle'))
        self.assertTrue(draft['photo_is_render'])
        product = {**draft, 'sample': False}
        self.assertEqual(check_products.photo_problems(product), [])
        self.assertTrue(check_products.photo_problems({**product, 'photo_is_render': False}), 'an unmarked render is an error')

    def test_ai_render_needs_a_key_and_never_writes_it_anywhere(self):
        (self.drafts / HANDLE / 'source').mkdir(parents=True)
        shutil.copy(self.photo, self.drafts / HANDLE / 'source' / '01.png')
        original_env, original_render = make_images.load_env, fi_llm.render_image
        calls = []

        def fake_render(product, reference, mime, key, model=''):
            calls.append((mime, key, len(reference)))
            return (self.dir / 'photo.png').read_bytes()

        try:
            make_images.load_env = lambda: {}
            code, out = self.make('--ai-render')
            self.assertEqual(code, 1)
            self.assertIn('needs OPENROUTER_API_KEY', out)
            make_images.load_env = lambda: {'OPENROUTER_API_KEY': 'sk-or-test-key-123'}
            fi_llm.render_image = fake_render
            code, out = self.make('--ai-render', '--render-looks-right', 'yes')
        finally:
            make_images.load_env, fi_llm.render_image = original_env, original_render
        self.assertEqual(code, 0, out)
        self.assertEqual(calls[0][:2], ('image/png', 'sk-or-test-key-123'))
        self.assertTrue((self.assets / f'{HANDLE}-render.webp').exists())
        for path in self.dir.rglob('*'):
            if path.is_file():
                self.assertNotIn(b'sk-or-test-key-123', path.read_bytes(), f'{path.name} must not contain the key')

    def test_render_prompt_uses_only_stated_facts(self):
        prompt = fi_llm.render_prompt({'product': 'Example Knurled Brass Pull', 'material': 'not stated', 'finishes': ['not stated']})
        self.assertIn('Product: Example Knurled Brass Pull.', prompt)
        self.assertNotIn('not stated', prompt)
        self.assertIn('exactly as they are', prompt)

    def test_source_photos_are_saved_once_each_and_robots_txt_is_respected(self):
        png, icon = io.BytesIO(), io.BytesIO()
        Image.effect_noise((300, 300), 60).convert('RGB').save(png, 'PNG')  # photo-sized
        Image.new('RGB', (20, 20), (200, 150, 90)).save(icon, 'PNG')

        class Response:
            def __init__(self, status, body=b'', kind='image/png'):
                self.status_code, self.content, self.text, self.headers = status, body, body.decode('latin-1'), {'Content-Type': kind}

        class Session:
            requested = []

            def get(self, url, **kwargs):
                self.requested.append(url)
                if url.endswith('/robots.txt'):
                    return Response(200, b'User-agent: *\nDisallow: /private/\n', 'text/plain')
                if 'missing' in url:
                    return Response(404)
                return Response(200, icon.getvalue() if 'icon' in url else png.getvalue())

        session = Session()
        draft = {'image_urls': ['https://img.example.com/a.png', 'https://img.example.com/private/b.jpg',
                                'https://img.example.com/missing.jpg', 'http://img.example.com/insecure.jpg',
                                'https://img.example.com/same-photo-again.png', 'https://img.example.com/icon.png'], 'image_files': []}
        saved, notes = make_images.save_sources(draft, self.dir / 'source', session=session, pause=0)
        self.assertEqual([path.name for path in saved], ['01.png'])
        self.assertTrue(any('robots.txt' in note for note in notes))
        self.assertTrue(any('HTTP 404' in note for note in notes))
        self.assertTrue(any('too small' in note for note in notes), 'icons are skipped')
        self.assertEqual(session.requested.count('https://img.example.com/robots.txt'), 1, 'robots.txt is read once per site')
        self.assertNotIn('https://img.example.com/private/b.jpg', session.requested)
        self.assertNotIn('http://img.example.com/insecure.jpg', session.requested)

    def test_faint_leftovers_and_other_products_in_the_photo_are_dropped(self):
        cutout = Image.new('RGBA', (400, 300), (0, 0, 0, 0))
        draw = ImageDraw.Draw(cutout)
        draw.rectangle([40, 120, 300, 160], fill=(170, 125, 60, 255))  # the product
        draw.rectangle([330, 20, 380, 60], fill=(170, 125, 60, 70))    # a faint ghost of another product
        draw.rectangle([20, 250, 40, 260], fill=(170, 125, 60, 255))   # a small stray bit
        kept = fi_images.keep_main_object(cutout)
        self.assertEqual(kept.getchannel('A').getbbox(), (40, 120, 301, 161), 'only the product is left: no ghost, no stray bit')
        pair = Image.new('RGBA', (400, 300), (0, 0, 0, 0))
        ImageDraw.Draw(pair).ellipse([20, 100, 140, 220], fill=(200, 200, 200, 255))
        ImageDraw.Draw(pair).ellipse([240, 100, 360, 220], fill=(200, 200, 200, 255))
        self.assertEqual(fi_images.keep_main_object(pair).getchannel('A').getbbox(), (20, 100, 361, 221), 'two knobs in one photo both stay')

    def test_check_products_blocks_supplier_photos_without_permission(self):
        product = {'handle': HANDLE, 'photo_permission': 'no', 'photo_url': f'assets/products/{HANDLE}.webp'}
        self.assertTrue(check_products.photo_problems(product))
        self.assertTrue(check_products.photo_problems({**product, 'photo_url': 'https://image.example.com/supplier.jpg'}))
        self.assertEqual(check_products.photo_problems({**product, 'photo_permission': 'yes'}), [])
        self.assertEqual(check_products.photo_problems({**product, 'photo_url': f'assets/products/{HANDLE}-card.svg'}), [])

    def test_alt_text_only_uses_stated_facts(self):
        product = {'category': 'knobs', 'material': 'not stated', 'finishes': ['not stated'], 'maker': 'not stated', 'country': 'Vietnam'}
        self.assertEqual(fi_images.alt_text(product, 'photo'), 'Cabinet knob, made in Vietnam.')
        self.assertNotIn('not stated', fi_images.alt_text({**product, 'country': 'not stated'}, 'placeholder'))

    def test_sample_products_are_left_alone(self):
        code, out = run(make_images, 'sample-knurled-brass-pull', '--drafts', self.drafts, '--products', self.products,
                        '--assets', self.assets, '--no-download', '--no-rembg')
        self.assertEqual(code, 1)
        self.assertIn('sample product', out)


if __name__ == '__main__':
    unittest.main()
