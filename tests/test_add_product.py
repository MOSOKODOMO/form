"""Tests for tools/add-product.py and tools/approve.py. Run:  py -m unittest discover -s tests -p "test_*.py" """
import contextlib
import csv
import importlib.util
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ROOT / 'tests' / 'fixtures' / 'pages'
sys.path.insert(0, str(ROOT / 'tools'))
import fi_extract  # noqa: E402
import fi_llm  # noqa: E402
from fi_products import SHOPIFY_COLUMNS  # noqa: E402


def load_tool(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT / 'tools' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


add_product = load_tool('add-product')
approve = load_tool('approve')


def run(tool, *args):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = tool.main([str(arg) for arg in args])
    return code, out.getvalue()


class AddProductTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.drafts = self.dir / 'drafts'
        self.settings = self.dir / 'settings.json'
        self.settings.write_text(json.dumps({'usd_to_aud': 1.5, 'shipping_per_unit_aud': 2, 'packaging_per_unit_aud': 0.5, 'gst_rate': 0.1}), encoding='utf-8')
        self.products = self.dir / 'products.json'
        shutil.copy(ROOT / 'dist' / 'data' / 'products.json', self.products)

    def tearDown(self):
        shutil.rmtree(self.dir)

    def add(self, *args):
        return run(add_product, *args, '--drafts', self.drafts, '--settings', self.settings, '--products', self.products, '--no-llm')

    def draft(self, handle):
        return json.loads((self.drafts / f'{handle}.json').read_text(encoding='utf-8'))

    def test_saved_made_in_china_page_becomes_a_draft_with_report_and_csv_row(self):
        code, out = self.add('--from-file', PAGES / 'made-in-china-style.html')
        self.assertEqual(code, 0, out)
        draft = self.draft('knurled-brass-cabinet-pull-handle')
        self.assertEqual(draft['status'], 'draft')
        self.assertEqual(draft['product'], 'Knurled Brass Cabinet Pull Handle')
        self.assertEqual(draft['category'], 'handles')
        self.assertEqual(draft['maker'], 'Example Hardware Co., Ltd.')
        self.assertEqual(draft['maker_url'], 'https://example-hardware.en.made-in-china.com/')
        self.assertEqual((draft['city'], draft['country']), ('Foshan, Guangdong', 'China'))
        self.assertEqual(draft['finishes'], ['Brushed Gold', 'Matte Black'])
        self.assertEqual(draft['sizes'], ['96mm', '128mm', '160mm'])
        self.assertEqual((draft['moq'], draft['lead_time']), ('500 Pieces', '25 days'))
        self.assertEqual((draft['price_min_usd'], draft['price_max_usd'], draft['price_unit']), (1.2, 3.5, 'Piece'))
        self.assertEqual([claim['name'] for claim in draft['certificates_claimed']], ['ISO 9001', 'WaterMark'])
        self.assertTrue(all(claim['status'] == 'claimed' for claim in draft['certificates_claimed']))
        self.assertEqual(draft['photo_permission'], 'no')
        estimate = draft['price_aud_estimate']
        self.assertAlmostEqual(estimate['min'], 1.2 * 1.5 + 2.5, places=2)
        self.assertAlmostEqual(estimate['with_gst_max'], (3.5 * 1.5 + 2.5) * 1.1, places=2)
        self.assertIn('Estimate only', estimate['note'])
        flags = ' '.join(draft['red_flags'])
        self.assertIn("WaterMark is a taps certification, which doesn't fit a product in handles", flags)
        self.assertIn('Brand-new account', flags)
        self.assertIn('claimed without a certificate number', flags)

        report = (self.drafts / 'knurled-brass-cabinet-pull-handle.verify.md').read_text(encoding='utf-8')
        for link in ('https://www.iafcertsearch.org/', 'https://www.gsxt.gov.cn/', 'https://watermark.abcb.gov.au/', 'https://www.importyeti.com/search?q='):
            self.assertIn(link, report)
        self.assertIn('## Red flags found automatically', report)
        self.assertNotIn('—', report, 'no em dashes')
        raw = (self.drafts / 'knurled-brass-cabinet-pull-handle.raw.txt').read_text(encoding='utf-8')
        self.assertIn('Lead Time', raw)

        with open(self.drafts / 'shopify-import.csv', newline='', encoding='utf-8') as handle:
            reader = csv.DictReader(handle)
            self.assertEqual(reader.fieldnames, SHOPIFY_COLUMNS)
            row = next(reader)
        self.assertEqual((row['Handle'], row['Published'], row['Status']), ('knurled-brass-cabinet-pull-handle', 'FALSE', 'draft'))
        self.assertIn('verified-pending', row['Tags'])

    def test_pasted_alibaba_text_marks_gaps_not_stated(self):
        inbox = self.dir / 'inbox'
        inbox.mkdir()
        shutil.copy(PAGES / 'alibaba-style-knob.txt', inbox / 'ceramic-knob.txt')
        code, out = self.add('--from-file', inbox / 'ceramic-knob.txt')
        self.assertEqual(code, 0, out)
        draft = self.draft('ceramic-knob')
        self.assertEqual(draft['category'], 'knobs')
        self.assertEqual(draft['maker'], 'Example Ceramics Co., Ltd.')
        self.assertEqual(draft['material'], 'Ceramic')
        self.assertEqual(draft['finishes'], ['White', 'Sage', 'Charcoal'])
        self.assertEqual(draft['sizes'], ['not stated'])
        self.assertEqual(draft['maker_years_in_business'], 'not stated')
        self.assertEqual((draft['price_min_usd'], draft['price_max_usd']), (0.45, 0.9))
        self.assertIn('sizes', draft['not_stated'])
        self.assertIn('CE is claimed without a certificate number.', draft['red_flags'])
        self.assertIn('Not stated', out)

    def test_tier_prices_two_line_moq_and_size_lists_are_read(self):
        code, out = self.add('--from-file', PAGES / 'made-in-china-tiers.html')
        self.assertEqual(code, 0, out)
        draft = self.draft('example-solid-brass-t-bar-pull-38cm-15-inch-knurled-cabinet')
        self.assertEqual(draft['maker'], 'Example Brass Hardware Co., Ltd', 'the brand is a company name, so it is the maker')
        self.assertEqual((draft['price_min_usd'], draft['price_max_usd'], draft['price_unit']), (1.98, 7.76, 'Piece'),
                         'structured data gives only the lowest tier; the page shows the full range')
        self.assertEqual(draft['moq'], '100 Pieces')
        self.assertEqual(draft['sizes'], ['T bar: 50*12*33mm', '64: 116*12*33mm', '96: 148*12*33mm'],
                         '"In Parameter Diagram" is not a size, and Size wins over Hole Distance')
        self.assertEqual(draft['lead_time'], '15-30days')
        self.assertEqual((draft['city'], draft['country']), ('Zhejiang', 'China'))
        self.assertIn('Diamond Member Since 2023', draft['platform_badges'])
        self.assertEqual(draft['platform_years'], date.today().year - 2023)
        self.assertEqual(draft['maker_years_in_business'], date.today().year - 2013)
        self.assertEqual(draft['price_aud_estimate']['unit'], 'each')

    def test_company_suffixes_must_end_a_word(self):
        text = ('Solid Brass T Bar 38cm 15 Inch Knurled Pull\nExample Brass Hardware Co., Ltd\n'
                'Example Brass Hardware Co., Ltd. was established in 2013.\nCopyright Focus Technology Co., Ltd.')
        page = fi_extract.Page(None, text, 'not stated', 'test')
        self.assertEqual(fi_extract.maker_name(page, {}, {}), 'Example Brass Hardware Co., Ltd',
                         '"Inc" inside "Inch" is not a company, and the marketplace in the footer is not the maker')
        self.assertEqual(fi_extract.maker_name(fi_extract.Page(None, 'Brass Pull 15 Inch Handle', 'not stated', 'test'), {}, {}), 'not stated')

    def test_non_answers_count_as_not_stated(self):
        for value in ('In Parameter Diagram', 'See picture', 'As your request', 'Customized', 'Please contact us', 'Available'):
            self.assertTrue(fi_extract.NON_ANSWERS.match(value), value)
        for value in ('In 15 days', 'AS/NZS 4020', 'Brass', '96mm, 128mm', 'Asphalt grey'):
            self.assertFalse(fi_extract.NON_ANSWERS.match(value), value)

    def test_a_second_run_replaces_the_csv_row(self):
        self.add('--from-file', PAGES / 'made-in-china-style.html')
        self.add('--from-file', PAGES / 'made-in-china-style.html')
        with open(self.drafts / 'shopify-import.csv', newline='', encoding='utf-8') as handle:
            self.assertEqual(len(list(csv.DictReader(handle))), 1)

    def test_blocked_pages_stop_with_the_inbox_message(self):
        original = add_product.fetch
        add_product.fetch = lambda url, render_fallback=True: (None, 'the site showed a CAPTCHA or bot check')
        try:
            code, out = self.add('https://www.alibaba.com/product-detail/test.html')
        finally:
            add_product.fetch = original
        self.assertEqual(code, 2)
        self.assertIn("Couldn't read this page. Save it in your browser (Ctrl+S, 'Webpage, complete') into `inbox/`", out)
        self.assertFalse(self.drafts.exists() and any(self.drafts.iterdir()), 'nothing is written for a blocked page')

    def test_captcha_pages_are_recognised(self):
        page = fi_extract.page_from_html((PAGES / 'blocked.html').read_text(encoding='utf-8'), 'https://example.com/x', 'test')
        self.assertEqual(fi_extract.block_reason(200, page.text), 'the site showed a CAPTCHA or bot check')
        self.assertIn('HTTP 403', fi_extract.block_reason(403, 'anything'))

    def test_robots_txt_is_respected(self):
        class Response:
            status_code = 200
            text = 'User-agent: *\nDisallow: /product-detail/\n'

        class Session:
            def get(self, url, **kwargs):
                return Response()

        allowed, _ = fi_extract.robots_allowed('https://example.com/product-detail/x.html', Session())
        self.assertFalse(allowed)
        allowed, _ = fi_extract.robots_allowed('https://example.com/other/x.html', Session())
        self.assertTrue(allowed)

    def test_llm_answers_only_count_when_the_page_says_them(self):
        source = 'Brass cabinet handle\nMaterial: Brass\nCertification: ISO 9001 No. CN12345'
        draft = {'product': 'Brass cabinet handle', 'maker': 'not stated', 'material': 'not stated', 'country': 'not stated', 'city': 'not stated',
                 'moq': 'not stated', 'lead_time': 'not stated', 'price_unit': 'not stated', 'finishes': ['not stated'], 'sizes': ['not stated'],
                 'price_min_usd': 'not stated', 'price_max_usd': 'not stated', 'certificates_claimed': [], 'platform_badges': []}
        answer = {'material': 'Brass', 'maker': 'Invented Factory Ltd', 'finishes': ['Gold'], 'price_min_usd': 2.5,
                  'certificates_claimed': [{'name': 'ISO 9001', 'number': 'CN12345', 'issuer': 'TUV'}, {'name': 'WaterMark'}]}
        filled = fi_llm.fill_gaps(draft, answer, source)
        self.assertEqual(draft['material'], 'Brass')
        self.assertEqual(draft['maker'], 'not stated', 'a maker the page never mentions is ignored')
        self.assertEqual(draft['finishes'], ['not stated'])
        self.assertEqual(draft['price_min_usd'], 'not stated')
        self.assertEqual([(c['name'], c['number'], c['issuer']) for c in draft['certificates_claimed']], [('ISO 9001', 'CN12345', 'not stated')])
        self.assertIn('material', filled)

    def test_approve_adds_an_approved_product_the_website_accepts(self):
        self.add('--from-file', PAGES / 'made-in-china-style.html')
        code, out = run(approve, 'knurled-brass-cabinet-pull-handle', '--drafts', self.drafts, '--products', self.products, '--yes',
                        '--price', '9.50', '--photo-permission', 'no', '--registration', 'claimed')
        self.assertEqual(code, 0, out)
        self.assertIn('Early FI Score', out)
        products = json.loads(self.products.read_text(encoding='utf-8'))
        product = next(p for p in products if p['handle'] == 'knurled-brass-cabinet-pull-handle')
        self.assertEqual(product['status'], 'approved')
        self.assertEqual(product['price_aud'], 9.5)
        self.assertEqual(product['photo_url'], 'assets/products/photo-coming-soon.svg', 'no permission, no supplier photo')
        self.assertEqual(product['story_en'], 'not stated')
        self.assertEqual(set(product['score_parts']), {'maker_check', 'product_proof', 'value', 'buyers'})
        self.assertEqual(product['score_parts']['buyers'], 0)
        self.assertEqual(product['fi_score'], sum(product['score_parts'].values()))
        self.assertEqual(self.draft('knurled-brass-cabinet-pull-handle')['status'], 'approved')
        node = shutil.which('node')
        if node:
            check = ("const c = require(process.argv[1]); const list = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));"
                     "const p = list.find((x) => x.handle === 'knurled-brass-cabinet-pull-handle');"
                     "console.log(JSON.stringify([c.productProblems(p), c.buyAction(p).kind]));")
            result = subprocess.run([node, '-e', check, str(ROOT / 'dist' / 'catalogue.js'), str(self.products)], capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(result.stdout), [[], 'quote'], 'the site shows it, with a quote request until it is live')

    def test_shopify_columns_match_the_existing_export(self):
        self.assertEqual(SHOPIFY_COLUMNS, ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value',
                                          'Variant SKU', 'Variant Grams', 'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price',
                                          'Variant Requires Shipping', 'Variant Taxable', 'Status'])


if __name__ == '__main__':
    unittest.main()
