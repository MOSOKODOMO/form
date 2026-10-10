const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const about = fs.readFileSync(path.join(__dirname, '../dist/about.html'), 'utf8');

test('About page presents five one-sentence purpose statements', () => {
  const purpose = about.match(/<dl class="about-purpose-list">([\s\S]*?)<\/dl>/);
  assert.ok(purpose, 'Purpose statements use a semantic description list');
  const statements = [...purpose[1].matchAll(/<dd>(.*?)<\/dd>/g)].map((match) => match[1]);
  assert.equal(statements.length, 5);
  for (const statement of statements) {
    assert.match(statement, /^[^.!?]+\.$/, 'Each statement is exactly one sentence');
  }
  assert.match(statements[3], /global manufacturers/);
  assert.match(statements[4], /genuine customer reviews/);
});

test('About page explains the current store and global sourcing focus', () => {
  assert.match(about, /mid-range to luxury/);
  assert.match(about, /China, Thailand, India/);
  assert.match(about, /10% fee on the initial product price/);
  assert.match(about, /<section\b(?=[^>]*\bid="our-purpose")(?=[^>]*\baria-labelledby="purpose-title")[^>]*>/);
});
