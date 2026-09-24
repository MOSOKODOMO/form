const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (file) => fs.readFileSync(path.resolve('dist', file), 'utf8')
const pages = ['index.html', 'how-it-works.html']
const headings = [
  'Send your brief',
  'Compare your window quote',
  'Approve the details',
  'Make and check',
  'Arrange shipping',
  'Delivered to your door',
]
const getJourney = (page) => {
  const html = read(page)
  const section = html.match(/<section\b(?=[^>]*\bid="how-it-works")(?=[^>]*\bclass="customer-journey")(?=[^>]*\baria-labelledby="journey-title")[^>]*>([\s\S]*?)<\/section>/)
  assert.ok(section, `${page} has a named customer journey section`)
  return section[1]
}
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

test('both public journey entry points show the same complete, ordered six-step infographic', () => {
  const sections = pages.map(getJourney)
  assert.equal(sections[0].trim(), sections[1].trim(), 'homepage and dedicated page share the same journey content')
  for (const [index, section] of sections.entries()) {
    const page = pages[index]
    assert.match(section, /<h[1-6]\b[^>]*id="journey-title"[^>]*>/, `${page} resolves its accessible heading`)
    assert.match(section, /<ol\b(?=[^>]*\bclass="journey-steps")(?=[^>]*\brole="list")[^>]*>/)
    const steps = [...section.matchAll(/<li\b[^>]*class="journey-step"[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1])
    assert.equal(steps.length, 6, `${page} has all six visible steps`)
    assert.deepEqual(steps.map((step) => text(step.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/)?.[1] || '')), headings)
    assert.match(section, /href="stage2\.html#request"/, `${page} links to the actual request form`)
    assert.doesNotMatch(section, /<script\b|\shidden(?:\s|=|>)/i, 'journey content is available without JavaScript')
    assert.match(read(page), /<link\b(?=[^>]*rel="stylesheet")(?=[^>]*href="customer-journey\.css")[^>]*>/)
  }
})

test('journey explains quote, approval, inspection and delivery limitations without implying online checkout', () => {
  const copy = text(getJourney('index.html'))
  assert.match(copy, /(?:seven|7) days/i)
  assert.match(copy, /your window quote/i)
  assert.match(copy, /local benchmark where available/i)
  assert.doesNotMatch(copy, /up to (?:three|3) quotes/i)
  assert.match(copy, /AUD/)
  assert.match(copy, /(?:written|in writing)/i)
  assert.match(copy, /payment/i)
  assert.match(copy, /(?:specification|specs)/i)
  assert.match(copy, /delivery (?:terms|scope)/i)
  assert.match(copy, /(?:inspection|checks?)[^.]*agreed|agreed[^.]*(?:inspection|checks?)/i)
  assert.match(copy, /customs/i)
  assert.match(copy, /domestic|local orders travel within Australia/i)
  assert.match(copy, /access/i)
  assert.match(copy, /arrival|arrive/i)
  assert.match(copy, /request[^.]*not[^.]*order/i)
  assert.match(copy, /no online payments|do not (?:take|process|accept) (?:online )?payments|does not (?:take|process|accept) (?:online )?payments/i)
  assert.match(copy, /Seven days is our quote target, not a delivery promise\./)
  assert.match(copy, /Installation and independent inspection are included only when explicitly quoted\./)
})

test('journey uses six resolved decorative vector icons and a static responsive layout', () => {
  const icons = read('assets/customer-journey-icons.svg')
  const symbols = [...icons.matchAll(/<symbol\b[^>]*id="([^"]+)"/g)].map((match) => match[1])
  assert.equal(symbols.length, 6, 'sprite defines six reusable journey icons')
  assert.equal(new Set(symbols).size, 6, 'symbol IDs are unique')
  for (const page of pages) {
    const section = getJourney(page)
    const svgs = [...section.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/g)]
    assert.equal(svgs.length, 6, `${page} shows one icon per step`)
    const usedSymbols = svgs.map(([, attributes, body]) => {
      assert.match(attributes, /aria-hidden="true"/, 'decorative icons do not duplicate the step name')
      assert.match(attributes, /focusable="false"/, 'decorative icons are not keyboard stops')
      const use = body.match(/<use\b[^>]*href="assets\/customer-journey-icons\.svg#([^"]+)"/)
      assert.ok(use, 'icon references the local sprite')
      assert.ok(symbols.includes(use[1]), `sprite contains ${use[1]}`)
      return use[1]
    })
    assert.equal(new Set(usedSymbols).size, 6, `${page} uses six distinct step icons`)
  }
  const css = read('customer-journey.css')
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, 'desktop lays out three readable columns')
  assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*grid-template-columns:\s*(?:minmax\(0,\s*1fr\)|1fr)/, 'mobile stacks the steps in reading order')
  assert.doesNotMatch(css, /animation\s*:/, 'the infographic does not require motion')
})
