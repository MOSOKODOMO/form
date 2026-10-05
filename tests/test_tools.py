"""Tests for the product tools. Run from the repo root:  py -m unittest discover -s tests -p "test_*.py" """
import contextlib
import importlib.util
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / 'tests' / 'fixtures' / 'checkout-products.json'
# Built at run time so no secret-looking string ever sits in the repo.
FAKE_STRIPE_SECRET = '_'.join(['sk', 'live', 'z' * 16])


def load_tool(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT / 'tools' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


apply_links = load_tool('apply-links')
check_products = load_tool('check-products')


def run(tool, *args):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = tool.main(list(args))
    return code, out.getvalue()


class ApplyLinksTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.products = self.dir / 'products.json'
        shutil.copy(FIXTURES, self.products)
        self.csv = self.dir / 'links.csv'

    def tearDown(self):
        shutil.rmtree(self.dir)

    def write_csv(self, *rows):
        self.csv.write_text('handle,shopify_url,stripe_link,stripe_price_aud\n' + '\n'.join(rows) + '\n', encoding='utf-8')

    def product(self, handle):
        return next(p for p in json.loads(self.products.read_text(encoding='utf-8')) if p['handle'] == handle)

    def test_fills_links_and_reports_unknown_handles(self):
        self.write_csv(
            'test-no-links,https://fi-test-store.myshopify.com/products/test-no-links,,',
            'test-approved,,https://buy.stripe.com/test_new123,12',
            'no-such-product,https://fi-test-store.myshopify.com/products/x,,',
        )
        code, out = run(apply_links, '--csv', str(self.csv), '--products', str(self.products))
        self.assertEqual(code, 1, 'an unmatched handle makes the run fail')
        self.assertIn('no-such-product', out)
        self.assertEqual(self.product('test-no-links')['shopify_url'], 'https://fi-test-store.myshopify.com/products/test-no-links')
        self.assertEqual(self.product('test-approved')['stripe_link'], 'https://buy.stripe.com/test_new123')
        self.assertEqual(self.product('test-approved')['stripe_price_aud'], 12)
        self.assertEqual(self.product('test-approved')['shopify_url'], 'https://fi-test-store.myshopify.com/products/test-approved', 'a blank cell keeps the old value')

    def test_none_clears_and_bad_links_are_skipped(self):
        self.write_csv('test-shopify-link,none,http://buy.stripe.com/plain-http,')
        code, out = run(apply_links, '--csv', str(self.csv), '--products', str(self.products))
        self.assertEqual(code, 1)
        self.assertIn('not an https link', out)
        self.assertEqual(self.product('test-shopify-link')['shopify_url'], '')
        self.assertEqual(self.product('test-shopify-link')['stripe_link'], '')

    def test_dry_run_saves_nothing(self):
        before = self.products.read_text(encoding='utf-8')
        self.write_csv('test-no-links,https://fi-test-store.myshopify.com/products/test-no-links,,')
        code, out = run(apply_links, '--csv', str(self.csv), '--products', str(self.products), '--dry-run')
        self.assertEqual(code, 0)
        self.assertIn('Dry run', out)
        self.assertEqual(self.products.read_text(encoding='utf-8'), before)

    def test_samples_never_get_links(self):
        products = json.loads(self.products.read_text(encoding='utf-8'))
        products[0]['sample'] = True
        products[0]['status'] = 'approved'
        products[0]['shopify_url'] = ''
        self.products.write_text(json.dumps(products), encoding='utf-8')
        self.write_csv(f"{products[0]['handle']},https://fi-test-store.myshopify.com/products/sample,,")
        code, out = run(apply_links, '--csv', str(self.csv), '--products', str(self.products))
        self.assertEqual(code, 1)
        self.assertIn('sample', out)
        self.assertEqual(self.product(products[0]['handle'])['shopify_url'], '')


class CheckProductsTest(unittest.TestCase):
    def setUp(self):
        self.products = json.loads(FIXTURES.read_text(encoding='utf-8'))

    def messages(self, handle, **changes):
        product = next(p for p in self.products if p['handle'] == handle)
        return check_products.check_product({**product, **changes})

    def test_warns_about_live_products_without_a_buy_option(self):
        errors, warnings = self.messages('test-no-links')
        self.assertEqual(errors, [])
        self.assertTrue(any('no buy option' in w for w in warnings))

    def test_warns_when_the_stripe_price_differs(self):
        errors, warnings = self.messages('test-stripe-link', stripe_price_aud=16)
        self.assertTrue(any('Stripe charges A$16 but the page says A$14.5' in w for w in warnings))
        self.assertFalse(any('Stripe charges' in w for w in self.messages('test-stripe-link')[1]), 'matching prices pass')

    def test_warns_about_links_that_are_not_https(self):
        errors, warnings = self.messages('test-shopify-link', shopify_url='http://fi-test-store.myshopify.com/products/x')
        self.assertTrue(any('shopify_url is not an https link' in w for w in warnings))

    def test_secret_keys_are_errors(self):
        errors, warnings = self.messages('test-stripe-link', story_en=f'oops {FAKE_STRIPE_SECRET}')
        self.assertTrue(any('secret key' in e for e in errors))

    def test_scan_finds_secrets_in_files_but_not_env_files(self):
        folder = Path(tempfile.mkdtemp())
        try:
            (folder / 'page.js').write_text(f'const key = "{FAKE_STRIPE_SECRET}"', encoding='utf-8')
            (folder / '.env').write_text(f'STRIPE_SECRET_KEY={FAKE_STRIPE_SECRET}', encoding='utf-8')
            hits = check_products.scan_for_secrets(folder)
            self.assertEqual(len(hits), 1)
            self.assertTrue(hits[0].startswith('page.js'))
        finally:
            shutil.rmtree(folder)

    def test_the_repo_catalogue_passes(self):
        code, out = run(check_products)
        self.assertEqual(code, 0, out)


if __name__ == '__main__':
    unittest.main()
