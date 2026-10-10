const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const FI = require('../dist/catalogue.js')
const products = require('../dist/data/products.json')
const audit = require('../project-planning/catalogue-source-audit.json')
const renders = require('../project-planning/catalogue-render-prompts.json')

test('every catalogue product retains its audited supplier source and finding', () => {
  assert.equal(audit.length, products.length)
  for (const product of products) {
    const finding = audit.find(row => row.handle === product.handle)
    assert.ok(finding, product.handle)
    assert.equal(finding.source_url, product.source_url)
    assert.equal(finding.status, product.source_check_status)
    assert.equal(product.source_checked_on, '2026-10-10')
    assert.ok(product.source_check_note.length > 40)
    assert.doesNotMatch(FI.sourceEvidence(product).label, /verified/i)
  }
})

test('render assets carry their own source provenance, accessible disclosure and real WebP files', () => {
  assert.equal(renders.length, 18)
  for (const render of renders) {
    const product = products.find(p => p.handle === render.handle)
    assert.ok(product, render.handle)
    assert.equal(product.photo_url, render.asset)
    assert.equal(render.source_url, product.source_url)
    assert.equal(product.photo_is_render, true)
    assert.match(FI.imageAlt(product), /^AI render/i)
    assert.match(product.photo_caption, /not a product photograph/)
    assert.ok(FI.isHttps(render.reference_url))
    const bytes = fs.readFileSync(path.join(__dirname, '../dist', render.asset))
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
  }
})

test('unavailable sources and the ambiguous Yuming item never get guessed renders', () => {
  for (const handle of ['decormate-solid-brass-drawer-knob', 'benme-brass-robe-hooks', 'yuming-stainless-towel-bar-60']) {
    const product = products.find(p => p.handle === handle)
    assert.equal(product.photo_is_render, false)
    assert.ok(!renders.some(row => row.handle === handle))
    assert.notEqual(product.source_check_status, 'listing_found')
  }
})

test('unresolved source evidence blocks direct checkout even when a product has live payment links', () => {
  const base = {...products[0], status:'live', shopify_url:'https://example.com/checkout'}
  for (const status of ['details_unclear', 'unavailable']) {
    const action = FI.buyAction({...base, source_check_status:status})
    assert.equal(action.kind, 'quote')
    assert.equal(action.label, 'Confirm product details')
    assert.match(action.href, /^contact\.html\?/)
    assert.match(action.note, /before accepting an order/)
  }
  assert.equal(FI.buyAction({...base, source_check_status:'listing_found'}).kind, 'link')
})

test('source links and render labels remain safe when imported metadata is incomplete or invalid', () => {
  assert.equal(FI.sourceEvidence({source_url:'javascript:alert(1)'}).href, null)
  assert.equal(FI.sourceEvidence({source_url:'http://example.com'}).href, null)
  assert.equal(FI.sourceEvidence({}).label, 'Source not checked')
  assert.match(FI.imageAlt({product:'Cabinet handle', photo_is_render:true}), /^AI render/)
  assert.equal(FI.imageAlt({product:'Cabinet handle', photo_is_render:false}), 'Cabinet handle')
  assert.match(FI.productProblems({...products[0], source_url:'javascript:alert(1)'}).join(), /source_url/)
})
