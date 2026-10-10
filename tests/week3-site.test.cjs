const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dist = path.resolve('dist')
const read = (name) => fs.readFileSync(path.join(dist, name), 'utf8')

test('windows no longer advertises the old price-comparison service',()=>{ assert.match(read('windows.html'),/Under consideration/); assert.doesNotMatch(read('windows.html'),/quote-card|Stegbar|A\$356/); })

test('founder identities remain available on the homepage',()=>{ const html=read('index.html'); for(const name of ['Prem','Lincy','Mos']) assert.ok(html.includes('Portrait of '+name)); })

test('retired sourcing routes direct customers to products and their orders',()=>{ const html=read('stage2.html'); assert.match(html,/href="shop.html"/); assert.match(html,/href="orders.html"/); assert.doesNotMatch(html,/<form|stage2\.js/); })

test('product reviews replace pricing comparisons and services state the correct fee',()=>{ assert.match(read('pricing.html'),/url=reviews.html/); assert.match(read('reviews.html'),/PRODUCT REVIEWS/); assert.match(read('services.html'),/10% of the initial product price/); })

test('general feedback and purchase reviews have separate entry points',()=>{ assert.match(read('feedback.js'),/formsubmit\.co\/ajax\/fabricationintelligence@gmail\.com/); assert.match(read('feedback.html'),/href="reviews.html#write-review"/); })

test('public pages use no em dashes and share a preview card', () => {
  for (const name of fs.readdirSync(dist).filter((file) => /\.(html|js)$/.test(file))) {
    assert.ok(!read(name).includes('—'), `${name} contains an em dash`)
  }
  for (const page of ['index.html', 'reviews.html', 'feedback.html', 'stage2.html', 'how-it-works.html']) {
    assert.match(read(page), /property="og:image" content="https:\/\/fabricationintelligence\.com\/assets\/share-card\.jpg"/, `${page} has a share preview`)
  }
  assert.ok(fs.existsSync(path.join(dist, 'assets', 'share-card.jpg')))
  assert.ok(!fs.existsSync(path.join(dist, 'concept.html')), 'the old staircase concept page stays removed')
})

test('the old public request entry redirects to the collection',()=>{ assert.match(read('request.html'),/url=shop.html/); })

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
