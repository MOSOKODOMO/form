const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dist = path.join(__dirname, '..', 'dist')
const read = (name) => fs.readFileSync(path.join(dist, name), 'utf8')
const catalogue = require('../dist/catalogue.js')
const products = JSON.parse(read('data/products.json'))
const base = products[0]
const variant = (changes) => ({...JSON.parse(JSON.stringify(base)), ...changes})

test('every product in products.json passes the data rules and has its photo', () => {
  assert.ok(Array.isArray(products) && products.length >= 3)
  assert.equal(catalogue.validProducts(products).length, products.length, 'no product is left out')
  for (const product of products) {
    assert.deepEqual(catalogue.productProblems(product), [], product.handle)
    if (!/^https:/.test(product.photo_url)) assert.ok(fs.existsSync(path.join(dist, product.photo_url)), `${product.handle} photo exists`)
  }
  assert.equal(new Set(products.map((product) => product.handle)).size, products.length, 'handles are unique')
  assert.ok(!read('data/products.json').includes('—'), 'no em dashes in product data')
})

test('sample products are clearly marked and can never be bought', () => {
  const samples = products.filter((product) => product.sample)
  assert.equal(samples.length, 3)
  for (const product of samples) {
    assert.match(product.maker, /^Sample maker/)
    assert.match(product.story_en, /^Sample story\./)
    assert.equal(product.stripe_link, '')
    assert.equal(product.shopify_url, '')
    assert.equal(product.shopify_buy_button, '')
    assert.notEqual(product.status, 'live')
    assert.ok(product.certificates.some((check) => check.status === 'verified'), `${product.handle} shows a verified item`)
    assert.ok(product.certificates.some((check) => check.status === 'not stated'), `${product.handle} shows a not-stated item`)
  }
  assert.deepEqual(catalogue.productProblems(variant({stripe_link: 'https://buy.stripe.com/test_abc123'})), ['a sample product cannot be live or have checkout links'])
})

test('the data rules reject bad scores, statuses, links and categories', () => {
  const problems = (changes) => catalogue.productProblems(variant(changes)).join(' | ')
  assert.match(problems({fi_score: 101}), /fi_score/)
  assert.match(problems({fi_score: 85.5}), /fi_score/)
  assert.match(problems({category: 'windows'}), /category/)
  assert.match(problems({maker_url: 'http://example.com'}), /maker_url/)
  assert.match(problems({certificates: [{name: 'Licence', status: 'maybe', link: ''}]}), /status/)
  assert.match(problems({certificates: [{name: 'Licence', status: 'checked', link: 'javascript:alert(1)'}]}), /link/)
  assert.match(problems({photo_url: 'javascript:alert(1)'}), /photo_url/)
  assert.match(problems({sample: false, stripe_link: 'https://example.com/pay'}), /stripe_link/)
  assert.deepEqual(catalogue.productProblems(variant({sample: false, maker: 'Real maker', stripe_link: 'https://buy.stripe.com/test_abc123'})), [])
  const duplicate = catalogue.validProducts([base, base])
  assert.equal(duplicate.length, 1, 'a repeated id is left out')
})

test('the shop sorts by FI Score and filters by category from the URL', () => {
  const list = [
    variant({handle: 'b', product: 'B', fi_score: 70, category: 'tiles'}),
    variant({handle: 'a', product: 'A', fi_score: 90, category: 'handles'}),
    variant({handle: 'c', product: 'C', fi_score: 70, category: 'handles'}),
  ]
  assert.deepEqual(catalogue.sortByScore(list).map((product) => product.handle), ['a', 'b', 'c'], 'highest score first, ties by name')
  assert.deepEqual(catalogue.filterByCategory(list, 'handles').map((product) => product.handle), ['a', 'c'])
  assert.equal(catalogue.filterByCategory(list, 'all').length, 3)
  assert.deepEqual(catalogue.categoryCounts(list), {all: 3, handles: 2, knobs: 0, tiles: 1, taps: 0})
  assert.equal(catalogue.parseCategory('?category=tiles'), 'tiles')
  assert.equal(catalogue.parseCategory('?category=windows'), 'all')
  assert.equal(catalogue.parseCategory(''), 'all')
  assert.equal(catalogue.formatPrice(39), 'A$39')
  assert.equal(catalogue.formatPrice(1290), 'A$1,290')
  assert.equal(catalogue.formatPrice(12.5), 'A$12.50')
})

test('shop page loads the catalogue first and offers every category with a sample notice', () => {
  const shop = read('shop.html')
  assert.ok(shop.indexOf('src="catalogue.js"') < shop.indexOf('src="shop.js"'), 'catalogue loads before the shop script')
  assert.match(shop, /<link rel="stylesheet" href="shop\.css">/)
  const buttons = [...shop.matchAll(/<button class="shop-filter" type="button" data-category="([a-z]+)"/g)].map((match) => match[1])
  assert.deepEqual(buttons, ['all', ...catalogue.CATEGORY_IDS])
  assert.match(shop, /id="product-grid"/)
  assert.match(shop, /id="shop-status"[^>]*role="status"/)
  assert.match(shop, /id="sample-banner"[\s\S]*?not for sale/)
  assert.match(shop, /<noscript>/)
  assert.match(shop, /SORTED BY FI SCORE/)
  const script = read('shop.js')
  assert.match(script, /WaterMark/, 'empty taps explain what taps need')
  assert.doesNotMatch(script, /innerHTML/, 'product text is never inserted as HTML')
  assert.match(script, /el\('a', 'product-card-link', product\.product\)/, 'the card title is the link to the product')
  assert.match(script, /products = FI\.listedProducts\(list\)/, 'drafts and rejected products stay out of the shop')
  assert.match(script, /cardAction\(product\)/, 'cards get their own Buy or quote button')
})

test('photos use the alt text written from the product facts, and samples say they are illustrations', () => {
  const product = {product: 'Example Knurled Brass Pull', sample: false, photo_alt: 'Brass cabinet handle in brushed gold, made by Example Hardware Co., Ltd. in China.'}
  assert.equal(catalogue.imageAlt(product), product.photo_alt)
  assert.equal(catalogue.imageAlt({...product, photo_alt: 'not stated'}), 'Example Knurled Brass Pull')
  assert.equal(catalogue.imageAlt({...product, photo_alt: undefined}), 'Example Knurled Brass Pull')
  assert.match(catalogue.imageAlt(products.find((item) => item.sample)), /^Sample illustration of a /)
})
