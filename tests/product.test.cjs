const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dist = path.join(__dirname, '..', 'dist')
const read = (name) => fs.readFileSync(path.join(dist, name), 'utf8')
const catalogue = require('../dist/catalogue.js')
const products = JSON.parse(read('data/products.json'))
const sample = products[0]
const real = {...sample, sample: false, status: 'live', maker: 'Real maker', stripe_link: 'https://buy.stripe.com/test_abc123'}

test('samples never get a buy button, and a live product buys through its Stripe Payment Link', () => {
  for (const product of products.filter((item) => item.sample)) {
    const action = catalogue.buyAction(product)
    assert.equal(action.kind, 'none')
    assert.equal(action.label, 'Sample: not for sale')
    assert.equal(action.href, undefined)
  }
  assert.equal(catalogue.buyAction({...real, stripe_link: ''}).kind, 'quote')
  assert.equal(catalogue.buyAction({...real, stripe_link: 'https://evil.example/pay'}).kind, 'quote')
  const live = catalogue.buyAction(real)
  assert.equal(live.kind, 'link')
  assert.equal(live.href, 'https://buy.stripe.com/test_abc123')
})

test('the gallery shows the photo first and the origin story last', () => {
  for (const product of products) {
    const items = catalogue.galleryItems(product)
    assert.equal(items[0].type, 'photo')
    assert.equal(items[0].src, product.photo_url)
    assert.match(items[0].alt, /\w/)
    const story = items.at(-1)
    assert.equal(story.type, 'story')
    assert.equal(story.text, product.story_en)
    assert.match(story.title, new RegExp(product.maker))
    assert.equal(story.place, product.country)
  }
})

test('the trust panel shows each check as verified, claimed, failed or not stated, linking only verified ones', () => {
  const checks = catalogue.checkItems(sample)
  assert.equal(checks.length, sample.certificates.length)
  sample.certificates.forEach((certificate, index) => {
    assert.equal(checks[index].name, certificate.name)
    assert.equal(checks[index].status, catalogue.CHECK_LABELS[certificate.status])
    assert.equal(checks[index].link, certificate.status === 'verified' ? certificate.link || null : null)
  })
  const states = catalogue.checkItems({certificates: [
    {name: 'A', status: 'verified', link: 'https://www.iafcertsearch.org/'},
    {name: 'B', status: 'claimed', link: 'https://example.com/claim'},
    {name: 'C', status: 'failed', link: ''},
    {name: 'D', status: 'not stated', link: ''},
  ]})
  assert.deepEqual(states.map((check) => check.status), ['Verified', 'Claimed, not yet checked', 'Failed our check', 'Not stated'])
  assert.deepEqual(states.map((check) => check.link), ['https://www.iafcertsearch.org/', null, null, null], 'only verified checks link to where we checked')
  assert.equal(catalogue.checkItems({certificates: [{name: 'X', status: 'verified', link: 'javascript:alert(1)'}]})[0].link, null, 'unsafe links are dropped')
  assert.equal(catalogue.checkSummary(sample), '2 of 3 verified')
  assert.match(catalogue.productProblems({...sample, certificates: [{name: 'X', status: 'checked', link: ''}]}).join(), /status must be one of verified, claimed, failed, not stated/)
  assert.equal(catalogue.galleryItems({...sample, story_en: 'not stated'}).at(-1).text, 'We haven’t recorded this maker’s story yet.')
  assert.deepEqual(catalogue.specRows(sample).map(([name]) => name), ['Material', 'Finishes', 'Sizes', 'Made in', 'Maker'])
  assert.equal(catalogue.findProduct(products, sample.handle), sample)
  assert.equal(catalogue.findProduct(products, 'missing'), null)
})

test('product page loads the catalogue first and builds everything without raw HTML', () => {
  const page = read('product.html')
  assert.ok(page.indexOf('src="catalogue.js"') < page.indexOf('src="product.js"'))
  assert.match(page, /<link rel="stylesheet" href="shop\.css">/)
  assert.match(page, /<nav class="product-crumbs" aria-label="Breadcrumb">/)
  assert.match(page, /id="product"/)
  assert.match(page, /<noscript>/)
  const script = read('product.js')
  assert.doesNotMatch(script, /innerHTML/)
  assert.match(script, /'Why we trust this maker'/)
  assert.match(script, /rel = 'noopener noreferrer'/, 'outside links open safely')
  assert.match(script, /const action = FI\.buyAction\(product\)/, 'the buy area follows the shared buy rules')
  assert.match(script, /FI\.purchaseFacts\(product\)/, 'price, ships from and delivery come from the stated facts')
  assert.match(script, /FI\.parseHandle\(window\.location\.search\)/)
  assert.match(script, /We couldn’t find that product/)
})
