const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'dist', name), 'utf8');
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const pages = ['docs.html', 'support.html', 'bug-report.html', 'legal.html', 'ai.html'];

test('new help pages keep the shared navigation, skip link, landmarks and one h1', () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /class="site-header site-header--public"/, page);
    assert.match(html, /<a class="skip-link" href="#main">/, page);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${page} has one h1`);
    assert.equal((html.match(/<main\b/g) || []).length, 1, page);
    assert.match(html, /<meta name="viewport"/, page);
    assert.doesNotMatch(html, /—/, `${page} has no em dashes`);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, `${page} has no inline script`);
  }
});

test('every in-page link on the new pages points at a real anchor and every local link at a real file', () => {
  for (const page of pages) {
    const html = read(page);
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (/^(https?:|mailto:)/.test(href)) continue;
      const [rawFile, hash] = href.split('#');
      const file = rawFile.split('?')[0];
      if (!file && hash) { assert.ok(ids.has(hash), `${page}: #${hash}`); continue; }
      const target = file === './' || file === '' ? 'index.html' : file;
      assert.ok(fs.existsSync(path.join(__dirname, '..', 'dist', target)), `${page}: ${href}`);
      if (hash) assert.ok(new RegExp(`id="${hash}"`).test(read(target)), `${page}: ${href} anchor`);
    }
  }
});

test('docs match the live shop rules and do not reveal the internal pricing formula', () => {
  const docs = text(read('docs.html'));
  for (const fact of ['A$11', 'A$100', 'FOUNDING10', '31 October 2026', '2 to 3 weeks', 'Black, Brass or Silver']) assert.ok(docs.includes(fact), fact);
  assert.doesNotMatch(docs, /2\.5 times|1\.7 times|rounded up to a price ending/);
  assert.match(read('docs.html'), /id="problems"/);
});

test('policies describe direct delivery, overseas disclosure and cannot remove consumer rights', () => {
  const privacy = text(read('privacy.html')), terms = text(read('terms.html')), returns = text(read('returns.html')), order = text(read('order-terms.html'));
  assert.match(privacy, /Overseas disclosure/);
  assert.match(privacy, /Service logs/);
  assert.match(privacy, /Global Privacy Control/);
  assert.match(terms, /Shop orders\./);
  assert.match(terms, /governed by the law of Victoria/);
  assert.match(terms, /nothing in them limits your rights under the Australian Consumer Law/);
  assert.match(returns, /Once the supplier has dispatched/);
  assert.match(returns, /consumer rights apply in full/);
  assert.match(order, /Shop orders \(Buy button\)/);
  for (const page of [privacy, terms, returns, order]) assert.doesNotMatch(page, /exclude all (?:liability|warranties|guarantees)|consumer guarantees do not apply/i);
});

test('every public page links to docs, support, legal and AI at FI from its footer', () => {
  for (const file of fs.readdirSync(path.join(__dirname, '..', 'dist')).filter(f => f.endsWith('.html'))) {
    const html = read(file);
    const footer = html.match(/<div class="site-footer-links">([\s\S]*?)<\/div>/);
    if (!footer) continue;
    for (const href of ['docs.html', 'support.html', 'legal.html', 'ai.html']) assert.ok(footer[1].includes(`href="${href}"`), `${file} footer links ${href}`);
  }
});

test('the bug report form is accessible, has a honeypot, and sends only to the team inbox', () => {
  const html = read('bug-report.html'), script = read('bug-report.js');
  assert.match(html, /<form id="bug-form"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /name="website" tabindex="-1" autocomplete="off"/);
  assert.match(script, /formsubmit\.co\/ajax\/fabricationintelligence@gmail\.com/);
  assert.doesNotMatch(script, /innerHTML|eval\(/);
  assert.match(script, /safePath/);
});

test('the AI page lists connected and planned tools honestly and shows no private data', () => {
  const ai = text(read('ai.html'));
  for (const tool of ['Notion', 'Shopify', 'Stripe', 'Supabase', 'GitHub', 'Google Calendar', 'Email inbox', 'Axiom', 'Supplier ordering']) assert.ok(ai.includes(tool), tool);
  assert.match(read('ai.html'), /docs-status--planned">Planned/);
  assert.match(ai, /A founder reviews it\. Nothing goes live without this step|Nothing goes live without this step/);
  assert.doesNotMatch(read('ai.html'), /@(?!fabricationintelligence)[a-z0-9.-]+\.[a-z]{2,}/i);
});
