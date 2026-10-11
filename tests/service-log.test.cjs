const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const handler = import('../supabase/functions/_shared/log-handler.mjs');
const env = {publishableKey: 'pub-key', axiomToken: 'xaat-secret', axiomDataset: 'fi_site'};
const request = (body = {event: 'page_view', path: '/shop.html'}, headers = {}, method = 'POST') => new Request('https://example.test', {method, headers: {origin: 'https://fabricationintelligence.com', apikey: 'pub-key', 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.9', 'user-agent': 'Secret Browser', ...headers}, body: method === 'POST' ? JSON.stringify(body) : undefined});

test('log intake rejects bad origins, keys, methods, events, pages and large bodies before calling Axiom', async () => {
  const {handleLog} = await handler;
  const fetchImpl = () => assert.fail('invalid input reached Axiom');
  for (const [req, status] of [
    [request(undefined, {origin: 'https://evil.test'}), 403],
    [request(undefined, {origin: ''}), 403],
    [request(undefined, {apikey: ''}), 401],
    [request(undefined, {apikey: 'wrong'}), 401],
    [request(undefined, {}, 'GET'), 405],
    [request({event: 'purchase', path: '/shop.html'}), 400],
    [request({event: 'page_view', path: '/shop.html?email=a@b.co'}), 400],
    [request({event: 'page_view', path: '/orders.html'}), 400],
    [request({event: 'page_view', path: '/account.html'}), 400],
    [request({event: 'page_view', path: 'https://evil.test/'}), 400],
    [request({event: 'js_error', path: '/shop.html', message: 'x'.repeat(1200)}), 413],
    [request([1, 2]), 400],
  ]) assert.equal((await handleLog(req, {env, fetchImpl})).status, status);
});

test('answers the browser preflight for the production site only', async () => {
  const {handleLog} = await handler;
  const ok = await handleLog(request(undefined, {}, 'OPTIONS'), {env});
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://fabricationintelligence.com');
});

test('without an Axiom token and dataset nothing is sent', async () => {
  const {handleLog} = await handler;
  const response = await handleLog(request(), {env: {publishableKey: 'pub-key'}, fetchImpl: () => assert.fail('sent without configuration')});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {logged: false, reason: 'not_configured'});
});

test('forwards only fixed fields to Axiom and drops the IP address, browser and extra data', async () => {
  const {handleLog} = await handler;
  let call;
  const response = await handleLog(request({event: 'js_error', path: '/shop.html', message: 'Failed at https://x.test/a?token=1 for me@example.com', email: 'secret@example.com', user_id: 'abc'}), {
    env, now: () => new Date('2026-10-11T00:00:00Z'),
    fetchImpl: async (url, init) => { call = {url, init}; return {ok: true}; },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).logged, true);
  assert.equal(call.url, 'https://api.axiom.co/v1/ingest/fi_site');
  assert.equal(call.init.headers.Authorization, 'Bearer xaat-secret');
  const [row] = JSON.parse(call.init.body);
  assert.deepEqual(Object.keys(row).sort(), ['_time', 'event', 'message', 'path', 'site']);
  assert.equal(row.message, 'Failed at [url] for [email]');
  assert.doesNotMatch(call.init.body, /192\.0\.2\.9|Secret Browser|secret@example|user_id|token=1/);
});

test('upstream failures and a bad dataset name surface without leaking the token', async () => {
  const {handleLog} = await handler;
  const failed = await handleLog(request(), {env, fetchImpl: async () => ({ok: false})});
  assert.equal(failed.status, 502);
  const thrown = await handleLog(request(), {env, fetchImpl: async () => { throw new Error('xaat-secret'); }});
  assert.equal(thrown.status, 502);
  assert.doesNotMatch(await thrown.text(), /xaat-secret/);
  const bad = await handleLog(request(), {env: {...env, axiomDataset: 'a/b'}, fetchImpl: () => assert.fail('bad dataset sent')});
  assert.equal(bad.status, 500);
});

const clientSource = fs.readFileSync(path.join(__dirname, '..', 'dist', 'fi-log.js'), 'utf8');
function browser({endpoint = 'https://abc.supabase.co/functions/v1/fi-log', key = 'publishable-key-123', pathname = '/shop.html', hostname = 'fabricationintelligence.com', gpc = false, dnt = null} = {}) {
  const calls = [], listeners = {};
  const window = {FI_LOG: {endpoint, publishableKey: key}, location: {pathname, hostname}, navigator: {globalPrivacyControl: gpc, doNotTrack: dnt}, addEventListener: (name, fn) => { listeners[name] = fn; }};
  const document = {addEventListener: (name, fn) => { listeners['doc:' + name] = fn; }};
  const fetch = (url, init) => { calls.push({url, init}); return Promise.resolve({ok: true}); };
  vm.runInNewContext(clientSource, {window, document, fetch, JSON, Set, URLSearchParams});
  return {window, calls, listeners};
}

test('the browser logger is inert when unconfigured, off the production host, on private pages, or when the visitor opts out', () => {
  for (const options of [{endpoint: ''}, {key: ''}, {endpoint: 'https://evil.test/fi-log'}, {hostname: 'localhost'}, {hostname: 'fabricationintelligence.com.evil.test'}, {gpc: true}, {dnt: '1'}, ...['/auth.html', '/account.html', '/orders.html', '/commerce-admin.html', '/order-catalogue.html', '/stage2.html'].map(pathname => ({pathname}))]) {
    const app = browser(options);
    assert.equal(app.window.fiLog('page_view'), false, JSON.stringify(options));
    assert.equal(app.calls.length, 0);
  }
});

test('the browser logger sends one page view with the path only, cleans error text, and ignores unknown events', () => {
  const app = browser({pathname: '/docs.html'});
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].url, 'https://abc.supabase.co/functions/v1/fi-log');
  assert.equal(app.calls[0].init.headers.apikey, 'publishable-key-123');
  assert.deepEqual(JSON.parse(app.calls[0].init.body), {event: 'page_view', path: '/docs.html'});
  assert.equal(app.window.fiLog('purchase'), false);
  assert.equal(app.window.fiLog('page_view'), false, 'a repeat page view is not sent twice');
  assert.equal(app.window.fiLog('js_error', {message: 'Boom at https://x.test/?a=1 by me@example.com'}), true);
  assert.equal(JSON.parse(app.calls[1].init.body).message, 'Boom at [url] by [email]');
  assert.equal(app.calls[1].init.credentials, undefined);
  assert.equal(app.window.fiLog('js_error', {message: 'Boom at https://x.test/?a=1 by me@example.com'}), false, 'identical errors are not repeated');
});
