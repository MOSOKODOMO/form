const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const FI = require('../dist/catalogue.js');
const PM = require('../dist/photo-match.js');
const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const raw = JSON.parse(read('dist', 'data', 'products.json'));
const products = FI.listedProducts(Array.isArray(raw) ? raw : raw.products).filter((p) => !p.sample);

test('a black handle photo ranks black handles first and only returns close matches', () => {
  const results = PM.matchProducts({category: 'handles', finish: 'black', keywords: ['handle']}, products, FI);
  assert.ok(results.length > 0 && results.length <= PM.MAX_RESULTS);
  assert.equal(results[0].product.category, 'handles');
  assert.ok(FI.finishesOf(results[0].product).includes('black'));
  assert.ok(results.every((r) => r.score >= PM.MIN_SCORE));
  for (let i = 1; i < results.length; i += 1) assert.ok(results[i - 1].score >= results[i].score);
  assert.ok(results[0].reasons.length >= 2);
});

test('word hints fill in a missing category, unknown finishes are ignored, and non-hardware gives nothing', () => {
  assert.equal(PM.cleanAttrs({keywords: ['lever']}).category, 'doors');
  assert.equal(PM.cleanAttrs({finish: 'other'}).finish, null);
  assert.equal(PM.cleanAttrs(null).category, null);
  assert.deepEqual(PM.matchProducts({is_hardware: false, category: 'handles'}, products, FI), []);
  assert.deepEqual(PM.matchProducts({category: null, finish: null, keywords: []}, products, FI), []);
});

test('the three example photos each match something buyable', () => {
  assert.equal(PM.EXAMPLES.length, 3);
  for (const example of PM.EXAMPLES) {
    const results = PM.matchProducts(example.attrs, products, FI);
    assert.ok(results.length > 0, `${example.id} has matches`);
    assert.ok(results.some((r) => FI.canBuyNow(r.product)), `${example.id} has a buyable match`);
  }
});

test('the find page is wired up, warns about people and contains no secrets', () => {
  const page = read('dist', 'find.html');
  assert.match(page, /never people/);
  assert.match(page, /Google Gemini/);
  assert.match(page, /find-examples/);
  for (const file of ['photo-match.js', 'find.js']) assert.match(page, new RegExp(file.replace('.', '\\.')));
  assert.doesNotMatch(page + read('dist', 'find.js') + read('dist', 'photo-match.js'), /AIza|sk-or-v1|GEMINI_API_KEY\s*=/);
  assert.match(read('dist', 'index.html'), /href="find\.html"/);
});

test('photo search edge function: gemini, openrouter backup, examples when both fail', async () => {
  const {handlePhotoMatch, normalise, extractJson} = await import('../supabase/functions/_shared/photo-match-handler.mjs');
  const image = 'A'.repeat(400);
  const origin = 'https://fabricationintelligence.com';
  const key = 'sb_publishable_test';
  const request = (body, headers = {}) => new Request('https://x.test/fi-photo-match', {method: 'POST', headers: {origin, apikey: key, 'content-type': 'application/json', ...headers}, body: typeof body === 'string' ? body : JSON.stringify(body)});
  const geminiOk = {candidates: [{content: {parts: [{text: '{"is_hardware":true,"contains_person":false,"category":"handles","finish":"black","keywords":["T-Bar","knurled"],"size_mm":160,"summary":"A black bar handle."}'}]}}]};
  const json = (body, status = 200) => new Response(JSON.stringify(body), {status});
  const base = {publishableKey: key, geminiKey: 'g', openrouterKey: 'o', openrouterModel: 'vendor/model:free'};

  let calls = [];
  let res = await handlePhotoMatch(request({image}), {env: base, fetchImpl: async (url, init) => { calls.push(url); assert.match(init.headers['x-goog-api-key'] || '', /^g$/); return json(geminiOk); }});
  let body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.source, 'gemini');
  assert.deepEqual(body.attrs.keywords, ['t-bar', 'knurled']);
  assert.equal(body.attrs.size_mm, 160);
  assert.equal(calls.length, 1);

  calls = [];
  res = await handlePhotoMatch(request({image}), {env: base, fetchImpl: async (url) => { calls.push(url); return url.includes('googleapis') ? json({}, 429) : json({choices: [{message: {content: 'Sure! {"category":"knobs","finish":"brass","keywords":["knob"]}'}}]}); }});
  body = await res.json();
  assert.equal(body.source, 'openrouter');
  assert.equal(body.fallback_used, true);
  assert.equal(body.attrs.category, 'knobs');

  res = await handlePhotoMatch(request({image}), {env: base, fetchImpl: async () => json({}, 500)});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).reason, 'upstream');

  res = await handlePhotoMatch(request({image}), {env: {publishableKey: key}, fetchImpl: async () => { throw new Error('should not be called'); }});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).reason, 'not_configured');

  res = await handlePhotoMatch(request({image}), {env: base, fetchImpl: async () => json({candidates: [{content: {parts: [{text: '{"contains_person":true}'}]}}]})});
  assert.equal(res.status, 422);
});

test('photo search edge function guards: origin, key, size, bad image, method, no secrets leaked', async () => {
  const {handlePhotoMatch, normalise, extractJson} = await import('../supabase/functions/_shared/photo-match-handler.mjs');
  const key = 'sb_publishable_test';
  const env = {publishableKey: key, geminiKey: 'g'};
  const never = async () => { throw new Error('upstream must not be called'); };
  const make = (init, body = '{}') => new Request('https://x.test/f', {method: 'POST', body, ...init});
  assert.equal((await handlePhotoMatch(make({headers: {origin: 'https://evil.test', apikey: key}}), {env, fetchImpl: never})).status, 403);
  assert.equal((await handlePhotoMatch(make({headers: {origin: 'https://fabricationintelligence.com', apikey: 'wrong'}}), {env, fetchImpl: never})).status, 401);
  assert.equal((await handlePhotoMatch(make({headers: {origin: 'https://fabricationintelligence.com', apikey: key}}, 'x'.repeat(901000)), {env, fetchImpl: never})).status, 413);
  assert.equal((await handlePhotoMatch(make({headers: {origin: 'https://fabricationintelligence.com', apikey: key}}, JSON.stringify({image: 'not base64!'})), {env, fetchImpl: never})).status, 400);
  assert.equal((await handlePhotoMatch(new Request('https://x.test/f', {method: 'GET', headers: {origin: 'https://fabricationintelligence.com'}}), {env, fetchImpl: never})).status, 405);
  const options = await handlePhotoMatch(new Request('https://x.test/f', {method: 'OPTIONS', headers: {origin: 'https://fabricationintelligence.com'}}), {env, fetchImpl: never});
  assert.equal(options.status, 204);
  assert.equal(normalise({category: 'weapons', finish: 'gold', keywords: ['<b>x</b>', 5], size_mm: 99999}).category, null);
  assert.doesNotMatch(normalise({keywords: ['<b>Bold</b>']}).keywords[0], /[<>\/]/);
  assert.equal(extractJson('no json here'), null);
  const source = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'fi-photo-match', 'index.ts'), 'utf8');
  assert.match(source, /Deno\.env\.get\('GEMINI_API_KEY'\)/);
  assert.doesNotMatch(source, /AIza|sk-or-v1/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'config.toml'), 'utf8'), /\[functions\.fi-photo-match\][\s\S]*verify_jwt = false/);
});
