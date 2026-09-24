const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dist = path.resolve('dist')
const read = (name) => fs.readFileSync(path.join(dist, name), 'utf8')

test('the homepage shows a clearly-labelled three-source window price comparison', () => {
  const home = read('index.html')
  assert.match(home, /Send us the thing<br>you can’t source\./)
  assert.match(home, /Within 7 days/)
  assert.match(home, /Free for our first 10 projects/)
  assert.equal((home.match(/class="quote-card(?: quote-card-featured)?"/g) || []).length, 3)
  assert.match(home, /WINDOW PRICE COMPARISON/)
  for (const value of ['Double casement', 'Superhouse', 'A$1,126.44', 'XN Windows', 'Quote required', 'uPVC.com.au', 'A$1,296']) {
    assert.ok(home.includes(value), `missing window comparison value: ${value}`)
  }
})

test('team portraits and biographies follow the confirmed left-to-right identities', () => {
  for (const page of ['index.html', 'builders.html']) {
    const cards = [...read(page).matchAll(/<article class="team-card">([\s\S]*?)<\/article>/g)].map((match) => match[1])
    assert.equal(cards.length, 3, `${page} has three team members`)
    for (const [index, name, image, role] of [
      [0, 'Prem', 'prem-portrait.png', 'CEO'],
      [1, 'Lincy', 'lincy.png', 'CPO'],
      [2, 'Mos', 'mos-portrait.png', 'CTO'],
    ]) {
      assert.ok(cards[index].includes(`src="assets/team/${image}"`), `${page}: correct portrait for ${name}`)
      assert.ok(cards[index].includes(`alt="Portrait of ${name}"`), `${page}: correct accessible name for ${name}`)
      assert.ok(cards[index].includes(`${name.toUpperCase()} · ${role}`), `${page}: correct role for ${name}`)
      assert.ok(cards[index].includes(`<small>${name} `), `${page}: correct biography for ${name}`)
    }
  }
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
