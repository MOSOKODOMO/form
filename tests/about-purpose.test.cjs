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
  assert.match(statements[3], /We plan to reduce material, construction and supply-chain costs through an online store connecting Australian customers with Chinese suppliers, starting with windows/);
  assert.match(statements[4], /giving Chinese suppliers access to the Australian market/);
  assert.match(statements[4], /could help/);
});

test('About page distinguishes the planned store from the manual pilot', () => {
  assert.match(about, /The online store is our plan, not the current service\./);
  assert.match(about, /Today, our team handles each sourcing request personally/);
  assert.match(about, /id="our-purpose" aria-labelledby="purpose-title"/);
});
