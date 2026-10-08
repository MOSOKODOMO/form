const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const consentKey = 'fi.analytics.consent.v1';
const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'telemetry.js'), 'utf8');

function browser({id = 'G-TEST123', pathname = '/shop.html', hostname = 'fabricationintelligence.com', choice, experiment = null, search = '?email=private@example.com#access_token=secret'} = {}) {
  const nodes = [], listeners = {}, windowListeners = {}, observers = [], deletedCookies = [];
  const local = new Map(choice ? [[consentKey, choice]] : []), session = new Map();
  const storage = map => ({getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key)});
  function element(tag) {
    const node = {tag, children: [], events: {}, attributes: {}, removed: false,
      append(...children) { this.children.push(...children); },
      setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener(key, callback) { this.events[key] = callback; },
      remove() { this.removed = true; }, focus(options) { this.focusOptions = options; },
      querySelector(selector) { return this.children.flatMap(child => [child, ...child.children]).find(child => child.tag === selector); },
    };
    nodes.push(node); return node;
  }
  const footer = element('footer'), hero = element('hero'), headline = element('h1'), description = element('p');
  const document = {
    head: element('head'), body: element('body'), createElement: element,
    querySelector(selector) {
      return {'.site-footer-links': footer, '[data-message-test]': hero, '[data-message-headline]': headline, '[data-message-description]': description}[selector]
        || nodes.find(node => Object.hasOwn(node.attributes, selector.slice(1, -1)));
    },
    addEventListener: (name, listener) => { listeners[name] = listener; },
  };
  Object.defineProperty(document, 'cookie', {get: () => '_ga=abc; _ga_TEST123=xyz; auth_session=private', set: value => deletedCookies.push(value)});
  const window = {
    FI_ANALYTICS: {measurementId: id, experiment}, location: {pathname, hostname, search},
    localStorage: storage(local), sessionStorage: storage(session),
    addEventListener: (name, listener) => { windowListeners[name] = listener; },
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.disconnected = true; }
    },
  };
  vm.runInNewContext(source, {window, document, Date, Set, URLSearchParams, encodeURIComponent});
  const click = text => {
    const button = nodes.findLast(node => node.tag === 'button' && node.textContent === text);
    assert.ok(button, `button: ${text}`); button.events.click();
  };
  const events = () => Array.from(window.dataLayer || []).filter(args => args[0] === 'event').map(args => ({name: args[1], params: JSON.parse(JSON.stringify(args[2]))}));
  return {window, document, nodes, listeners, windowListeners, local, session, observers, deletedCookies, click, events};
}

test('GA is inert without configuration, on preview hosts, and throughout private flows', () => {
  for (const options of [
    {id: ''}, {id: 'not-a-stream'}, {hostname: '127.0.0.1'}, {hostname: 'fabricationintelligence.com.attacker.test'},
    ...['/auth.html', '/account.html', '/commerce-admin.html', '/orders.html', '/order-catalogue.html', '/stage2.html'].map(pathname => ({pathname})),
  ]) {
    const app = browser({...options, choice: 'granted'});
    assert.equal(app.window.fiTrackEvent('product_open'), false);
    assert.equal(app.window.dataLayer, undefined);
    assert.equal(app.document.head.children.length, 0);
    assert.equal(app.document.body.children.length, 0);
  }
  const config = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'telemetry-config.js'), 'utf8'), {window: config});
  assert.equal(config.FI_ANALYTICS.measurementId, '');
  assert.equal(config.FI_ANALYTICS.experiment, null);
});

test('no Google script or event is sent before consent or after declining', () => {
  const app = browser();
  assert.equal(app.window.fiTrackEvent('product_open'), false);
  assert.equal(app.document.head.children.filter(node => node.tag === 'script').length, 0);
  assert.equal(app.window.dataLayer, undefined);
  app.click('No thanks');
  assert.equal(app.local.get(consentKey), 'denied');
  assert.equal(app.window.fiTrackEvent('checkout_click'), false);
  assert.equal(app.window.dataLayer, undefined);
  const returning = browser({choice: 'denied'});
  assert.equal(returning.document.body.children.length, 0);
  assert.equal(returning.window.dataLayer, undefined);
});

