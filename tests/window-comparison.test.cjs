const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (page) => fs.readFileSync(path.join(__dirname, '..', 'dist', page), 'utf8');
const home = read('index.html');
const shop = read('shop.html');
const pilot = read('builders.html');
const pricing = read('pricing.html');

test('current storefront does not present a historical window comparison as a product listing', () => {
  assert.doesNotMatch(home, /window-comparison--pair|quote-card(?:-featured)?|Thai window estimate|Stegbar/);
  assert.doesNotMatch(shop, /window-comparison--pair|quote-card(?:-featured)?|Thai window estimate|Stegbar/);
  assert.match(home, /There are no products for sale on this site yet/);
});

test('earlier sourcing terms are visibly scoped to the legacy pilot', () => {
  assert.match(pricing, /class="legacy-notice"/);
  assert.match(pricing, /these terms describe our original sourcing service, not products in the shop/);
  assert.match(pricing, /href="shop\.html">See the shop in preparation/);
  assert.match(pilot, /class="legacy-notice"/);
  assert.match(pilot, /this page describes our original request-led service/);
});

test('earlier comparison examples remain explicitly fictional rather than current product prices', () => {
  assert.match(pilot, /Sample figures only/);
  assert.match(pilot, /fictional numbers illustrate the format/);
  assert.match(pilot, /not supplier quotes, current prices or an offer to supply/);
  assert.equal((pilot.match(/<article class="quote-card(?: quote-card-featured)?">/g) || []).length, 3);
});
