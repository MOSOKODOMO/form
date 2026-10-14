const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const FI = require('../dist/catalogue.js');
const products = require('../dist/data/products.json');
const read = file => fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8');

test('collection links filter distinct published products and reject unknown IDs', () => {
  assert.equal(FI.COLLECTION_IDS.length, 5);
  const all = FI.listedProducts(products);
  assert.equal(FI.parseCollection('?collection=unknown'), 'all');
  assert.equal(FI.filterByCollection(all, 'unknown').length, all.length);
  for (const id of FI.COLLECTION_IDS) {
    assert.equal(FI.parseCollection('?collection=' + id), id);
    const matches = FI.filterByCollection(all, id);
    assert.equal(matches.length, id === 'earth-oak' ? 9 : 2, id);
    assert.ok(matches.every(p => p.collections.includes(id)));
    for (const p of matches) assert.deepEqual(FI.productProblems(p), [], p.handle);
  }
  for (const page of ['index.html', 'shop.html']) {
    const html = read(page);
    const cards = [...html.matchAll(/data-collection-card data-collection-id="([^"]+)"[^>]*href="shop.html\?collection=([^#]+)#shop-products"/g)];
    assert.deepEqual(cards.map(m => m[1]), FI.COLLECTION_IDS);
    assert.ok(cards.every(m => m[1] === m[2]));
  }
});

test('all eight approved design enquiries have assets and cannot accept checkout', () => {
  for (const category of ['paintings', 'pendants']) {
    const matches = FI.filterByCategory(products, category);
    assert.equal(matches.length, 4);
    assert.equal(FI.parseCategory('?category=' + category), category);
    assert.equal(FI.categoryCounts(products)[category], 4);
    assert.equal(FI.filterByRoom(matches, 'kitchen').length, 4);
    for (const product of matches) {
      assert.equal(product.status, 'approved');
      assert.equal(product.concept_only, true);
      assert.equal(product.coming_soon, true);
      assert.equal(FI.cardPrice(product).value, 'Coming soon');
      assert.equal(product.price_aud, 'not stated');
      assert.equal(product.source_url, '');
      assert.equal(product.photo_is_reference, true);
      assert.equal(FI.canBuyNow({...product, status:'live', shopify_url:'https://example.myshopify.com/products/test'}), false);
      assert.equal(FI.buyAction(product).kind, 'quote');
      assert.match(FI.imageAlt(product), /not a photograph/);
      const bytes = fs.readFileSync(path.join(__dirname, '../dist', product.photo_url));
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      assert.ok(bytes.length > 5000);
    }
  }
});

test('five-card carousel wraps, shows outer cards, selects neighbours and retains collection links', () => {
  const element = extra => ({dataset:{}, attrs:{}, events:{}, setAttribute(k,v){this.attrs[k]=v}, addEventListener(k,fn){this.events[k]=fn}, ...extra});
  const cards = FI.COLLECTIONS.map(c => element({dataset:{collectionId:c.id,collectionName:c.name},href:'shop.html?collection='+c.id+'#shop-products',focus(){}}));
  const stage=element(), name=element(), count=element(), explore=element();
  const prev=element({dataset:{collectionStep:'-1'}}), next=element({dataset:{collectionStep:'1'}});
  const roots={'.collection-carousel__stage':stage,'.collection-carousel__name':name,'[data-collection-count]':count,'[data-collection-explore]':explore};
  const root=element({querySelector:s=>roots[s],querySelectorAll:s=>s==='[data-collection-card]'?cards:[prev,next],classList:{add(){}}});
  const window={location:{search:'?collection=summer-house'},addEventListener(){}};
  vm.runInNewContext(read('collection-carousel.js'), {document:{querySelectorAll:()=>[root],activeElement:null},window,URLSearchParams,Date});
  assert.equal(name.textContent, 'Summer House');
  assert.equal(count.textContent, '02 / 05');
  assert.deepEqual(cards.map(c=>c.dataset.position), ['left','center','right','far-right','far-left']);
  assert.ok(cards.every(c=>c.attrs['aria-hidden']==='false'));
  root.events.keydown({key:'End',preventDefault(){}});
  next.events.click();
  assert.equal(count.textContent, '01 / 05');
  prev.events.click();
  assert.equal(count.textContent, '05 / 05');
  let prevented=false;
  cards[2].events.click({preventDefault(){prevented=true}});
  assert.equal(prevented,true);
  assert.equal(name.textContent,'Forest Retreat');
  assert.equal(explore.href,'shop.html?collection=forest-retreat#shop-products');
});
