const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pages = ['index.html', 'shop.html', 'product.html', 'rankings.html', 'partner.html', 'verified-makers.html', 'windows.html', 'how-it-works.html', 'reviews.html', 'about.html', 'contact.html', 'auth.html', 'stage2.html', 'builders.html', 'glass-guide.html', 'feedback.html', 'privacy.html', 'terms.html', 'shipping.html', 'returns.html'];
const expected = [
  ['./', 'Home'], ['shop.html', 'Shop'], ['how-it-works.html', 'How it works'],
  ['reviews.html', 'Product reviews'], ['about.html', 'About'], ['contact.html', 'Work with us'],
  ['auth.html', 'Log in'], ['shop.html', 'Shop collection ↗'],
];
const read = name => fs.readFileSync(path.join(__dirname, '..', 'dist', name), 'utf8');

test('old service links lead to the combined process, fees and inspection page', () => {
  const combined = read('how-it-works.html');
  assert.match(read('services.html'), /content="0;url=how-it-works\.html#service-fee"/);
  for (const anchor of ['order-journey', 'service-fee', 'fi-verify']) {
    assert.equal((combined.match(new RegExp(`id="${anchor}"`, 'g')) || []).length, 1);
  }
  assert.match(combined, /If a check fails, shipping waits/);
  assert.match(combined, /do not substitute another product without your agreement/);
  assert.match(combined, /10% of the initial product price/);
  assert.match(combined, /Our condition promise/);
  assert.match(read('shop.html'), /href="how-it-works\.html#service-fee">Our inspection service/);
});

test('every public page retains the same complete primary navigation in the same order', () => {
  for (const page of pages) {
    const html = read(page);
    const nav = html.match(/<nav class="site-nav" aria-label="Primary navigation">([\s\S]*?)<\/nav>/);
    assert.ok(nav, `${page} has the public menu`);
    const links = [...nav[1].matchAll(/<a\b([^>]*)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)];
    assert.deepEqual(links.map(link => [link[2], link[4].replace(/<[^>]+>/g, '').trim()]), expected, page);
    // Product pages belong to the shop; windows.html is a coming-later page outside the menu.
    const currents = {'index.html': './', 'stage2.html': null, 'builders.html': null, 'reviews.html': 'reviews.html', 'product.html': 'shop.html', 'windows.html': null};
    const current = Object.hasOwn(currents, page) ? currents[page] : page;
    for (const link of links) {
      assert.equal(`${link[1]}${link[3]}`.includes('aria-current="page"'), link[2] === current && !link[1].includes('nav-cta'), `${page}: ${link[2]} active state`);
    }
    assert.match(html, /class="site-header site-header--public"/);
    assert.ok(html.includes('href="builders.css"') || html.includes('href="site-navigation.css"'), `${page} loads navigation styling`);
  }
});

test('navigation remains visible without JavaScript and uses fixed mobile columns', () => {
  const css = read('site-navigation.css');
  assert.match(read('builders.css'), /@import url\('site-navigation.css[^']*'\)/);
  assert.match(css, /scrollbar-gutter: stable/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(css, /display:\s*none|visibility:\s*hidden/);
});

test('legacy request URLs lead to the store and account controls remain available', () => {
  assert.match(read('stage2.html'), /href="orders.html"/);
  assert.match(read('stage2.html'), /href="shop.html"/);
  assert.doesNotMatch(read('stage2.html'), /<form|stage2\.js/);
  assert.match(read('account.html'), /id="sign-out"/);
})
