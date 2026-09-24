const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const home = fs.readFileSync('dist/index.html', 'utf8')
const guide = fs.readFileSync('dist/glass-guide.html', 'utf8')
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const section = (id) => {
  const match = home.match(new RegExp(`<section\\b(?=[^>]*\\bid="${id}")[^>]*>([\\s\\S]*?)<\\/section>`))
  assert.ok(match, `homepage has the ${id} section`)
  return match[1]
}

test('homepage leads with affordable Australian homes and a window-focused request', () => {
  const hero = home.match(/<section\b[^>]*aria-labelledby="hero-title"[^>]*>([\s\S]*?)<\/section>/)?.[1]
  assert.ok(hero, 'homepage has its named hero section')
  const heading = hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]
  assert.match(text(heading || ''), /Creating more affordable homes for Australians/i)
  assert.match(text(hero), /import|overseas/i)
  assert.match(text(hero), /starting with windows/i)
  assert.match(text(hero), /glass/i)
  assert.match(hero, /href="stage2\.html#request"[^>]*>[^<]*(?:window|glazing)[^<]*quote/i)
  assert.match(hero, /<img\b[^>]*src="assets\/window-low-e-marketing\.png"/)
  assert.doesNotMatch(text(home), /Send us the thing you can’t source|up to (?:three|3) (?:quotes|comparable maker options)|guaranteed savings|always cheaper/i)
})

test('the homepage puts window discovery and glass education before comparison and delivery', () => {
  const order = ['glass', 'glass-guide', 'comparison', 'how-it-works']
  const positions = order.map((id) => {
    section(id)
    return home.indexOf(`id="${id}"`)
  })
  for (let index = 1; index < positions.length; index++) {
    assert.ok(positions[index - 1] < positions[index], `${order[index - 1]} precedes ${order[index]}`)
  }
  const showcase = text(section('glass'))
  assert.match(showcase, /6 \/ 12 \/ 6 double-glazing study/)
  assert.match(showcase, /separate from the single-glazed sliding windows priced below/)
})

test('seven glass types have on-page explanations and resolve to detailed guide sections', () => {
  const education = section('glass-guide')
  const cards = [...education.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].map((match) => match[1])
  assert.equal(cards.length, 7, 'all seven types are taught directly on the homepage')
  const anchors = ['clear-float', 'toughened', 'laminated', 'low-e', 'double-glazing', 'tinted', 'frosted']
  for (const anchor of anchors) {
    const card = cards.find((content) => content.includes(`href="glass-guide.html#${anchor}"`))
    assert.ok(card, `${anchor} has its own homepage card`)
    assert.match(card, /<h3\b[^>]*>[^<]+<\/h3>/, `${anchor} has a visible name`)
    assert.match(card, /<p\b[^>]*>[\s\S]+<\/p>/, `${anchor} is explained without requiring a click`)
    assert.match(card, /<strong>Consider for<\/strong>/, `${anchor} identifies suitable applications`)
    assert.match(card, /<small>[\s\S]+<\/small>/, `${anchor} explains an important limitation`)
    assert.ok(text(card).length >= 100, `${anchor} has substantive explanatory copy`)
    assert.ok(guide.includes(`id="${anchor}"`), `${anchor} resolves to the detailed guide`)
  }
  const copy = text(education)
  assert.match(copy, /can (?:be combined|work together|combine)|not (?:mutually exclusive|competing choices)/i)
  assert.match(copy, /safety/i)
  assert.match(copy, /(?:glazier|designer|professional)/i)
  assert.match(copy, /not a product specification|not confirmation that a product is suitable/i)
  assert.doesNotMatch(education, /\shidden(?:\s|=|>)/i, 'the educational copy is visible without JavaScript')
})
