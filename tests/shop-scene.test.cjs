const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const FI = require('../dist/catalogue.js');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'dist', name), 'utf8');
const products = JSON.parse(read('data/products.json'));

test('every unnumbered room hotspot opens a listed product', () => {
  const home = read('index.html');
  const scene = home.slice(home.indexOf('<figure class="editorial-hero-image"'), home.indexOf('<nav class="collection-nav"'));
  const handles = [...scene.matchAll(/href="product.html\?handle=([a-z0-9-]+)"/g)].map(match => match[1]);
  assert.equal(handles.length, 9);
  for (const handle of handles) {
    const product = products.find(item => item.handle === handle);
    assert.ok(product && FI.isListed(product), handle);
    assert.deepEqual(FI.productProblems(product), []);
  }
  assert.equal(new Set(handles).size, 9);
  assert.doesNotMatch(scene, /scene-marker|scene-pieces|Shop the room/);
  const chosen = read('home-collection.js').match(/const chosen = \[(.*?)\];/)[1];
  const featured = [...chosen.matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.equal(featured.length, 5);
  assert.deepEqual(new Set(featured), new Set(handles.filter(handle => !products.find(p => p.handle === handle).concept_only)));
  for (const product of products.filter(p => p.concept_only)) assert.ok(!featured.includes(product.handle));
  const renders = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'project-planning', 'scene-studio-renders.json')));
  assert.equal(renders.images.length, 9);
  for (const render of renders.images) assert.ok(fs.statSync(path.join(__dirname, '..', render.asset)).size > 0);
});

test('furniture and decoration work in category filters and kitchen browsing', () => {
  const listed = FI.listedProducts(products);
  for (const category of ['furniture', 'decoration']) {
    assert.equal(FI.parseCategory('?category=' + category), category);
    const matches = FI.filterByCategory(listed, category);
    assert.ok(matches.length > 0);
    assert.ok(FI.filterByRoom(listed, 'kitchen').some(p => p.category === category));
    assert.equal(FI.categoryCounts(listed)[category], matches.length);
  }
});

test('similar sourced pieces cannot accidentally accept payment or present a concept as a product photo', () => {
  const candidates = products.filter(p => p.sourcing_only);
  assert.equal(candidates.length, 16);
  for (const product of candidates) {
    assert.equal(product.price_aud, 'not stated');
    if (product.concept_only) assert.equal(product.source_url, '');
    else assert.match(product.source_url, /^https:\/\//);
    assert.equal(product.photo_is_reference, true);
    assert.match(FI.imageAlt(product), /not a photograph/);
    assert.equal(FI.buyAction(product).kind, 'quote');
    assert.equal(FI.canBuyNow({...product, status:'live', shopify_url:'https://example.myshopify.com/products/test', stripe_link:'https://buy.stripe.com/abc123'}), false);
    assert.equal(product.certificates.some(check => check.status === 'verified'), false);
  }
});
