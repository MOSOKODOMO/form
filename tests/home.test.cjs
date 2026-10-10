const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'dist', name), 'utf8')
const home = read('index.html')
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').replace(/’/g, "'").trim()
const block = (pattern, label) => {
  const match = home.match(pattern)
  assert.ok(match, `homepage has ${label}`)
  return match[1]
}

test('hero explains curated design, inspection and inclusive source-price fee', () => {
  const hero = block(/<section\b[^>]*id="overview"[^>]*>([\s\S]*?)<\/section>/, 'a hero');
  assert.match(text(hero), /Considered design. Inspected before dispatch./);
  assert.match(text(hero), /mid-range to luxury products from global manufacturers/);
  assert.match(hero, /href="shop.html"/);
  assert.match(text(hero), /10% service fee on the initial product price/);
  assert.match(text(hero), /inclusive AUD total/);
})

test('hero offers the four starting categories, each linked to its shop filter', () => {
  const sprite = read('assets/category-icons.svg')
  const links = [...home.matchAll(/<a class="home-category" href="shop\.html\?category=([a-z]+)">([\s\S]*?)<\/a>/g)]
  assert.deepEqual(links.map((link) => link[1]), ['handles', 'knobs', 'tiles', 'taps'])
  for (const [, category, body] of links) {
    const icon = body.match(/<use href="assets\/category-icons\.svg#([a-z]+)">/)?.[1]
    assert.ok(icon, `${category} has an icon`)
    assert.ok(sprite.includes(`<symbol id="${icon}"`), `the sprite draws ${icon}`)
    assert.match(body, /<svg\b[^>]*aria-hidden="true"/, `${category} icon is decorative`)
  }
})

test('homepage orders the customer journey around warehouse inspection', () => {
  const steps = block(/<section\b[^>]*id="how-it-works"[^>]*>([\s\S]*?)<\/section>/, 'how it works');
  const titles = [...steps.matchAll(/<li class="home-step">[\s\S]*?<h3>([\s\S]*?)<\/h3>/g)].map(match => text(match[1]));
  assert.deepEqual(titles, ['Choose your product','Confirm your total','We inspect your order','Receive and review']);
  assert.match(text(steps), /dispatch only after a pass/);
  assert.match(steps, /href="returns.html"/);
})

test('windows and glass are a small coming-later note that links to the moved research', () => {
  const note = block(/<aside class="home-coming-later"[^>]*>([\s\S]*?)<\/aside>/, 'a coming-later note')
  assert.match(note, /COMING LATER/)
  assert.match(text(note), /Windows and glass/)
  assert.match(note, /href="windows\.html"/)
  assert.match(note, /href="glass-guide\.html"/)
  const windows = read('windows.html')
  assert.match(windows, /Under consideration/)
  assert.doesNotMatch(windows, /id="comparison"/)
})

test('the homepage no longer loads window content, scripts or the large window image', () => {
  assert.match(home, /<link rel="stylesheet" href="home\.css">/)
  for (const asset of ['window-showcase.js', 'window-showcase.css', 'window-home.css', 'glass-guide.css', 'customer-journey.css', 'window-low-e-marketing.png']) {
    assert.ok(!home.includes(asset), `homepage does not load ${asset}`)
  }
  assert.doesNotMatch(text(home), /A\$356\.55|Stegbar|Thai window estimate/)
  assert.doesNotMatch(text(home), /guaranteed savings|always cheaper/i)
})
