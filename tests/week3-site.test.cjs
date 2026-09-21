const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dist = path.resolve('dist')
const read = (name) => fs.readFileSync(path.join(dist, name), 'utf8')

test('the Week 3 one-pager is the homepage and shows a clearly-labelled three-quote comparison', () => {
  const home = read('index.html')
  assert.match(home, /Send us the thing<br>you can’t source\./)
  assert.match(home, /Within 7 days/)
  assert.match(home, /Free for our first 10 projects/)
  assert.equal((home.match(/class="quote-card(?: quote-card-featured)?"/g) || []).length, 3)
  assert.equal((home.match(/<span>SAMPLE<\/span>/g) || []).length, 3)
  for (const line of ['Factory price', 'Freight', 'Duty', 'GST', 'Inspection', 'Final delivery', 'Installation']) {
    assert.ok(home.includes(line), `missing delivered-cost line: ${line}`)
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
