const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const FI = require('../dist/catalogue.js');
const {createStore, MAX_ITEMS} = require('../dist/project-list.js');
const {validAbn, formatAbn} = require('../dist/trade.js');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'dist', name), 'utf8');
const memory = (initial = {}) => { const map = new Map(Object.entries(initial)); return {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), raw: map}; };

test('shop by room groups existing categories and ignores unknown rooms', () => {
  const list = [{category: 'handles'}, {category: 'knobs'}, {category: 'bathroom'}, {category: 'doors'}];
  assert.deepEqual(FI.filterByRoom(list, 'kitchen').map(p => p.category), ['handles', 'knobs']);
  assert.deepEqual(FI.filterByRoom(list, 'bathroom').map(p => p.category), ['bathroom']);
  assert.deepEqual(FI.filterByRoom(list, 'entry').map(p => p.category), ['doors']);
  assert.equal(FI.filterByRoom(list, 'garage').length, 4);
  assert.equal(FI.parseRoom('?room=kitchen'), 'kitchen');
  assert.equal(FI.parseRoom('?room=<script>'), 'all');
  assert.equal(FI.roomName('entry'), 'Entry and doors');
});

test('every room has live products and the shop page offers each room', () => {
  const products = JSON.parse(read('data/products.json'));
  const list = FI.listedProducts(Array.isArray(products) ? products : products.products).filter(p => !p.sample);
  for (const room of FI.ROOM_IDS) assert.ok(FI.filterByRoom(list, room).filter(FI.canBuyNow).length > 0, `${room} has buyable products`);
  const shop = read('shop.html');
  for (const room of FI.ROOM_IDS) assert.match(shop, new RegExp(`data-room="${room}"`));
  assert.match(read('shop.js'), /roomButtons/);
});

test('the project list stores clean entries, rejects bad handles, caps its size and survives corrupt storage', () => {
  const storage = memory();
  const store = createStore(storage);
  assert.equal(store.add('brass-handle-1'), true);
  assert.equal(store.add('brass-handle-1'), true);
  assert.equal(store.count(), 1, 'adding twice keeps one entry');
  for (const bad of ['', 'Has Space', '../x', '<img>', 'a'.repeat(201)]) assert.equal(store.add(bad), false, bad);
  store.update('brass-handle-1', {q: '7.9', o: '128 mm\nblack'});
  assert.deepEqual(store.items(), [{h: 'brass-handle-1', q: 7, o: '128 mm black'}]);
  store.update('brass-handle-1', {q: -4});
  assert.equal(store.items()[0].q, 1);
  store.update('brass-handle-1', {q: 99999});
  assert.equal(store.items()[0].q, 999);
  for (let i = 0; i < MAX_ITEMS + 5; i++) store.add(`item-${i}`);
  assert.equal(store.count(), MAX_ITEMS);
  store.remove('brass-handle-1');
  assert.equal(store.has('brass-handle-1'), false);
  store.clear();
  assert.equal(store.count(), 0);
  assert.deepEqual(createStore(memory({'fi.project.v1': '{not json'})).items(), []);
  assert.deepEqual(createStore(memory({'fi.project.v1': JSON.stringify([{h: '<x>'}, {h: 'ok-one', q: 'abc'}, {h: 'ok-one'}, null])})).items(), [{h: 'ok-one', q: 1, o: ''}]);
  let heard = 0;
  const live = createStore(memory());
  live.onChange(() => heard++);
  live.add('one'); live.remove('one');
  assert.equal(heard, 2);
});

test('ABN check digits follow the official algorithm', () => {
  assert.equal(validAbn('51 824 753 556'), true, 'ATO published example');
  assert.equal(validAbn('51824753556'), true);
  assert.equal(validAbn('51-824-753-556'), true);
  assert.equal(validAbn('51 824 753 557'), false);
  assert.equal(validAbn('1234567890'), false);
  assert.equal(validAbn('123456789012'), false);
  assert.equal(validAbn('abcdefghijk'), false);
  assert.equal(validAbn(''), false);
  assert.equal(validAbn(null), false);
  assert.equal(formatAbn('51824753556'), '51 824 753 556');
});

test('project list and trade pages use the same private enquiry route and never auto-send', () => {
  const send = read('send-enquiry.js');
  assert.match(send, /fi-enquiry/);
  assert.match(send, /submission_key/);
  assert.match(send, /relationship: 'buyer'/);
  for (const page of ['project.html', 'trade.html']) {
    const html = read(page);
    assert.match(html, /name="website" tabindex="-1" autocomplete="off"/, `${page} honeypot`);
    assert.match(html, /role="status" aria-live="polite"/, page);
    assert.match(html, /send-enquiry\.js/, page);
    assert.doesNotMatch(html, /—/, page);
  }
  assert.doesNotMatch(read('project.js') + read('trade.js') + read('project-list.js'), /innerHTML|eval\(/);
  assert.match(read('project.js'), /addEventListener\('submit'/);
  assert.match(read('trade.js'), /validAbn\(value\('abn'\)\)/);
});

test('send-enquiry saves privately, then notifies, and reports a failed save', async () => {
  global.window = undefined;
  const {sendEnquiry} = require('../dist/send-enquiry.js');
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, init) => {
    calls.push({url, body: JSON.parse(init.body)});
    return url.includes('fi-enquiry') ? {ok: true, json: async () => ({saved: true})} : {ok: true, json: async () => ({success: 'true'})};
  };
  try {
    const result = await sendEnquiry({kind: 'Project list', subject: 'Hello\nworld', name: 'Pat', email: 'pat@example.test', product: 'Project list: 2', message: 'PROJECT LIST'});
    assert.deepEqual(result, {saved: true, notified: true});
    assert.match(calls[0].url, /fi-enquiry/);
    assert.equal(calls[0].body.relationship, 'buyer');
    assert.match(calls[0].body.submission_key, /^[0-9a-f-]{36}$/);
    assert.equal(calls[1].body._subject, 'Hello world');
    await sendEnquiry({kind: 'Project list', subject: 's', name: 'Pat', email: 'pat@example.test', product: 'Project list: 2', message: 'PROJECT LIST'});
    assert.equal(calls[2].body.submission_key, calls[0].body.submission_key, 'an unchanged resend keeps its key');
    await assert.rejects(() => sendEnquiry({kind: 'x', subject: 's', name: '', email: 'bad', message: ''}), /valid email/);
    global.fetch = async url => (url.includes('fi-enquiry') ? {ok: false, json: async () => ({error: 'Too many enquiries.'})} : assert.fail('notified without saving'));
    await assert.rejects(() => sendEnquiry({kind: 'x', subject: 's', name: 'Pat', email: 'pat@example.test', message: 'm2'}), /Too many enquiries/);
    global.fetch = async url => (url.includes('fi-enquiry') ? {ok: true, json: async () => ({saved: true})} : {ok: false, json: async () => ({})});
    assert.deepEqual(await sendEnquiry({kind: 'x', subject: 's', name: 'Pat', email: 'pat@example.test', message: 'm3'}), {saved: true, notified: false});
  } finally { global.fetch = original; }
});
