const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8');
const script = read('window-showcase.js');
const classes = () => {
  const values = new Set();
  return {
    has: (name) => values.has(name),
    add: (name) => values.add(name),
    remove: (name) => values.delete(name),
    toggle: (name, on) => on ? values.add(name) : values.delete(name),
  };
};

function setup({ reduced = false, roomy = true, imageBroken = false, imageLoading = false } = {}) {
  const properties = new Map();
  const events = {};
  const imageEvents = {};
  const steps = Array.from({ length: 3 }, () => ({ classList: classes() }));
  const label = { textContent: '03 / READY TO COMPARE' };
  const image = { complete: !imageLoading, naturalWidth: imageBroken || imageLoading ? 0 : 1536, addEventListener: (name, handler) => { imageEvents[name] = handler; } };
  const media = [
    { matches: reduced, addEventListener(name, handler) { this.change = handler; } },
    { matches: roomy, addEventListener(name, handler) { this.change = handler; } },
  ];
  let pending;
  let bounds = { top: 0, height: 2115 };
  const section = {
    classList: classes(),
    style: { setProperty: (key, value) => properties.set(key, value) },
    querySelector: (selector) => selector.includes('image') ? image : label,
    querySelectorAll: () => steps,
    getBoundingClientRect: () => bounds,
  };
  const window = {
    innerHeight: 900,
    matchMedia: (query) => query.includes('reduced') ? media[0] : media[1],
    requestAnimationFrame: (callback) => { pending = callback; return 1; },
    cancelAnimationFrame: () => { pending = undefined; },
    addEventListener: (name, handler, options) => { events[name] = { handler, options }; },
  };
  vm.runInNewContext(script, { window, document: { querySelector: () => section } });
  const flush = () => { const callback = pending; pending = undefined; if (callback) callback(); };
  return { section, properties, events, image, imageEvents, media, steps, label, flush, scrollTo(top) { bounds = { ...bounds, top }; events.scroll.handler(); flush(); } };
}

test('glass showcase has complete static content and a qualified conceptual image', () => {
  const html = read('index.html');
  assert.match(html, /window-showcase\.css/);
  assert.match(html, /id="glass" class="window-showcase"/);
  assert.match(html, /src="window-showcase\.js" defer/);
  assert.equal((html.match(/<li data-window-step>/g) || []).length, 3);
  assert.match(html, /Concept visual only—not a supplier drawing, an exact product depiction or certified performance evidence/);
  assert.match(html, /src="assets\/window-low-e-marketing\.png"/);
  assert.match(html, /quality\. Then cost\./i);
  assert.match(read('window-showcase.css'), /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(script, /min-height: 640px/);
});

test('desktop enhancement assembles layers and reveals the loaded product without intercepting scrolling', () => {
  const env = setup();
  env.flush();
  assert.ok(env.section.classList.has('is-scroll-ready'));
  assert.equal(env.properties.get('--glass-reveal'), '0.0000');
  assert.equal(env.label.textContent, '01 / LOW-E GLASS');
  assert.equal(env.events.scroll.options.passive, true);
  env.scrollTo(-607.5);
  assert.equal(env.properties.get('--glass-progress'), '0.5000');
  assert.equal(env.properties.get('--glass-reveal'), '0.0000');
  assert.equal(env.label.textContent, '02 / GLAZING BUILD-UP');
  assert.ok(env.steps[1].classList.has('is-active'));
  env.scrollTo(-1215);
  assert.equal(env.properties.get('--glass-progress'), '1.0000');
  assert.equal(env.properties.get('--glass-reveal'), '1.0000');
  assert.equal(env.properties.get('--glass-front-x'), '0px');
  assert.equal(env.label.textContent, '03 / READY TO COMPARE');
});

test('reduced motion and small viewports retain static content, including preference changes', () => {
  for (const options of [{ reduced: true }, { roomy: false }]) {
    const env = setup(options);
    assert.equal(env.section.classList.has('is-scroll-ready'), false);
    assert.equal(env.label.textContent, '03 / READY TO COMPARE');
  }
  const env = setup();
  env.flush();
  env.media[0].matches = true;
  env.media[0].change();
  assert.equal(env.section.classList.has('is-scroll-ready'), false);
  assert.ok(env.steps.every((step) => !step.classList.has('is-active')));
});

test('missing images retain the assembled vector fallback', () => {
  const env = setup({ imageBroken: true });
  env.flush();
  env.scrollTo(-1215);
  assert.ok(env.section.classList.has('has-image-error'));
  assert.equal(env.properties.get('--glass-reveal'), '0.0000');
});

test('a late image load does not fade the fallback to blank', () => {
  const env = setup({ imageLoading: true });
  env.flush();
  env.scrollTo(-1215);
  assert.equal(env.properties.get('--glass-reveal'), '0.0000');
  assert.equal(env.section.classList.has('has-image-error'), false);
  env.image.complete = true;
  env.image.naturalWidth = 1536;
  env.imageEvents.load();
  env.flush();
  assert.equal(env.properties.get('--glass-reveal'), '1.0000');
});

test('a load error keeps the vector visible at the end of the sequence', () => {
  const env = setup({ imageLoading: true });
  env.flush();
  env.scrollTo(-1215);
  env.imageEvents.error();
  env.flush();
  assert.equal(env.properties.get('--glass-reveal'), '0.0000');
  assert.ok(env.section.classList.has('has-image-error'));
});
