const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const catalogue = require('../dist/catalogue.js')
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'checkout-products.json'), 'utf8'))
const byHandle = Object.fromEntries(fixtures.map((product) => [product.handle, product]))
const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'dist', name), 'utf8')
// Built at run time so no secret-looking string ever sits in the repo.
const fakeStripeSecret = ['sk', 'live', 'x'.repeat(16)].join('_')
const fakeShopifyAdmin = 'shp' + 'at_' + 'y'.repeat(16)

test('every checkout fixture passes the product rules', () => {
  assert.equal(catalogue.validProducts(fixtures).length, fixtures.length)
})

test('live products buy through the Shopify embed, then a Shopify link, then Stripe, then a quote', () => {
  const embed = catalogue.buyAction(byHandle['test-shopify-embed'])
  assert.equal(embed.kind, 'embed')
  assert.deepEqual(embed.embed, {domain: 'fi-test-store.myshopify.com', storefrontAccessToken: '0123456789abcdef0123456789abcdef', productId: '1234567890'})
  assert.equal(embed.sdk, 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js')
  assert.equal(embed.fallback.href, byHandle['test-shopify-embed'].shopify_url, 'if the embed fails, the Shopify link takes over')

  const shopify = catalogue.buyAction(byHandle['test-shopify-link'])
  assert.deepEqual([shopify.kind, shopify.label, shopify.href], ['link', 'Buy', byHandle['test-shopify-link'].shopify_url])

  const stripe = catalogue.buyAction(byHandle['test-stripe-link'])
  assert.deepEqual([stripe.kind, stripe.label, stripe.href], ['link', 'Buy', 'https://buy.stripe.com/test_fixture123'])

  const quote = catalogue.buyAction(byHandle['test-no-links'])
  assert.equal(quote.kind, 'quote')
  assert.equal(quote.label, 'Request a quote')
  assert.equal(quote.href, 'contact.html?product=Test%20product%20with%20no%20checkout%20link#contact-form')

  const both = catalogue.buyAction({...byHandle['test-shopify-link'], stripe_link: 'https://buy.stripe.com/test_both'})
  assert.equal(both.href, byHandle['test-shopify-link'].shopify_url, 'Shopify comes before Stripe')
})

test('only live products can be bought; drafts, rejected products and samples get no buy button', () => {
  assert.equal(catalogue.buyAction(byHandle['test-approved']).kind, 'quote', 'approved but not live: quote only, even with a Shopify link')
  for (const status of ['draft', 'rejected']) {
    const action = catalogue.buyAction({...byHandle['test-draft'], status})
    assert.equal(action.kind, 'none', `${status} has no buy button`)
    assert.equal(action.href, undefined)
  }
  const samples = JSON.parse(read('data/products.json')).filter((product) => product.sample)
  for (const product of samples) assert.equal(catalogue.buyAction(product).kind, 'none')
  assert.match(catalogue.productProblems({...samples[0], status: 'live'}).join(), /sample product cannot be live/)
})

test('the shop lists approved and live products only', () => {
  const listed = catalogue.listedProducts(fixtures).map((product) => product.handle)
  assert.ok(!listed.includes('test-draft'))
  assert.ok(listed.includes('test-approved') && listed.includes('test-shopify-link'))
  assert.ok(!catalogue.listedProducts([{...byHandle['test-approved'], status: 'rejected'}]).length)
})

test('price, ships from and delivery appear under the button only when stated', () => {
  assert.deepEqual(catalogue.purchaseFacts(byHandle['test-shopify-link']), [
    {label: 'Price', value: 'A$45 each, incl. GST'},
    {label: 'Ships from', value: 'Sydney, Australia'},
    {label: 'Delivery', value: '5 to 8 business days'},
  ])
  assert.deepEqual(catalogue.purchaseFacts(byHandle['test-stripe-link']), [{label: 'Price', value: 'A$14.50 each, incl. GST'}])
  assert.deepEqual(catalogue.purchaseFacts(byHandle['test-no-links']), [])
  assert.deepEqual(catalogue.cardPrice(byHandle['test-no-links']), {value: 'Price on request', unit: ''})
  assert.equal(catalogue.specRows(byHandle['test-shopify-link'])[0][1], 'Not stated')
})

test('Buy Button snippets are read for their ids only, and unreadable ones are ignored', () => {
  const snippet = byHandle['test-shopify-embed'].shopify_buy_button
  assert.ok(catalogue.parseShopifyBuyButton(snippet))
  assert.equal(catalogue.parseShopifyBuyButton(snippet.replace('fi-test-store.myshopify.com', 'evil.example.com')), null)
  assert.equal(catalogue.parseShopifyBuyButton(snippet.replace(/storefrontAccessToken: '[^']+'/, '')), null)
  assert.equal(catalogue.parseShopifyBuyButton(''), null)
  const broken = catalogue.buyAction({...byHandle['test-shopify-embed'], shopify_buy_button: '<div>not a snippet</div>'})
  assert.equal(broken.kind, 'link', 'falls back to the Shopify link')
  assert.doesNotMatch(read('product.js'), /innerHTML|new Function|eval\(/, 'the snippet is never run as code')
})

test('secret keys in product data are refused', () => {
  assert.ok(catalogue.containsSecret({notes: `key ${fakeStripeSecret}`}))
  assert.ok(catalogue.containsSecret([fakeShopifyAdmin]))
  assert.ok(!catalogue.containsSecret(byHandle['test-shopify-embed']), 'a public storefront token is not a secret')
  const problems = catalogue.productProblems({...byHandle['test-stripe-link'], stripe_link: `https://buy.stripe.com/${fakeStripeSecret}`})
  assert.match(problems.join(), /secret key/)
})

test('product links use the handle, and quote requests prefill the contact form', () => {
  assert.equal(catalogue.productUrl(byHandle['test-draft']), 'product.html?handle=test-draft')
  assert.equal(catalogue.parseHandle('?handle=test-draft'), 'test-draft')
  assert.equal(catalogue.parseHandle('?id=old-link'), 'old-link', 'older ?id= links still work')
  assert.match(read('contact-form.js'), /get\('product'\)/)
  assert.match(read('contact.html'), /id="contact-form" data-contact-block/)
  assert.match(read('privacy.html'), /checkout happens on Shopify’s or Stripe’s own pages/)
})
