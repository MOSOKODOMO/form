const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pages = ['index.html', 'shop.html', 'product.html', 'verified-makers.html', 'how-it-works.html', 'partner.html', 'about.html', 'contact.html', 'auth.html', 'services.html', 'pricing.html', 'stage2.html', 'builders.html', 'glass-guide.html', 'feedback.html', 'privacy.html'];
const expected = [
  ['./', 'Home'], ['shop.html', 'Shop'], ['verified-makers.html', 'Verified makers'],
  ['how-it-works.html', 'How it works'], ['partner.html', 'Partner with us'],
  ['about.html', 'About'], ['contact.html', 'Contact'], ['auth.html', 'Log in'],
];
const read = name => fs.readFileSync(path.join(__dirname, '..', 'dist', name), 'utf8');

test('every public page retains the same complete primary navigation in the same order', () => {
  for (const page of pages) {
    const html = read(page);
    const nav = html.match(/<nav class="site-nav" aria-label="Primary navigation">([\s\S]*?)<\/nav>/);
    assert.ok(nav, `${page} has the public menu`);
    const links = [...nav[1].matchAll(/<a\b([^>]*)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)];
    assert.deepEqual(links.map(link => [link[2], link[4].replace(/<[^>]+>/g, '').trim()]), expected, page);
    const current = page === 'index.html' ? './' : page === 'product.html' ? 'shop.html' : page;
    for (const link of links) {
      assert.equal(`${link[1]}${link[3]}`.includes('aria-current="page"'), link[2] === current, `${page}: ${link[2]} active state`);
    }
    assert.match(html, /class="site-header site-header--public"/);
    assert.ok(html.includes('href="builders.css"') || html.includes('href="site-navigation.css"'), `${page} loads navigation styling`);
  }
});

test('navigation remains visible without JavaScript and uses readable mobile columns', () => {
  const css = read('site-navigation.css');
  assert.match(read('builders.css'), /@import url\('site-navigation.css'\)/);
  assert.match(css, /scrollbar-gutter: stable/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(css, /display:\s*none|visibility:\s*hidden/);
});

test('request utilities and authentication hooks remain available', () => {
  const request = read('stage2.html');
  for (const hook of ['id="account-link"', 'href="#admin"', 'data-lang="en"', 'data-lang="zh"']) assert.ok(request.includes(hook), hook);
  assert.match(read('account.html'), /id="sign-out"/);
});
