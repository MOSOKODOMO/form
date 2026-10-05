const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dist = path.join(__dirname, '..', 'dist')
const read = (name) => fs.readFileSync(path.join(dist, name), 'utf8')
const catalogue = require('../dist/catalogue.js')
const products = JSON.parse(read('data/products.json'))

const product = (overrides) => ({
  handle: 'x', status: 'live', sample: false, product: 'X', category: 'handles', maker: 'Maker A', maker_url: '', country: 'China',
  ships_from: 'not stated', material: 'Brass', finishes: ['Brass'], sizes: ['96mm'], price_aud: 10, price_unit: 'each',
  delivery_estimate: 'not stated', photo_url: 'assets/products/photo-coming-soon.svg', story_en: 'not stated', fi_score: 50,
  shopify_url: '', shopify_buy_button: '', stripe_link: '',
  certificates: [{name: 'Company registration', status: 'verified', link: 'https://example.com/check'}, {name: 'ISO 9001', status: 'claimed', link: ''}],
  score_parts: {maker_check: 30, product_proof: 15, value: 5, buyers: 0}, score_checked: '2026-10-05', reviews: [], ...overrides,
})

test('only live products are ranked', () => {
  assert.equal(catalogue.isLive(product({status: 'live'})), true)
  for (const status of ['approved', 'draft', 'rejected']) assert.equal(catalogue.isLive(product({status})), false, status)
  assert.match(read('rankings.js'), /products\.filter\(FI\.isLive\)/)
})

test('the breakdown has four parts worth 40, 30, 15 and 15, and must add up to the FI Score', () => {
  assert.deepEqual(catalogue.SCORE_PARTS.map(({label, max}) => [label, max]), [['Maker check', 40], ['Product proof', 30], ['Value', 15], ['Buyers', 15]])
  assert.deepEqual(catalogue.scoreBreakdown(product({})).map((part) => part.points), [30, 15, 5, 0])
  assert.deepEqual(catalogue.scoreBreakdown(product({score_parts: undefined})).map((part) => part.points), [null, null, null, null])
  assert.deepEqual(catalogue.productProblems(product({})), [])
  const problems = (parts) => catalogue.productProblems(product({score_parts: parts})).join(' ')
  assert.match(problems({maker_check: 30, product_proof: 15, value: 5, buyers: 1}), /add up to fi_score/)
  assert.match(problems({maker_check: 41, product_proof: 0, value: 9, buyers: 0}), /maker_check \(0 to 40\)/)
  for (const item of products) assert.deepEqual(catalogue.productProblems(item), [], item.handle)
})

test('certificate chips say Verified, Claimed, Failed or Not stated', () => {
  const chips = catalogue.certificateChips(product({certificates: [
    {name: 'A', status: 'verified', link: ''}, {name: 'B', status: 'claimed', link: ''},
    {name: 'C', status: 'failed', link: ''}, {name: 'D', status: 'not stated', link: ''},
  ]}))
  assert.deepEqual(chips.map((chip) => [chip.name, chip.state, chip.label]),
    [['A', 'verified', 'Verified'], ['B', 'claimed', 'Claimed'], ['C', 'failed', 'Failed'], ['D', 'not stated', 'Not stated']])
  const css = read('rankings.css')
  assert.match(css, /\.cert-chip--verified \{[^}]*var\(--green\)/, 'verified chips are green')
  assert.match(css, /\.cert-chip--claimed \{[^}]*var\(--amber\)/, 'claimed chips are amber')
  assert.match(css, /\.cert-chip--failed \{[^}]*var\(--error\)/, 'failed chips are red')
  assert.match(css, /\.cert-chip \{[^}]*var\(--muted\)/, 'not stated chips are grey')
})

test('early scores say so, with the date they were checked', () => {
  assert.deepEqual(catalogue.scoreNotes(product({})), ['No reviews yet.', 'Early score, based on our research.', 'Score checked 5 Oct 2026.'])
  assert.deepEqual(catalogue.scoreNotes(product({reviews: [{rating: 5}], score_checked: ''})), ['Includes 1 buyer review.'])
  assert.equal(catalogue.formatDate('2026-12-31'), '31 Dec 2026')
  assert.equal(catalogue.formatDate('31/12/2026'), '')
})

test('makers are grouped and ranked by their maker check, with their company checks', () => {
  const makers = catalogue.rankMakers([
    product({handle: 'a', product: 'A', maker: 'Maker A', fi_score: 60, score_parts: {maker_check: 30, product_proof: 15, value: 15, buyers: 0}}),
    product({handle: 'b', product: 'B', maker: 'Maker B', fi_score: 50, score_parts: {maker_check: 40, product_proof: 10, value: 0, buyers: 0}, score_checked: '2026-10-01'}),
    product({handle: 'c', product: 'C', maker: 'maker b ', fi_score: 45, score_parts: {maker_check: 35, product_proof: 10, value: 0, buyers: 0}, score_checked: '2026-10-07'}),
  ])
  assert.deepEqual(makers.map((maker) => [maker.maker, maker.makerCheck, maker.products.map((item) => item.handle)]),
    [['Maker B', 40, ['b', 'c']], ['Maker A', 30, ['a']]])
  assert.equal(makers[0].checked, '2026-10-07', 'the most recent check')
  assert.deepEqual(makers[0].checks.map((check) => [check.name, check.label]), [['Company registration', 'Verified']], 'only company checks')
})

test('the view and category are read from the URL', () => {
  assert.equal(catalogue.parseView('?view=makers&category=tiles'), 'makers')
  assert.equal(catalogue.parseView('?view=anything'), 'products')
  assert.equal(catalogue.parseCategory('?view=makers&category=tiles'), 'tiles')
})

test('the rankings page has the toggle, filters, a live status and How we score', () => {
  const page = read('rankings.html')
  assert.match(page, /<button class="shop-filter" type="button" data-view="products" aria-pressed="true">Products<\/button>/)
  assert.match(page, /<button class="shop-filter" type="button" data-view="makers" aria-pressed="false">Makers<\/button>/)
  for (const category of ['all', 'handles', 'knobs', 'tiles', 'taps']) assert.match(page, new RegExp(`data-category="${category}"`))
  assert.match(page, /id="rankings-status" class="shop-status" role="status" aria-live="polite"/)
  assert.match(page, /<ol id="ranking-list" class="ranking-list"/)
  for (const [max, name] of [[40, 'Maker check'], [30, 'Product proof'], [15, 'Value'], [15, 'Buyers']]) {
    assert.match(page, new RegExp(`UP TO ${max}</span>\\s*<h3>${name}</h3>`))
  }
  assert.match(page, /Until a product has reviews, this part is 0, and the score is an early score, based on our research\./)
  assert.match(page, /<script src="catalogue\.js" defer><\/script>\s*<script src="rankings\.js" defer><\/script>/)
  assert.match(page, /sample-banner-label">SAMPLE RANKING/, 'the example is labelled as samples')
})

test('the rankings read only products.json and stay usable on a 375 px phone', () => {
  const script = read('rankings.js')
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|innerHTML/, 'data only comes through FI.loadProducts, and text is never parsed as HTML')
  assert.match(script, /FI\.loadProducts\(\)/)
  assert.match(read('catalogue.js'), /async function loadProducts\(url = 'data\/products\.json'\)/)
  const css = read('rankings.css')
  assert.match(css, /@media \(max-width: 650px\)[\s\S]*grid-template-areas: "place score" "body body"/)
  assert.match(css, /\.score-rules \{ grid-template-columns: 1fr; \}/)
})
