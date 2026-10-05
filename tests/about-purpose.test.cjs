const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const about = fs.readFileSync(path.join(__dirname, '../dist/about.html'), 'utf8');
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

test('About page explains the curate, check and learn purpose', () => {
  const purpose = about.match(/<section\b(?=[^>]*aria-labelledby="purpose-title")[^>]*>([\s\S]*?)<\/section>/);
  assert.ok(purpose, 'Purpose section has an accessible heading');
  const cards = [...purpose[1].matchAll(/<article class="fi-card">([\s\S]*?)<\/article>/g)].map((match) => text(match[1]));
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map((card) => card.match(/0[1-3] \/ (CURATE|CHECK|LEARN)/)?.[1]), ['CURATE', 'CHECK', 'LEARN']);
  assert.match(cards[0], /high-end products/);
  assert.match(cards[1], /public evidence/);
  assert.match(cards[1], /human-approved verdict/);
  assert.match(cards[2], /buyer feedback/);
});

test('About page distinguishes the prepared marketplace from published inventory', () => {
  assert.match(about, /id="today-title">The framework comes first/);
  assert.match(about, /We have not published a product or an approved maker report on this site yet/);
  assert.match(about, /Product details, public sources and review status need to be connected/);
  assert.match(about, /Windows are coming later/);
  assert.match(about, /href="glass-guide\.html">Read the glass guide/);
});
