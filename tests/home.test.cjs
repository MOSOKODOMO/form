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

test('hero names verified makers, the trust problem and one shop call to action', () => {
  const hero = block(/<section\b[^>]*id="overview"[^>]*>([\s\S]*?)<\/section>/, 'a hero')
  assert.equal(text(hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] || ''), "Design products from makers we've verified")
  const pain = text(hero.match(/<p class="home-pain">([\s\S]*?)<\/p>/)?.[1] || '')
  assert.match(pain, /factory prices/i)
  assert.match(pain, /trust/i)
  assert.match(hero, /<a class="button button-primary" href="shop\.html">Shop verified products <span aria-hidden="true">↗<\/span><\/a>/)
  assert.match(hero, /href="#how-it-works"/)
  assert.match(text(hero), /FI Score out of 100/)
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

test('how it works explains the four steps in order', () => {
  const steps = block(/<section\b[^>]*id="how-it-works"[^>]*>([\s\S]*?)<\/section>/, 'how it works')
  const titles = [...steps.matchAll(/<li class="home-step">[\s\S]*?<h3>([\s\S]*?)<\/h3>/g)].map((match) => text(match[1]))
  assert.deepEqual(titles, ['AI finds makers', 'FI Verify checks them', 'We list only what passed', 'You buy and review'])
  assert.match(text(steps), /FI Score out of 100/)
  assert.match(text(steps), /reviews? add/i)
})

test('windows and glass are a small coming-later note that links to the moved research', () => {
  const note = block(/<aside class="home-coming-later"[^>]*>([\s\S]*?)<\/aside>/, 'a coming-later note')
  assert.match(note, /COMING LATER/)
  assert.match(text(note), /Windows and glass/)
  assert.match(note, /href="windows\.html"/)
  assert.match(note, /href="glass-guide\.html"/)
  const windows = read('windows.html')
  assert.match(windows, /<aside class="coming-later-banner"[\s\S]*?href="shop\.html"/)
  assert.match(windows, /id="comparison"/)
})

test('the homepage no longer loads window content, scripts or the large window image', () => {
  assert.match(home, /<link rel="stylesheet" href="home\.css">/)
  for (const asset of ['window-showcase.js', 'window-showcase.css', 'window-home.css', 'glass-guide.css', 'customer-journey.css', 'window-low-e-marketing.png']) {
    assert.ok(!home.includes(asset), `homepage does not load ${asset}`)
  }
  assert.doesNotMatch(text(home), /A\$356\.55|Stegbar|Thai window estimate/)
  assert.doesNotMatch(text(home), /guaranteed savings|always cheaper/i)
})
