const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
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

test('Buyer tools is its own tab in the main menu, with the download button at the top of the page', () => {
  const distDir = path.join(__dirname, '../dist')
  let withNav = 0
  for (const file of fs.readdirSync(distDir).filter((f) => f.endsWith('.html'))) {
    const html = dist(file)
    const nav = html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)
    if (!nav) continue
    withNav += 1
    const links = [...nav[0].matchAll(/<a\b([^>]*)href="([^"]+)"([^>]*)>([^<]*)<\/a>/g)].map((m) => [m[2], m[4].trim(), `${m[1]}${m[3]}`.includes('aria-current="page"')])
    const shop = links.findIndex(([href]) => href === 'shop.html')
    assert.deepEqual(links[shop + 1].slice(0, 2), ['extension.html', 'Buyer tools'], `${file} has Buyer tools right after Shop`)
    assert.equal(links.filter(([href]) => href === 'extension.html').length, 1, `${file} lists it once`)
    assert.equal(links[shop + 1][2], file === 'extension.html', `${file} active state`)
  }
  assert.ok(withNav >= 25, 'the tab is on every public page')
  const page = dist('extension.html')
  const hero = page.slice(page.indexOf('<section class="page-hero'), page.indexOf('<div class="terms-layout">'))
  assert.match(hero, /href="downloads\/fabint-price-finder\.zip" download/, 'download button sits in the top section')
  assert.match(page, /id="install"[\s\S]*id="use"/, 'install steps come before the how-to-use steps')
  assert.match(page, /src="assets\/extension-popup-example\.png"[^>]*alt="[^"]+"/)
  assert.ok(fs.existsSync(path.join(distDir, 'assets/extension-popup-example.png')))
})

test('buyer tools page is honest, linked from every footer, and the download matches the extension folder', () => {
  const page = dist('extension.html')
  assert.match(page, /<title>Buyer tools \| Fabrication Intelligence<\/title>/)
  assert.match(page, /not in the Chrome Web Store or Edge Add-ons yet/)
  assert.match(page, /never sent to us/)
  assert.match(page, /goes to a shop only when you click/)
  assert.match(page, /does not show other shops' prices itself yet/)
  assert.match(page, /similar products, not identical ones/i)
  assert.match(page, /Version 0\.2\.0/)
  assert.match(page, /docs-status--planned">Planned/)
  assert.doesNotMatch(page, /—/)
  assert.doesNotMatch(page, /aria-current="page">Support/)
  for (const file of fs.readdirSync(path.join(__dirname, '../dist')).filter((f) => f.endsWith('.html') && f !== 'extension.html')) {
    const html = dist(file)
    if (html.includes('<h2>Here to help</h2>')) assert.ok(html.includes('href="extension.html"'), `${file} footer links to the buyer tools`)
  }
  const zip = fs.readFileSync(path.join(__dirname, '../dist/downloads/fabint-price-finder.zip'))
  const names = []
  for (let offset = 0; offset < zip.length - 4; ) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) break
    const method = zip.readUInt16LE(offset + 8)
    const size = zip.readUInt32LE(offset + 18)
    const nameLen = zip.readUInt16LE(offset + 26)
    const extraLen = zip.readUInt16LE(offset + 28)
    const name = zip.toString('utf8', offset + 30, offset + 30 + nameLen)
    const data = zip.subarray(offset + 30 + nameLen + extraLen, offset + 30 + nameLen + extraLen + size)
    const body = method === 8 ? zlib.inflateRawSync(data) : data
    assert.ok(body.equals(fs.readFileSync(path.join(__dirname, '../extension', name))), `${name} in the zip matches the folder`)
    names.push(name)
    offset += 30 + nameLen + extraLen + size
  }
  assert.deepEqual(names.sort(), fs.readdirSync(path.join(__dirname, '../extension')).sort())
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
