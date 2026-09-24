const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dist = path.resolve('dist')
const read = (name) => fs.readFileSync(path.join(dist, name), 'utf8')

test('the homepage presents an anonymous Thai window estimate alongside one named Australian benchmark', () => {
  const home = read('index.html')
  assert.match(home.replace(/<[^>]*>/g, ' '), /Creating\s+more affordable\s+homes for\s+Australians/i)
  assert.equal((home.match(/class="quote-card(?: quote-card-featured)?"/g) || []).length, 2)
  assert.match(home, /WINDOW PRICE COMPARISON/)
  for (const value of ['Thai window estimate', 'A$356.55', 'Stegbar', 'A$742.50']) {
    assert.ok(home.includes(value), `missing window comparison value: ${value}`)
  }
  assert.match(home, /Planning estimate, not a confirmed quote/i)
  assert.ok(home.indexOf('<h3>Thai window estimate</h3>') < home.indexOf('<h3>Stegbar</h3>'), 'the Thai window appears before the Australian benchmark')
  assert.doesNotMatch(home, /Superhouse|SMG Glass|uPVC\.com\.au|up to three quotes/i)
})

test('team portraits and biographies follow the confirmed left-to-right identities', () => {
  for (const page of ['index.html', 'builders.html']) {
    const cards = [...read(page).matchAll(/<article class="team-card">([\s\S]*?)<\/article>/g)].map((match) => match[1])
    assert.equal(cards.length, 3, `${page} has three team members`)
    for (const [index, name, image, role] of [
      [0, 'Prem', 'prem-portrait.jpg', 'CEO'],
      [1, 'Lincy', 'lincy.jpg', 'CPO'],
      [2, 'Mos', 'mos-portrait.jpg', 'CTO'],
    ]) {
      assert.ok(cards[index].includes(`src="assets/team/${image}"`), `${page}: correct portrait for ${name}`)
      assert.ok(cards[index].includes(`alt="Portrait of ${name}"`), `${page}: correct accessible name for ${name}`)
      assert.ok(cards[index].includes(`${name.toUpperCase()} · ${role}`), `${page}: correct role for ${name}`)
      assert.ok(cards[index].includes(`<small>${name} `), `${page}: correct biography for ${name}`)
    }
  }
})

test('the request form offers windows and glazing and emails the team a copy', () => {
  const form = read('stage2.html')
  const script = read('stage2.js')
  assert.match(form, /<option value="windows" data-en="Windows &amp; glazing"/)
  assert.match(form, /reply within 48 hours/)
  assert.match(script, /https:\/\/formsubmit\.co\/ajax\//)
  assert.match(script, /payload\.category = 'other'/, 'windows requests still save before the database allows the category')
  const migration = fs.readFileSync(path.resolve('supabase/migrations/20260924050000_fi_windows_category.sql'), 'utf8')
  assert.match(migration, /'windows', 'stairs'/)
})

test('the pricing page shows the 10% fee as a table and Services links to it', () => {
  const pricing = read('pricing.html')
  assert.match(pricing, /10% only if you order/)
  assert.equal((pricing.match(/<th scope="row">/g) || []).length, 4)
  for (const value of ['<strong>Free</strong>', '10% of the delivered cost', 'At cost, itemised', 'Not included']) {
    assert.ok(pricing.includes(value), `missing price: ${value}`)
  }
  const services = read('services.html')
  assert.match(services, /our fee is 10% of the delivered cost/)
  assert.doesNotMatch(services, /still being tested/)
})

test('the feedback form sends answers to the team inbox and is linked after a request', () => {
  assert.match(read('feedback.js'), /formsubmit\.co\/ajax\/fabricationintelligence@gmail\.com/)
  const page = read('feedback.html')
  for (const name of ['role', 'would_use', 'fee', 'email']) assert.match(page, new RegExp(`name="${name}"`))
  assert.match(read('stage2.html'), /href="feedback\.html"/)
  assert.match(read('privacy.html'), /quote request or the feedback form/)
})

test('the old public request entry redirects to the single canonical request form', () => {
  const oldRequest = read('request.html')
  assert.match(oldRequest, /location\.replace\('stage2\.html#request'\)/)
  assert.match(read('stage2.html'), /Detailed quote request/)
})

test('client and manufacturer account entry points are present', () => {
  const auth = read('auth.js')
  const account = read('account.js')
  const accountStyles = read('account.css')
  assert.match(auth, /auth\.signUp/)
  assert.match(auth, /auth\.signInWithPassword/)
  assert.match(auth, /role === 'manufacturer'/)
  assert.match(account, /fi_quote_requests/)
  assert.match(account, /fi_manufacturer_applications/)
  assert.match(account, /fi_supplier_memberships/)
  assert.match(accountStyles, /\[hidden\].*display:\s*none\s*!important/)
})

test('account schema uses ownership RLS and keeps manufacturer review separate', () => {
  const sql = fs.readFileSync(path.resolve('supabase/fi-accounts.sql'), 'utf8')
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /\(select auth\.uid\(\)\) = user_id/)
  assert.match(sql, /fi_manufacturer_application_reviews/)
  assert.match(sql, /self-sign-up never grants approval/i)
  assert.match(sql, /requester_user_id = \(select auth\.uid\(\)\)/)
})

test('local HTML navigation and asset references resolve to files', () => {
  const pages = fs.readdirSync(dist).filter((name) => name.endsWith('.html'))
  for (const page of pages) {
    const html = read(page)
    const links = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1])
    for (const href of links) {
      if (/^(?:https?:|mailto:|tel:|#|data:)/.test(href)) continue
      const pathname = href.split('#')[0].split('?')[0]
      const target = pathname === './' || pathname === '' ? 'index.html' : pathname
      assert.ok(fs.existsSync(path.resolve(dist, target)), `${page} links to missing ${target}`)
    }
  }
})
