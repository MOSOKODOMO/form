const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dist = path.join(__dirname, '..', 'dist')
const read = (name) => fs.readFileSync(path.join(dist, name), 'utf8')
const json = (name) => JSON.parse(read(name))
const beforeAfter = require('../dist/before-after.js')

test('the room preview page is wired up and says the photo stays in the browser', () => {
  const page = read('room.html')
  assert.match(page, /<script src="room-math\.js[^"]*" defer><\/script>/)
  assert.match(page, /<script src="room\.js[^"]*" defer><\/script>/)
  assert.match(page, /<canvas id="room-stage"[^>]*tabindex="0"[^>]*role="img"/)
  assert.match(page, /<input class="visually-hidden" type="file" id="room-file" accept="image\/jpeg,image\/png,image\/webp">/)
  assert.match(page, /Your photo stays in your browser\. We don’t upload it\./)
  assert.match(page, /Please don’t upload photos of people\./)
  assert.match(page, /id="room-status"[^>]*role="status" aria-live="polite"/)
  assert.ok(!page.includes('—'), 'no em dashes')
})

test('the room preview never sends the photo anywhere', () => {
  const script = read('room.js')
  assert.doesNotMatch(script, /XMLHttpRequest|sendBeacon|FormData|WebSocket|innerHTML|localStorage|sessionStorage/)
  const fetches = script.match(/fetch\(([^)]*)\)/g) || []
  assert.deepEqual(fetches, ["fetch('data/room-products.json', {cache: 'no-cache'})"], 'the only request is for the product list')
})

test('every room preview product has a small transparent cut-out and is a real product', () => {
  const list = json('data/room-products.json')
  const products = new Map(json('data/products.json').map((product) => [product.handle, product]))
  assert.ok(list.length >= 6, 'at least six products to try')
  const handles = new Set()
  for (const entry of list) {
    assert.ok(!handles.has(entry.handle), `${entry.handle} is listed once`)
    handles.add(entry.handle)
    const product = products.get(entry.handle)
    assert.ok(product, `${entry.handle} is in products.json`)
    assert.ok(['live', 'approved'].includes(product.status), `${entry.handle} is in the shop`)
    assert.match(entry.cutout, /^assets\/products\/cutouts\/[a-z0-9-]+\.webp$/)
    const file = path.join(dist, entry.cutout)
    assert.ok(fs.existsSync(file), `${entry.cutout} exists`)
    const bytes = fs.readFileSync(file)
    assert.ok(bytes.length < 80_000, `${entry.cutout} is under 80 KB`)
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8X', 'an extended WebP, which can carry transparency')
    assert.ok(bytes[20] & 0x10, `${entry.cutout} has an alpha channel`)
    assert.ok(entry.width > 0 && entry.height > 0)
  }
  assert.ok(fs.existsSync(path.join(dist, 'assets/room/sample-wall.svg')))
})

test('before and after pairs must use files on this site and have alt text', () => {
  const good = {id: 'kitchen', title: 'Kitchen', before: 'assets/rooms/kitchen-before.webp', after: 'assets/rooms/kitchen-after.webp', alt_before: 'Before', alt_after: 'After'}
  assert.equal(beforeAfter.validPair(good), true)
  assert.equal(beforeAfter.validPair({...good, before: 'https://example.com/a.webp'}), false, 'no outside links')
  assert.equal(beforeAfter.validPair({...good, after: 'assets/../secret.png'}), false, 'no path tricks')
  assert.equal(beforeAfter.validPair({...good, alt_after: ' '}), false, 'alt text is required')
  assert.equal(beforeAfter.validPair({...good, title: ''}), false)
  const pairs = json('data/room-pairs.json')
  assert.ok(Array.isArray(pairs))
  for (const pair of pairs) {
    assert.equal(beforeAfter.validPair(pair), true, `${pair.id} is valid`)
    assert.ok(fs.existsSync(path.join(dist, pair.before)) && fs.existsSync(path.join(dist, pair.after)), `${pair.id} images exist`)
  }
})

test('the slider labels every pair as an AI concept image', () => {
  const script = read('before-after.js')
  assert.match(script, /AI concept image, not a photo of a real room/)
  assert.doesNotMatch(script, /innerHTML/)
})

test('the homepage and product page lead to the room preview', () => {
  const home = read('index.html')
  assert.match(home, /<section id="room-preview"[^>]*>[\s\S]*href="room\.html"[\s\S]*<\/section>/)
  assert.match(home, /<script src="before-after\.js[^"]*" defer><\/script>/)
  assert.match(read('product.js'), /room\.html\?handle=/)
  assert.match(read('product.js'), /data\/room-products\.json/)
})
