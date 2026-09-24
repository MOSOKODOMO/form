const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pages = ['index.html', 'how-it-works.html', 'services.html', 'pricing.html', 'about.html', 'contact.html', 'auth.html', 'stage2.html', 'builders.html', 'glass-guide.html', 'feedback.html', 'privacy.html'];
const expected = [
  ['./', 'Home'], ['how-it-works.html', 'How it works'], ['services.html', 'Services'],
  ['pricing.html', 'Pricing'], ['about.html', 'About'], ['contact.html', 'Contact'],
  ['auth.html', 'Log in'], ['stage2.html#request', 'Send a request ↗'],
];
const read = name => fs.readFileSync(path.join(__dirname, '..', 'dist', name), 'utf8');

test('every public page retains the same complete primary navigation in the same order', () => {
  for (const page of pages) {
    const html = read(page);
    const nav = html.match(/<nav class="site-nav" aria-label="Primary navigation">([\s\S]*?)<\/nav>/);
    assert.ok(nav, `${page} has the public menu`);
    const links = [...nav[1].matchAll(/<a\b([^>]*)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)];
    assert.deepEqual(links.map(link => [link[2], link[4].replace(/<[^>]+>/g, '').trim()]), expected, page);
    const current = page === 'index.html' ? './' : page === 'stage2.html' ? 'stage2.html#request' : page;
    for (const link of links) {
      assert.equal(`${link[1]}${link[3]}`.includes('aria-current="page"'), link[2] === current, `${page}: ${link[2]} active state`);
    }
    assert.match(html, /class="site-header site-header--public"/);
    assert.ok(html.includes('href="builders.css"') || html.includes('href="site-navigation.css"'), `${page} loads navigation styling`);
  }
});

test('navigation remains visible without JavaScript and uses fixed mobile columns', () => {
  const css = read('site-navigation.css');
  assert.match(read('builders.css'), /@import url\('site-navigation.css'\)/);
  assert.match(css, /scrollbar-gutter: stable/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(css, /display:\s*none|visibility:\s*hidden/);
});

test('request utilities and authentication hooks remain available', () => {
  const request = read('stage2.html');
  for (const hook of ['id="account-link"', 'href="#admin"', 'data-lang="en"', 'data-lang="zh"']) assert.ok(request.includes(hook), hook);
  assert.match(read('account.html'), /id="sign-out"/);
});
