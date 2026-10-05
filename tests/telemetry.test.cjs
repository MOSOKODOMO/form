const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('site telemetry is inert until a GA4 measurement ID is configured', () => {
  const appended = [];
  const window = {};
  const document = {head: {append: (node) => appended.push(node)}, createElement: () => ({})};
  const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'telemetry.js'), 'utf8');
  vm.runInNewContext(source, {window, document, Date, Set, encodeURIComponent});
  assert.equal(window.fiTrackEvent('product_open'), false);
  assert.equal(window.fiTrackEvent('email_address'), false);
  assert.equal(window.dataLayer, undefined);
  assert.equal(appended.length, 0);
});

test('configured GA4 tracks approved page events and checkout clicks without product details', () => {
  const appended = [];
  const listeners = {};
  const window = {location: {pathname: '/shop.html'}};
  const document = {
    head: {append: (node) => appended.push(node)},
    createElement: () => ({}),
    addEventListener: (name, listener) => { listeners[name] = listener; },
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'telemetry.js'), 'utf8')
    .replace("const measurementId = '';", "const measurementId = 'G-TEST123';");
  vm.runInNewContext(source, {window, document, Date, Set, encodeURIComponent});
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-TEST123');
  assert.equal(window.dataLayer[2][1], 'shop_open');
  listeners.click({target: {closest: () => ({})}});
  assert.equal(window.dataLayer[3][1], 'checkout_click');
  assert.equal(window.fiTrackEvent('private_maker_name'), false);
});

test('Axiom logging is server-only, opt-in and strips report details', async () => {
  const {logFiVerifyRun} = await import('../observability/axiom.mjs');
  let requests = 0;
  const fetchImpl = async (_url, options) => {
    requests += 1;
    const [body] = JSON.parse(options.body);
    assert.deepEqual(Object.keys(body).sort(), ['certificate_count', 'duration_ms', 'event', 'source_count', 'status', 'time']);
    assert.equal(body.source_count, 2);
    assert.equal(body.certificate_count, 1);
    assert.equal(body.status, 'approved');
    assert.doesNotMatch(options.body, /Private Maker|secret-certificate|reviewer@example/);
    return {ok: true};
  };
  const event = {status: 'approved', sourceCount: 2, certificateCount: 1, durationMs: 42,
    maker: 'Private Maker', certificate: 'secret-certificate', reviewer: 'reviewer@example'};
  assert.deepEqual(await logFiVerifyRun(event, {env: {}, fetchImpl}), {sent: false, reason: 'not_configured'});
  assert.equal(requests, 0);
  assert.deepEqual(await logFiVerifyRun(event, {env: {
    AXIOM_API_TOKEN: 'test-token', AXIOM_DATASET: 'fi_verify', AXIOM_DOMAIN: 'api.axiom.co',
  }, fetchImpl}), {sent: true});
  assert.equal(requests, 1);
});

test('Axiom accepts FI Verify lifecycle events without sending report IDs', async () => {
  const {logFiVerifyRun} = await import('../observability/axiom.mjs');
  let sent;
  await logFiVerifyRun({name: 'fi_verify.report_approved', reportId: 'private-id'}, {
    env: {AXIOM_API_TOKEN: 'test-token', AXIOM_DATASET: 'fi_verify'},
    fetchImpl: async (_url, options) => { sent = JSON.parse(options.body)[0]; return {ok: true}; },
  });
  assert.equal(sent.event, 'fi_verify.report_approved');
  assert.equal(sent.status, 'approved');
  assert.equal(sent.reportId, undefined);
});
