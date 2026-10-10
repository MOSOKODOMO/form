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

test('hero sells renovation hardware to every buyer, delivered direct', () => {
  const hero = block(/<section\b[^>]*id="overview"[^>]*>([\s\S]*?)<\/section>/, 'a hero');
  assert.match(text(hero), /Renovation hardware. Delivered direct./);
  assert.match(text(hero), /plumbers, builders, renovators and homeowners/);
  assert.match(hero, /href="shop.html"/);
  assert.match(text(hero), /Prices in AUD, GST included/);
  assert.doesNotMatch(text(home), /Inspected before dispatch|FI Score/, 'shop orders are not inspected and the rating is off');
})

test('hero offers the four stocked categories, each linked to its shop filter', () => {
  const sprite = read('assets/category-icons.svg')
  const links = [...home.matchAll(/<a class="home-category" href="shop\.html\?category=([a-z]+)">([\s\S]*?)<\/a>/g)]
  assert.deepEqual(links.map((link) => link[1]), ['handles', 'knobs', 'bathroom', 'doors'])
  for (const [, category, body] of links) {
    const icon = body.match(/<use href="assets\/category-icons\.svg#([a-z]+)">/)?.[1]
    assert.ok(icon, `${category} has an icon`)
    assert.ok(sprite.includes(`<symbol id="${icon}"`), `the sprite draws ${icon}`)
    assert.match(body, /<svg\b[^>]*aria-hidden="true"/, `${category} icon is decorative`)
  }
})

test('homepage names the four kinds of buyer', () => {
  const who = block(/<section\b[^>]*id="who-orders"[^>]*>([\s\S]*?)<\/section>/, 'who orders here');
  const titles = [...who.matchAll(/<li class="home-step">[\s\S]*?<h3>([\s\S]*?)<\/h3>/g)].map(match => text(match[1]));
  assert.deepEqual(titles, ['Plumbers', 'Builders', 'Renovators', 'Homeowners']);
})

test('homepage explains the automated order and direct delivery', () => {
  const steps = block(/<section\b[^>]*id="how-it-works"[^>]*>([\s\S]*?)<\/section>/, 'how it works');
  const titles = [...steps.matchAll(/<li class="home-step">[\s\S]*?<h3>([\s\S]*?)<\/h3>/g)].map(match => text(match[1]));
  assert.deepEqual(titles, ['Choose and pay', 'We place the order', 'Shipped direct', 'We sort any problem']);
  assert.match(text(steps), /supplier's estimate/, 'the delivery time is labelled as an estimate');
  assert.match(steps, /href="returns.html"/);
  assert.match(steps, /href="contact.html#contact-form"/, 'trade buyers can ask for a quote');
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
