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
const glassGroups = (html) => [...html.matchAll(/<div\b(?=[^>]*\bdata-glass-group="([^"]+)")[^>]*>/g)].map((opening) => {
  const start = opening.index + opening[0].length
  let depth = 1
  for (const tag of html.slice(start).matchAll(/<\/?div\b[^>]*>/g)) {
    depth += tag[0].startsWith('</') ? -1 : 1
    if (depth === 0) return {slug: opening[1], attributes: opening[0], body: html.slice(start, start + tag.index)}
  }
  assert.fail(`glass group ${opening[1]} has no matching closing div`)
})

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
    assert.match(card, /<h4\b[^>]*>[^<]+<\/h4>/, `${anchor} has a visible name below its group heading`)
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

test('homepage and guide organise the same seven glass choices into three named performance groups', () => {
  const expected = [
    {slug: 'light-privacy', name: 'Light & privacy', types: ['clear-float', 'tinted', 'frosted']},
    {slug: 'thermal-comfort', name: 'Thermal comfort', types: ['low-e', 'double-glazing']},
    {slug: 'safety-protection', name: 'Safety & protection', types: ['toughened', 'laminated']},
  ]
  for (const [page, html, prefix] of [['homepage', section('glass-guide'), 'home-glass-'], ['guide', guide, 'group-']]) {
    const groups = glassGroups(html)
    assert.deepEqual(groups.map((group) => group.slug), expected.map((group) => group.slug), `${page} keeps the three performance groups in order`)
    const nav = [...html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/g)].find((match) => expected.every(({slug}) => match[2].includes(`href="#${prefix}${slug}"`)))
    assert.ok(nav, `${page} has static jump links to every group`)
    assert.match(nav[1], /aria-label="[^"]+"/, `${page} names its group navigation`)
    for (const [index, group] of groups.entries()) {
      const {slug, name, types} = expected[index]
      assert.ok(group.attributes.includes(`id="${prefix}${slug}"`), `${page} resolves the ${slug} jump link`)
      const label = group.attributes.match(/aria-labelledby="([^"]+)"/)?.[1]
      assert.ok(label, `${page} ${slug} has an accessible group name`)
      const heading = group.body.match(new RegExp(`<h3\\b[^>]*id="${label}"[^>]*>([\\s\\S]*?)<\\/h3>`))
      assert.equal(text(heading?.[1] || '').replace(/&amp;/gi, '&'), name, `${page} ${slug} uses a descriptive level-three group heading`)
      const header = group.body.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1] || ''
      const summary = [...header.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((match) => text(match[1])).at(-1)
      assert.ok(summary?.length >= 60, `${page} ${slug} explains the performance goal`)
      const articles = [...group.body.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)]
      const actual = articles.map(([, attributes, content]) => page === 'homepage'
        ? content.match(/href="glass-guide\.html#([^"]+)"/)?.[1]
        : attributes.match(/\bid="([^"]+)"/)?.[1])
      assert.deepEqual(actual, types, `${page} places the correct glass cards inside ${slug}`)
      assert.doesNotMatch(group.body, /\shidden(?:\s|=|>)/i, `${page} ${slug} stays readable without JavaScript`)
    }
  }
})

test('homepage treats custom glass and environmental evidence as cross-cutting choices rather than performance guarantees', () => {
  const copy = text(section('glass-guide'))
  assert.match(copy, /groups are not mutually exclusive/)
  assert.match(copy, /glass choices can be combined in one window/)
  assert.match(copy, /Custom is an option across all groups/)
  assert.match(copy, /subject to supplier confirmation/)
  assert.match(copy, /Environmental claims need product-specific evidence/)
  assert.match(copy, /thermal feature alone is not proof of sustainability/)
})
