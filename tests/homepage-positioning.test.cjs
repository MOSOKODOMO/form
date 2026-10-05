const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const home = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const section = (heading) => {
  const expression = new RegExp('<section\\b(?=[^>]*aria-labelledby="' + heading + '")[^>]*>([\\s\\S]*?)<\\/section>');
  const match = home.match(expression);
  assert.ok(match, 'homepage has a named ' + heading + ' section');
  return match[1];
};

test('homepage leads with a future products-with-proof marketplace, not an existing sale', () => {
  const hero = section('hero-title');
  assert.match(text(hero), /Know who made it\. See the proof/);
  assert.match(text(hero), /building a curated marketplace/);
  assert.match(text(hero), /human-approved record of public evidence/);
  assert.match(hero, /href="shop\.html">Explore the shop/);
  assert.match(hero, /href="how-it-works\.html">How we plan to verify/);
  assert.match(text(hero), /There are no products for sale on this site yet/);
  assert.doesNotMatch(text(hero), /guaranteed savings|always cheaper|verified maker report now available/i);
});

test('the report-framework panel is clearly unpublished', () => {
  const hero = section('hero-title');
  assert.match(hero, /NO REPORT PUBLISHED YET/);
  for (const label of ['Maker identity and trading history', 'Audit badges and documents', 'Certificate register checks', 'FI Score and plain-English verdict']) {
    assert.ok(hero.includes(label), label + ' belongs to the future report framework');
  }
  assert.match(hero, /when a person approved it/);
});

test('homepage connects maker, product and proof before the planned journey', () => {
  const proof = section('proof-title');
  const headings = [...proof.matchAll(/<h3>([^<]+)<\/h3>/g)].map((match) => match[1]);
  assert.deepEqual(headings, ['Who made it?', 'What is being offered?', 'What can be supported?']);
  assert.match(text(proof), /sources used/);
  assert.match(text(proof), /origin story/);
  assert.match(text(proof), /links and a date checked/);
  assert.ok(home.indexOf('id="proof-title"') < home.indexOf('id="steps-title"'));
  assert.ok(home.indexOf('id="steps-title"') < home.indexOf('id="catalogue-title"'));
});

test('homepage explains the empty catalogue and unresolved evidence honestly', () => {
  const catalogue = section('catalogue-title');
  assert.match(text(catalogue), /Only approved records will appear in the shop/);
  assert.match(text(catalogue), /shop and maker directory show an honest empty state/);
  assert.match(text(catalogue), /missing source “not found” rather than treating it as a failed check/);
  assert.match(catalogue, /href="shop\.html">View the shop/);
  assert.match(catalogue, /href="verified-makers\.html">View the maker directory/);
});

test('earlier window research is retained but explicitly deferred', () => {
  assert.match(home, /Windows are coming later/);
  assert.match(home, /Our earlier windows and glass research remains available/);
  assert.match(home, /href="glass-guide\.html">Read the glass guide/);
  assert.doesNotMatch(home, /id="glass" class="window-showcase"|class="quote-card"/);
});
