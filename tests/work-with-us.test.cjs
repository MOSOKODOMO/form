const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = name => fs.readFileSync(path.join(__dirname, '..', 'dist', name), 'utf8');
const source = read('contact-form.js');
const roles = ['warehouse-inspector', 'marketing-content', 'supplier-sourcing', 'customer-support'];

function browser({search = '', pathname = '/contact.html', relationship = 'buyer', fetchImpl} = {}) {
  const listeners = {}, calls = [], events = [];
  const fields = Object.fromEntries(Object.entries({name: 'Test Applicant', email: 'applicant@example.test', product: '', message: 'An introduction with relevant experience.', website: '', relationship, position: '', portfolio: ''}).map(([name, value]) => [name, {value, disabled: false}]));
  const button = {disabled: false}, application = {hidden: true};
  const status = {textContent: '', classList: {toggle(_class, value) { status.isError = value; }}};
  const thanks = {hidden: true, focus() { this.focused = true; }};
  const form = {
    hidden: false,
    elements: {...fields, namedItem: name => fields[name] || null},
    querySelector: selector => selector === '[data-application-fields]' ? application : button,
    addEventListener: (name, callback) => { listeners[name] = callback; },
  };
  const block = {querySelector: selector => ({form, '.contact-form-status': status, '.contact-thanks': thanks})[selector]};
  const window = {location: {search, pathname}, fiTrackEvent(name, params) { events.push({name, params: JSON.parse(JSON.stringify(params))}); }};
  vm.runInNewContext(source, {
    window, document: {querySelectorAll: () => [block]}, URLSearchParams, URL,
    console: {error() {}},
    FormData: class { constructor(form) { this.form = form; } get(name) { const field = this.form.elements.namedItem(name); return field?.disabled ? null : field?.value ?? null; } },
    fetch: async (url, options) => {
      calls.push({url, method: options.method, body: JSON.parse(options.body)});
      return fetchImpl ? fetchImpl(url, options) : {ok: true, json: async () => ({success: true})};
    },
  });
  return {fields, button, application, status, thanks, form, calls, events,
    choose(value) { fields.relationship.value = value; listeners.change(); },
    submit() { return listeners.submit({preventDefault() {}}); },
  };
}

test('each posted role links to a selectable application on both public forms', () => {
  const contact = read('contact.html');
  assert.match(contact, /<title>Work with us \| FABINT<\/title>/);
  for (const role of roles) {
    assert.ok(contact.includes(`contact.html?role=${role}#contact-form`));
    for (const page of ['contact.html', 'index.html']) {
      assert.ok(read(page).includes(`<option value="${role}">`), `${page}: ${role}`);
      assert.match(read(page), /name="relationship" value="applicant"/);
    }
  }
  assert.match(read('privacy.html'), /Team applications include your selected position/);
});

test('applicants select a position and only application links enable its extra fields', async () => {
  const app = browser({relationship: ''});
  assert.equal(app.application.hidden, true);
  assert.equal(app.fields.position.disabled, true);
  await app.submit();
  assert.equal(app.calls.length, 0);
  assert.match(app.status.textContent, /choose buyer, supplier or join the team/);
  app.choose('applicant');
  assert.equal(app.application.hidden, false);
  assert.equal(app.fields.position.required, true);
  assert.equal(app.fields.portfolio.disabled, false);
  await app.submit();
  assert.equal(app.calls.length, 0);
  assert.match(app.status.textContent, /choose a position/);
  app.fields.position.value = 'unknown-role';
  await app.submit();
  assert.equal(app.calls.length, 0);
});

