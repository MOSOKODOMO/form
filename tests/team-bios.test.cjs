const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('founder biographies are consistent across public team pages', () => {
  const biographies = [
    'Prem is a final-year architecture student and an outgoing, talkative salesperson.',
    'Lincy is a final-year architecture student who enjoys communicating through words and visuals.',
    'Mos is a final-year architecture student with a deep passion for coding and technology.',
  ];

  for (const page of ['index.html', 'builders.html', 'about.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'dist', page), 'utf8');
    for (const biography of biographies) {
      assert.ok(html.includes(biography), `${page} should include ${biography}`);
    }
    assert.ok(!html.includes('after the team supplies approved photos'), `${page} should not promise already-supplied portraits`);
  }
});
