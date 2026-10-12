const {test, beforeEach} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const modulePromise = import('../supabase/functions/_shared/price-compare-handler.mjs')

const sample = {shopping_results: [
  {title: 'Keychron K2 Keyboard', price: '$139.00', extracted_price: 139, seller: 'Mwave', link: 'https://mwave.example/k2'},
  {title: 'Keychron K2 (V2)', price: '$131.97', extracted_price: 131.97, source: 'Mighty Ape', product_link: 'https://mightyape.example/k2'},
  {title: 'Keychron K2 again', price: '$150', extracted_price: 150, seller: 'Mwave', link: 'https://mwave.example/other'},
  {title: 'No price', seller: 'Nobody', link: 'https://nobody.example'},
  {title: 'Plain http link', extracted_price: 10, seller: 'Insecure', link: 'http://insecure.example'},
  {title: 'Bad link', extracted_price: 10, seller: 'Broken', link: 'javascript:alert(1)'},
  {title: 'Text price only', price: 'A$1,019.00', seller: 'Kogan', link: 'https://kogan.example/k2'},
]}
const post = (body, headers = {}) => new Request('https://example.test/fi-price-compare', {method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers})
const okFetch = (calls = []) => async (url) => { calls.push(url); return new Response(JSON.stringify(sample), {status: 200}) }

beforeEach(async () => { (await modulePromise).resetPriceCompareState() })

test('tidyResults keeps one https listing per shop, cheapest first, and drops rows it cannot trust', async () => {
  const {tidyResults} = await modulePromise
  const rows = tidyResults(sample)
  assert.deepEqual(rows.map((r) => [r.seller, r.price]), [['Mighty Ape', 131.97], ['Mwave', 139], ['Kogan', 1019]])
  for (const row of rows) assert.match(row.link, /^https:\/\//)
  assert.deepEqual(tidyResults(null), [])
  assert.deepEqual(tidyResults({shopping_results: 'x'}), [])
})

test('a good request returns sorted AUD prices, asks SearchApi for Australia and caches the answer', async () => {
  const {handlePriceCompare} = await modulePromise
  const calls = []
  const env = {apiKey: 'test-key-123'}
  const first = await handlePriceCompare(post({q: '  Keychron   K2-C3H '}), {env, fetchImpl: okFetch(calls)})
  assert.equal(first.status, 200)
  const body = await first.json()
  assert.equal(body.query, 'Keychron K2-C3H')
  assert.equal(body.currency, 'AUD')
  assert.equal(body.cached, false)
  assert.equal(body.results[0].seller, 'Mighty Ape')
  const url = new URL(calls[0])
  assert.equal(url.origin + url.pathname, 'https://www.searchapi.io/api/v1/search')
  assert.equal(url.searchParams.get('engine'), 'google_shopping')
  assert.equal(url.searchParams.get('gl'), 'au')
  assert.equal(url.searchParams.get('q'), 'Keychron K2-C3H')
  const second = await handlePriceCompare(post({q: 'keychron k2-c3h'}), {env, fetchImpl: okFetch(calls)})
  assert.equal((await second.json()).cached, true)
  assert.equal(calls.length, 1, 'the repeat did not use another search')
})

test('bad input is refused before anything is spent', async () => {
  const {handlePriceCompare} = await modulePromise
  const calls = []
  const env = {apiKey: 'k'}
  for (const body of ['not json', {}, {q: 'ab'}, {q: 'x'.repeat(121)}, {q: 5}, {q: 'bad\u0001name'}]) {
    const response = await handlePriceCompare(post(body), {env, fetchImpl: okFetch(calls)})
    assert.equal(response.status, 400)
  }
  assert.equal((await handlePriceCompare(post('x'.repeat(700)), {env, fetchImpl: okFetch(calls)})).status, 413)
  assert.equal((await handlePriceCompare(new Request('https://example.test/', {method: 'GET'}), {env, fetchImpl: okFetch(calls)})).status, 405)
  assert.equal(calls.length, 0)
})

test('preflight works from an extension and the key is never in a response', async () => {
  const {handlePriceCompare} = await modulePromise
  const pre = await handlePriceCompare(new Request('https://example.test/', {method: 'OPTIONS'}), {env: {apiKey: 'secret-key-xyz'}})
  assert.equal(pre.status, 204)
  assert.equal(pre.headers.get('access-control-allow-origin'), '*')
  const failing = await handlePriceCompare(post({q: 'Keychron K2'}), {env: {apiKey: 'secret-key-xyz'}, fetchImpl: async () => { throw new Error('network down https://www.searchapi.io/api/v1/search?api_key=secret-key-xyz') }})
  assert.equal(failing.status, 502)
  assert.doesNotMatch(await failing.text(), /secret-key-xyz|searchapi/)
  const upstream = await handlePriceCompare(post({q: 'Keychron K3'}), {env: {apiKey: 'secret-key-xyz'}, fetchImpl: async () => new Response('nope', {status: 401})})
  assert.equal(upstream.status, 502)
  assert.doesNotMatch(await upstream.text(), /secret-key-xyz/)
})

test('without a key it says prices are not switched on, and it rate limits per address and per day', async () => {
  const {handlePriceCompare} = await modulePromise
  const off = await handlePriceCompare(post({q: 'Keychron K2'}), {env: {apiKey: ''}, fetchImpl: okFetch()})
  assert.equal(off.status, 503)
  assert.equal((await off.json()).reason, 'not_configured')
  const env = {apiKey: 'k'}
  const calls = []
  const limits = {perMinute: 2, perDay: 3}
  const as = (ip, q) => handlePriceCompare(post({q}, {'x-forwarded-for': ip}), {env, fetchImpl: okFetch(calls), limits, now: () => Date.UTC(2026, 9, 12, 5, 0, 0)})
  assert.equal((await as('1.1.1.1', 'product one')).status, 200)
  assert.equal((await as('1.1.1.1', 'product two')).status, 200)
  assert.equal((await as('1.1.1.1', 'product three')).status, 429, 'third lookup in a minute from one address')
  assert.equal((await as('2.2.2.2', 'product three')).status, 200)
  const daily = await as('3.3.3.3', 'product four')
  assert.equal(daily.status, 429)
  assert.equal((await daily.json()).reason, 'daily_limit')
  assert.equal(calls.length, 3)
})

test('the edge function is wired up, public by design, and keeps the key in the environment', () => {
  const index = fs.readFileSync(path.join(__dirname, '../supabase/functions/fi-price-compare/index.ts'), 'utf8')
  assert.match(index, /Deno\.env\.get\("SEARCHAPI_KEY"\)/)
  const config = fs.readFileSync(path.join(__dirname, '../supabase/config.toml'), 'utf8')
  assert.match(config, /\[functions\.fi-price-compare\][^\[]*verify_jwt = false/)
  const handler = fs.readFileSync(path.join(__dirname, '../supabase/functions/_shared/price-compare-handler.mjs'), 'utf8')
  assert.doesNotMatch(handler, /console\.|—/)
  const everything = [index, handler, fs.readFileSync(path.join(__dirname, '../extension/popup.js'), 'utf8')].join('\n')
  assert.doesNotMatch(everything, /sk-or-|MatQxHjFB4yG5K8GnDLd5xS2/)
})
