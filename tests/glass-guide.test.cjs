const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const guide = fs.readFileSync('dist/glass-guide.html', 'utf8')
const css = fs.readFileSync('dist/glass-guide.css', 'utf8')
const cards = [...guide.matchAll(/<article class="glass-type(?: glass-type--highlight)?" id="([^"]+)">([\s\S]*?)<\/article>/g)]

test('glass guide explains seven combinable glass terms with visible uses and limits', () => {
  assert.match(guide, /Different glass\.<br>Different jobs\./)
  assert.match(guide, /not mutually exclusive/)
  assert.match(guide, /can combine toughened glass and a Low-E coating/)
  assert.deepEqual(cards.map((card) => card[1]), ['clear-float', 'toughened', 'laminated', 'low-e', 'double-glazing', 'tinted', 'frosted'])
  for (const [, id, content] of cards) {
    assert.match(content, /<h3>/, `${id} has a heading`)
    assert.match(content, /<dt>Typical use<\/dt>/, `${id} explains typical uses`)
    assert.match(content, /<dt>Know the limit<\/dt>/, `${id} explains limits`)
    assert.match(content, /href="https:\/\/(?:www\.viridianglass\.com|agg\.com\.au)/, `${id} cites a primary manufacturer`)
    assert.match(content, /class="glass-swatch[^"]*" aria-hidden="true"/, `${id} hides decorative illustration from assistive technology`)
  }
  for (const label of ['BASE GLASS', 'SAFETY TREATMENT', 'BONDED CONSTRUCTION', 'PERFORMANCE COATING', 'ASSEMBLED UNIT', 'COLOUR &amp; SOLAR CONTROL', 'PRIVACY FINISH']) assert.ok(guide.includes(label))
})

test('glass education does not conflate thermal features with safety or certify supplier products', () => {
  assert.match(guide, /annealed float is not safety glass/)
  assert.match(guide, /broken monolithic pane can fall out/)
  assert.match(guide, /Laminated glass alone does not guarantee fall protection/)
  assert.match(guide, /Low-E does not mean double glazing/)
  assert.match(guide, /Double glazing alone does not mean Low-E or safety glass/)
  assert.match(guide, /does not automatically provide complete privacy/)
  assert.match(guide, /qualified glazier or designer/)
  assert.match(guide, /does not certify the products in our price comparison/)
  assert.match(guide, /not confirmation that a product is suitable for your project or currently stocked by FABINT/)
  assert.doesNotMatch(guide, /guaranteed savings|soundproof|fireproof|cheapest glass/i)
})

test('glass guide is a static accessible responsive page with working local entry points', () => {
  assert.match(guide, /<html lang="en">/)
  assert.match(guide, /href="#main">Skip to content/)
  assert.match(guide, /href="pricing\.html"/)
  assert.match(guide, /href="stage2\.html#request"/)
  assert.match(guide, /href="\.\/#comparison"/)
  assert.match(guide, /href="how-it-works\.html#how-it-works"/)
  assert.match(css, /@media \(max-width: 650px\)/)
  assert.match(css, /\.glass-guide__grid \{ grid-template-columns: 1fr; \}/)
  assert.doesNotMatch(guide, /<script|<canvas|<iframe/)
  assert.doesNotMatch(css, /animation:|transition:/)
  for (const [, ref] of guide.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)) {
    if (ref.startsWith('https://')) continue
    const asset = ref.split('#')[0]
    assert.ok(fs.existsSync(path.join('dist', asset)), `Local reference exists: ${ref}`)
  }
})
