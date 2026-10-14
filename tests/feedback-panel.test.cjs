const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dist = path.join(__dirname, '..', 'dist')
const read = (name) => fs.readFileSync(path.join(dist, name), 'utf8')
const panel = require('../dist/feedback-panel.js')

const entry = (changes) => ({quote: 'Arrived well packed.', name: 'Sam', context: 'Renovator, Melbourne', permission: true, ...changes})

test('only comments marked with permission, with a quote, a name and a context, count as approved', () => {
  assert.equal(panel.isApproved(entry()), true)
  assert.equal(panel.isApproved(entry({permission: false})), false)
  assert.equal(panel.isApproved(entry({permission: 'yes'})), false, 'must be exactly true')
  for (const key of ['quote', 'name', 'context']) assert.equal(panel.isApproved(entry({[key]: '  '})), false, `${key} is required`)
  assert.equal(panel.isApproved(entry({quote: 'x'.repeat(401)})), false, 'very long quotes are left for a person to trim')
  assert.equal(panel.isApproved(null), false)
})

test('the homepage shows general comments and a product page shows its own', () => {
  const list = [entry({quote: 'General one'}), entry({quote: 'About the pull', handle: 'a-pull'}), entry({permission: false, quote: 'Not approved'})]
  assert.deepEqual(panel.approvedFor(list, '').map((item) => item.quote), ['General one'])
  assert.deepEqual(panel.approvedFor(list, 'a-pull').map((item) => item.quote), ['About the pull'])
  assert.deepEqual(panel.approvedFor(list, 'other'), [])
  assert.deepEqual(panel.approvedFor('not a list', ''), [])
})

test('the form needs a comment and a role, and checks the email only when there is one', () => {
  const ok = {comment: 'Nice handles.', role: 'Homeowner', email: '', website: ''}
  assert.equal(panel.validate(ok).ok, true)
  assert.match(panel.validate({...ok, comment: '  '}).error, /sentence or two/)
  assert.match(panel.validate({...ok, role: ''}).error, /best describes you/)
  assert.match(panel.validate({...ok, role: 'Wizard'}).error, /best describes you/)
  assert.match(panel.validate({...ok, email: 'not an email'}).error, /email/i)
  assert.equal(panel.validate({...ok, email: 'sam@example.com'}).ok, true)
  assert.match(panel.validate({...ok, comment: 'x'.repeat(801)}).error, /800/)
  assert.deepEqual(panel.validate({...ok, website: 'http://spam.example'}), {ok: false, silent: true}, 'the hidden field catches bots without a message')
})

test('the message to the team says where it came from and whether it may be shown', () => {
  const message = panel.buildMessage({handle: 'mugu-brass-marble-t-bar', role: 'Builder', comment: ' Good weight. ', name: 'Sam', email: 'sam@example.com', permission: true})
  assert.equal(message._subject, 'FI site feedback (product mugu-brass-marble-t-bar): Builder · OK to show')
  assert.equal(message._captcha, 'false')
  assert.equal(message.name, 'Sam')
  assert.equal(message.email, 'sam@example.com')
  assert.match(message.message, /^Left on: product mugu-brass-marble-t-bar\n/)
  assert.match(message.message, /Comment: Good weight\./)
  assert.match(message.message, /May we show this comment on the site: Yes, with my first name and role/)
  const anonymous = panel.buildMessage({handle: '', role: 'Homeowner', comment: 'Hi', name: '', email: '', permission: false})
  assert.equal(anonymous._subject, 'FI site feedback (home page): Homeowner')
  assert.equal(anonymous.name, 'Anonymous')
  assert.ok(!('email' in anonymous))
  assert.match(anonymous.message, /May we show this comment on the site: No/)
})

test('comments go to the same team inbox as the one-minute feedback form', () => {
  const endpoint = /formsubmit\.co\/ajax\/fabricationintelligence@gmail\.com/
  assert.match(panel.ENDPOINT, endpoint)
  assert.match(read('feedback.js'), endpoint)
})

test('the script writes text with textContent only and sends nothing but the feedback message', () => {
  const script = read('feedback-panel.js')
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|document\.write/)
  const requests = (script.match(/fetch\(([^,)]*)/g) || []).map((call) => call.replace('fetch(', '').trim())
  assert.deepEqual(requests, ['ENDPOINT', "'data/testimonials.json'"])
})

test('the homepage and product page mount the panel, and the labelled sample reviews stay', () => {
  const home = read('index.html')
  const product = read('product.html')
  assert.match(home, /<section id="feedback" class="feedback-wall" data-feedback-panel data-context="home"/)
  assert.match(product, /<section class="feedback-wall feedback-wall--product" data-feedback-panel data-context="product"/)
  for (const page of [home, product]) {
    assert.match(page, /<script src="feedback-panel\.js[^"]*" defer><\/script>/)
    assert.match(page, /href="feedback-panel\.css/)
  }
  assert.match(home, /id="testimonials" class="home-testimonials"[^>]*data-motion-section="Sample reviews"/)
  assert.match(home, /Names, ratings and comments are fictional examples, not real customer experiences\./)
})

test('testimonials.json holds only real comments with permission, each with its context', () => {
  const entries = JSON.parse(read('data/testimonials.json'))
  assert.ok(Array.isArray(entries))
  for (const item of entries) {
    assert.equal(panel.isApproved(item), true, `${JSON.stringify(item).slice(0, 60)} is not an approved comment`)
    assert.ok(!/sample|example|fictional|lorem/i.test(item.name + item.context), 'no sample comments here')
  }
})