test('consented events strip URL secrets and arbitrary product, customer and form data', () => {
  const app = browser({choice: 'granted'});
  const scripts = app.document.head.children.filter(node => node.tag === 'script');
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-TEST123');
  assert.deepEqual(app.events().map(event => event.name), ['page_view', 'shop_open']);
  const config = app.window.dataLayer.find(args => args[0] === 'config')[2];
  assert.equal(config.send_page_view, false);
  assert.equal(config.allow_google_signals, false);
  app.window.fiTrackEvent('generate_lead', {form_name: 'contact_home', email: 'private@example.com', user_id: 'private-user', value: 123});
  app.listeners.click({target: {closest: selector => selector.includes('.catalog-detail__buy') ? {} : null}});
  assert.equal(app.events().at(-1).name, 'checkout_click');
  assert.equal(app.window.fiTrackEvent('private_maker_name'), false);
  assert.deepEqual(app.events().find(event => event.name === 'generate_lead').params, {
    page_location: 'https://fabricationintelligence.com/shop.html', page_title: 'Shop', page_referrer: '', form_name: 'contact_home',
  });
  assert.doesNotMatch(JSON.stringify(app.window.dataLayer), /private|access_token|secret|user_id|email|value/);
});

test('withdrawing consent stops events, clears only analytics cookies and allows a later choice without duplicate page views', () => {
  const app = browser();
  app.click('Allow analytics');
  assert.equal(app.events().filter(event => event.name === 'page_view').length, 1);
  app.click('Analytics choices'); app.click('No thanks');
  assert.equal(app.window['ga-disable-G-TEST123'], true);
  assert.equal(app.window.fiTrackEvent('product_open'), false);
  assert.ok(app.deletedCookies.some(value => value.startsWith('_ga=')));
  assert.ok(app.deletedCookies.every(value => value.startsWith('_ga')));
  app.click('Analytics choices'); app.click('Allow analytics');
  assert.equal(app.window.fiTrackEvent('product_open'), true);
  assert.equal(app.document.head.children.filter(node => node.tag === 'script').length, 1);
  assert.equal(app.events().filter(event => event.name === 'page_view').length, 1);
  app.windowListeners.storage({key: consentKey, newValue: 'denied'});
  assert.equal(app.window.fiTrackEvent('checkout_click'), false);
});

test('future message experiments accept only defined cohorts and count a visible impression once', () => {
  const experiment = {id: 'example_test', defaultVariant: 'control', variants: {control: {headline: 'Control'}, alternative: {headline: 'Alternative'}}};
  const app = browser({experiment, pathname: '/', search: '?message_variant=alternative'});
  assert.equal(app.session.size, 0);
  assert.equal(app.document.querySelector('[data-message-headline]').textContent, 'Alternative');
  app.click('Allow analytics');
  app.windowListeners.storage({key: consentKey, newValue: 'granted'});
  assert.equal(app.observers[0].disconnected, true);
  const visible = [{isIntersecting: true, intersectionRatio: 0.8}];
  app.observers.at(-1).callback([{isIntersecting: true, intersectionRatio: 0.1}]);
  assert.equal(app.events().filter(event => event.name === 'message_view').length, 0);
  app.observers.at(-1).callback(visible); app.observers[0].callback(visible);
  assert.equal(app.events().filter(event => event.name === 'message_view').length, 1);
  assert.equal(app.events().at(-1).params.message_variant, 'alternative');
  app.click('Analytics choices'); app.click('No thanks');
  assert.equal(app.session.size, 0);
  const unknown = browser({experiment, choice: 'granted', search: '?message_variant=private@example.com'});
  assert.equal(unknown.document.querySelector('[data-message-headline]').textContent, 'Control');
  assert.doesNotMatch(JSON.stringify(unknown.window.dataLayer), /private@example/);
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
