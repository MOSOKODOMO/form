const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'dist', file), 'utf8');
const pages = ['index.html', 'how-it-works.html'];
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const journey = (page) => {
  const html = read(page);
  const match = html.match(/<section\b(?=[^>]*data-motion-section="Four steps")(?=[^>]*aria-labelledby="steps-title")[^>]*>([\s\S]*?)<\/section>/);
  assert.ok(match, page + ' exposes a named four-step journey');
  return match[1];
};

test('both public journey entry points show Verify, List, Buy and Review in order', () => {
  for (const page of pages) {
    const content = journey(page);
    assert.match(content, /<h2 id="steps-title">Verify\. List\. Buy\. Review\.<\/h2>/);
    const steps = [...content.matchAll(/<li><span>(0[1-4] \/ [A-Z]+)<\/span><h3>([^<]+)<\/h3><p>([^<]+)<\/p><\/li>/g)];
    assert.equal(steps.length, 4, page + ' has four readable steps without JavaScript');
    assert.deepEqual(steps.map((step) => step[1]), ['01 / VERIFY', '02 / LIST', '03 / BUY', '04 / REVIEW']);
    assert.doesNotMatch(content, /<script\b|\shidden(?:\s|=|>)/i);
  }
});

test('the journey keeps approval and payment gates explicit', () => {
  const home = text(journey('index.html'));
  const method = text(journey('how-it-works.html'));
  assert.match(home, /a person approve the report/);
  assert.match(home, /once the record is approved/);
  assert.match(home, /Ordering will open after product terms, availability and payment details are confirmed/);
  assert.match(method, /payment terms must be confirmed before online ordering opens/);
  assert.match(method, /No customer-review data exists yet/);
  assert.doesNotMatch(read('index.html'), /href="(?:https:\/\/buy\.stripe\.com|https:\/\/checkout\.stripe\.com)/);
});

test('method page defines a provisional score and human certificate review', () => {
  const method = read('how-it-works.html');
  assert.match(method, /40% OF FULL RUBRIC/);
  assert.match(method, /30% OF FULL RUBRIC/);
  assert.equal((method.match(/15% OF FULL RUBRIC/g) || []).length, 2);
  assert.match(method, /at least 75% coverage/);
  assert.match(method, /Insufficient evidence/);
  assert.match(method, /“Not found” means we could not locate a source; it does not mean the maker failed/);
  assert.match(method, /Only a person can mark a certificate Verified/);
  assert.match(method, /Every report needs human approval before publication/);
});