test('role links preselect each position and route applications to the existing team inbox', async () => {
  for (const role of roles) {
    const app = browser({search: `?role=${role}`, relationship: ''});
    assert.equal(app.fields.relationship.value, 'applicant');
    assert.equal(app.fields.position.value, role);
    assert.equal(app.application.hidden, false);
    app.fields.portfolio.value = 'https://example.test/my-portfolio';
    await app.submit();
    assert.equal(app.calls.length, 1);
    const call = app.calls[0];
    assert.equal(call.url, 'https://formsubmit.co/ajax/fabricationintelligence@gmail.com');
    assert.equal(call.method, 'POST');
    assert.equal(call.body.relationship, 'Team applicant');
    assert.match(call.body._subject, /^FI application for /);
    assert.equal(call.body.portfolio, 'https://example.test/my-portfolio');
    assert.equal(call.body.message, app.fields.message.value);
    assert.equal(app.form.hidden, true);
    assert.equal(app.thanks.hidden, false);
    assert.equal(app.thanks.focused, true);
    assert.equal(app.button.disabled, false);
    assert.deepEqual(app.events, [{name: 'generate_lead', params: {form_name: 'contact_page'}}]);
    assert.doesNotMatch(JSON.stringify(app.events), /Applicant|example\.test|portfolio|position|experience/);
  }
});

test('product quote links still preselect buyer and supplier messages have distinct subjects', async () => {
  const buyer = browser({relationship: '', search: '?product=Brass%20handle'});
  assert.equal(buyer.fields.relationship.value, 'buyer');
  assert.equal(buyer.fields.product.value, 'Brass handle');
  await buyer.submit();
  assert.equal(buyer.calls[0].body.relationship, 'Buyer');
  assert.match(buyer.calls[0].body._subject, /buyer enquiry.*Brass handle/);
  const supplier = browser({relationship: 'supplier', pathname: '/'});
  await supplier.submit();
  assert.equal(supplier.calls[0].body.relationship, 'Supplier');
  assert.match(supplier.calls[0].body._subject, /supplier introduction/);
  assert.equal(supplier.events[0].params.form_name, 'contact_home');
});

test('changing from applicant to buyer omits stored application details from the email', async () => {
  const app = browser({search: '?role=marketing-content'});
  app.fields.portfolio.value = 'https://example.test/private-cv';
  app.choose('buyer');
  assert.equal(app.application.hidden, true);
  assert.equal(app.fields.position.required, false);
  assert.equal(app.fields.portfolio.disabled, true);
  await app.submit();
  assert.equal(app.calls[0].body.position, undefined);
  assert.equal(app.calls[0].body.portfolio, undefined);
});

test('invalid email, missing note, unsafe portfolio links and the honeypot do not send', async () => {
  for (const bad of ['name', 'email', 'message', 'website', 'portfolio']) {
    const app = browser({search: '?role=warehouse-inspector'});
    app.fields[bad].value = ({name: '', email: 'bad-email', message: '', website: 'spam', portfolio: 'javascript:alert(1)'})[bad];
    await app.submit();
    assert.equal(app.calls.length, 0, bad);
    assert.equal(app.form.hidden, false);
    assert.equal(app.thanks.hidden, true);
  }
  const app = browser({search: '?role=unknown'});
  assert.equal(app.application.hidden, true);
  assert.equal(app.fields.position.value, '');
});

test('delivery failures keep the form and entered details available for retry', async () => {
  for (const fetchImpl of [
    async () => ({ok: false, status: 500, json: async () => ({success: true})}),
    async () => ({ok: true, json: async () => ({success: false})}),
    async () => ({ok: true, json: async () => { throw new Error('not JSON'); }}),
    async () => { throw new Error('network offline'); },
  ]) {
    const app = browser({fetchImpl, search: '?role=customer-support'});
    await app.submit();
    assert.equal(app.form.hidden, false);
    assert.equal(app.thanks.hidden, true);
    assert.equal(app.fields.position.value, 'customer-support');
    assert.equal(app.button.disabled, false);
    assert.equal(app.status.isError, true);
    assert.match(app.status.textContent, /try again, or email fabricationintelligence@gmail\.com/);
    assert.equal(app.events.length, 0);
  }
});

test('a pending submission cannot send twice and the email subject strips line breaks', async () => {
  let resolve;
  const response = new Promise(done => { resolve = done; });
  const app = browser({fetchImpl: () => response});
  app.fields.name.value = 'Test\r\nApplicant';
  const first = app.submit();
  assert.equal(app.button.disabled, true);
  await app.submit();
  assert.equal(app.calls.length, 1);
  assert.doesNotMatch(app.calls[0].body._subject, /[\r\n]/);
  resolve({ok: true, json: async () => ({success: 'true'})});
  await first;
  assert.equal(app.button.disabled, false);
});
