const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dist = path.join(__dirname, '..', 'dist')
const read = (name) => fs.readFileSync(path.join(dist, name), 'utf8')
const home = read('index.html')
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const section = (id) => {
  const match = home.match(new RegExp(`<section\\b(?=[^>]*\\bid="${id}")[^>]*>([\\s\\S]*?)<\\/section>`))
  assert.ok(match, `homepage has the ${id} section`)
  return match[1]
}

test('founders section shows the three founders with their approved photos and bios', () => {
  const founders = section('founders')
  assert.match(founders, /FOUNDERS/)
  const cards = [...founders.matchAll(/<article class="team-card">([\s\S]*?)<\/article>/g)].map((match) => match[1])
  assert.equal(cards.length, 3)
  for (const [index, name] of ['Prem', 'Lincy', 'Mos'].entries()) {
    assert.match(cards[index], new RegExp(`alt="Portrait of ${name}"`))
    assert.match(cards[index], /loading="lazy" decoding="async"/)
  }
  const order = ['founders', 'testimonials', 'contact'].map((id) => home.indexOf(`id="${id}"`))
  assert.ok(order[0] < order[1] && order[1] < order[2], 'founders, then testimonials, then contact')
})

test('testimonials are real quotes only and start honestly empty', () => {
  const entries = JSON.parse(read('data/testimonials.json'))
  assert.ok(Array.isArray(entries))
  const {isReal} = require('../dist/testimonials.js')
  for (const entry of entries) assert.ok(isReal(entry), `each testimonial needs a quote, a name, context and permission: ${JSON.stringify(entry)}`)
  assert.equal(isReal({quote: 'Great', name: 'Sam', context: 'Bought tiles'}), false, 'no permission, not shown')
  assert.equal(isReal({quote: 'Great', name: 'Sam', context: 'Bought tiles', permission: true}), true)
  const block = section('testimonials')
  assert.match(block, /id="testimonial-list"/)
  assert.match(text(block), /No reviews yet/)
  assert.match(text(block), /real buyers/i)
  assert.match(text(block), /permission/)
  assert.match(home, /<script src="testimonials\.js" defer><\/script>/)
  assert.doesNotMatch(read('testimonials.js'), /innerHTML/)
  assert.ok(!read('data/testimonials.json').includes('—'))
})

test('the contact form is on the homepage and contact page and posts to the team inbox', () => {
  for (const page of ['index.html', 'contact.html']) {
    const html = read(page)
    const form = html.match(/<form class="contact-form" data-contact-form novalidate>([\s\S]*?)<\/form>/)?.[1]
    assert.ok(form, `${page} has the contact form`)
    for (const name of ['name', 'email', 'product', 'message', 'website']) assert.match(form, new RegExp(`name="${name}"`), `${page} asks for ${name}`)
    assert.match(form, /<input type="email" name="email"/)
    assert.match(form, /class="contact-honeypot" aria-hidden="true"/)
    assert.match(form, /role="status" aria-live="polite"/)
    assert.match(html, /class="contact-thanks" tabindex="-1" hidden/)
    assert.match(html, /<link rel="stylesheet" href="contact-form\.css">/)
    assert.match(html, /<script src="contact-form\.js" defer><\/script>/)
  }
  const script = read('contact-form.js')
  assert.match(script, /https:\/\/formsubmit\.co\/ajax\/fabricationintelligence@gmail\.com/)
  assert.match(script, /if \(value\('website'\)\) return;/, 'bots that fill the hidden field are ignored')
  assert.match(script, /EMAIL\.test\(email\)/)
  assert.doesNotMatch(script, /innerHTML/)
  assert.doesNotMatch(text(read('contact.html')), /can’t source\.|Send the brief once/, 'old sourcing copy is gone from the contact page')
})

test('the privacy notice covers contact messages sent through FormSubmit', () => {
  const privacy = text(read('privacy.html'))
  assert.match(privacy, /When you use the contact form, we collect your name, email, message and any product you mention/)
  assert.match(privacy, /send a message through the contact form/)
  assert.match(privacy, /Last updated 7 October 2026/)
})
