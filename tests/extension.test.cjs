const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const M = require('../extension/match.js')
const products = require('../dist/data/products.json')

const ext = (name) => fs.readFileSync(path.join(__dirname, '../extension', name), 'utf8')
const dist = (name) => fs.readFileSync(path.join(__dirname, '../dist', name), 'utf8')

test('manifest is version 3 with only the permissions it needs and no remote code', () => {
  const manifest = JSON.parse(ext('manifest.json'))
  assert.equal(manifest.manifest_version, 3)
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'scripting', 'storage'])
  assert.deepEqual(manifest.host_permissions, ['https://fabricationintelligence.com/*'])
  assert.equal(manifest.content_scripts, undefined)
  assert.equal(manifest.content_security_policy, undefined)
  for (const size of ['16', '48', '128']) assert.ok(fs.existsSync(path.join(__dirname, '../extension', manifest.icons[size])))
  assert.doesNotMatch(JSON.stringify(manifest), /<all_urls>|\*:\/\/\*|"tabs"|"history"|"cookies"/)
})

test('popup builds results with text nodes only, loads no remote script and sends nothing about the page', () => {
  const js = ext('popup.js')
  const html = ext('popup.html')
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/)
  assert.doesNotMatch(html, /<script[^>]+src="https?:/)
  const fetches = js.match(/fetch\([^)]*\)/g) || []
  assert.deepEqual(fetches, ['fetch(CATALOGUE)'])
  assert.match(js, /rel = 'noopener/)
  assert.match(html, /role="status" aria-live="polite"/)
  assert.doesNotMatch(js + html + ext('match.js'), /—/)
})

test('a handle page finds the buyable square handles and never a product we cannot sell', () => {
  const result = M.findAlternatives({title: 'Black Square Cabinet Handle 108mm Stainless Steel Kitchen Pull', price: 12, currency: 'AUD'}, products)
  assert.equal(result.category, 'handles')
  assert.ok(result.matches.length >= 1 && result.matches.length <= 3)
  assert.equal(result.matches[0].handle, 'square-stainless-steel-cabinet-handles-50-to-268-mm')
  assert.equal(result.matches[0].comparison, 'cheaper')
  for (const match of result.matches) assert.ok(M.isBuyable(products.find((p) => p.handle === match.handle)))
})

test('type words must agree: hinges do not return house numbers and knobs do not return handles', () => {
  const hinges = M.findAlternatives({title: 'Stainless steel door hinges 4 inch'}, products)
  assert.ok(hinges.matches.length > 0)
  for (const match of hinges.matches) assert.match(match.name, /hinge/i)
  const knobs = M.findAlternatives({title: 'Solid brass drawer knob'}, products)
  assert.equal(knobs.category, 'knobs')
  for (const match of knobs.matches) assert.equal(products.find((p) => p.handle === match.handle).category, 'knobs')
})

test('unrelated pages, other currencies and empty input give no claims', () => {
  assert.deepEqual(M.findAlternatives({title: 'Gaming laptop 16GB RAM', price: 1500, currency: 'AUD'}, products).matches, [])
  assert.deepEqual(M.findAlternatives({}, products).matches, [])
  assert.deepEqual(M.findAlternatives(null, products).matches, [])
  const usd = M.findAlternatives({title: 'Brass robe hook', price: 30, currency: 'USD'}, products)
  assert.ok(usd.matches.length > 0)
  for (const match of usd.matches) assert.equal(match.comparison, 'unknown')
  assert.equal(M.pageFacts({price: 'abc'}).price, null)
})

test('unsold and approved-only products are never offered', () => {
  const fake = [{handle: 'x', product: 'Brass hook', category: 'bathroom', status: 'approved', shopify_url: 'https://example.com/x', price_aud: 1}, {handle: 'y', product: 'Brass hook', category: 'bathroom', status: 'live', shopify_url: '', price_aud: 1}]
  assert.deepEqual(M.findAlternatives({title: 'Brass hook'}, fake).matches, [])
})

test('the extension is not on the website: no tab, page, footer link or download', () => {
  const distDir = path.join(__dirname, '../dist')
  assert.equal(fs.existsSync(path.join(distDir, 'extension.html')), false)
  assert.equal(fs.existsSync(path.join(distDir, 'downloads')), false)
  assert.equal(fs.existsSync(path.join(distDir, 'assets/extension-popup-example.png')), false)
  for (const file of fs.readdirSync(distDir).filter((f) => f.endsWith('.html'))) {
    assert.doesNotMatch(dist(file), /extension\.html|Buyer tools|fabint-price-finder/, `${file} does not mention the extension`)
  }
})

test('compare links search other shops for the same product, preferring barcode, then brand and model, then the title', () => {
  assert.equal(JSON.parse(ext('manifest.json')).version, '0.2.0')
  const gtin = M.compareLinks({title: 'Keychron K2 Keyboard', brand: 'Keychron', model: 'K2-C3H', gtin: '0850012345678'})
  assert.equal(gtin.query, '0850012345678')
  const model = M.compareLinks({title: 'Keychron K2 Wireless Mechanical Keyboard | Mwave', brand: 'Keychron', model: 'K2-C3H'})
  assert.equal(model.query, 'Keychron K2-C3H')
  const title = M.compareLinks({title: 'Keychron K2 Wireless Mechanical Keyboard | Mwave'})
  assert.equal(title.query, 'Keychron K2 Wireless Mechanical Keyboard')
  assert.deepEqual(model.links.map((l) => l.name), ['Google Shopping', 'PriceSpy', 'eBay Australia', 'Amazon Australia', 'Kogan'])
  for (const link of model.links) {
    assert.match(link.url, /^https:\/\//)
    assert.ok(link.url.endsWith(encodeURIComponent('Keychron K2-C3H')), `${link.name} carries the encoded query`)
  }
})

test('compare links give nothing for empty input, cap long titles and stay free of dashes', () => {
  for (const input of [null, undefined, {}, {title: '   '}, {price: 12}]) assert.deepEqual(M.compareLinks(input).links, [])
  const long = M.searchQuery({title: 'Word '.repeat(60)})
  assert.ok(long.length <= 90)
  const injected = M.compareLinks({title: 'Thing & more=1#frag'})
  for (const link of injected.links) assert.ok(link.url.endsWith(encodeURIComponent(injected.query)), `${link.name} encodes the query`)
  assert.equal(injected.query, 'Thing & more=1#frag')
  assert.doesNotMatch(M.SHOPS.map((s) => s.join(' ')).join(' '), /—/)
})
