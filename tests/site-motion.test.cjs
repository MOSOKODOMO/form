const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8');
const script = read('site-motion.js');
const { clamp, pageProgress, activeSectionIndex, motionAllowed } = require('../dist/site-motion.js');

function setup({ editorial = true, reduced = false, desktop = true, stored = null, storageBlocked = false, intersection = true, brokenObserver = false, hash = '' } = {}) {
  let document;
  const makeNode = (tag = 'div', top = 0, height = 300) => {
    const names = new Set();
    const attributes = new Map();
    const values = new Map();
    const listeners = {};
    const node = {
      tagName: tag.toUpperCase(), dataset: {}, children: [], parent: null, id: '', textContent: '',
      bounds: { top, height, bottom: top + height }, attributes, values, listeners,
      classList: {
        add: (...items) => items.forEach((item) => names.add(item)),
        remove: (...items) => items.forEach((item) => names.delete(item)),
        contains: (name) => names.has(name),
        toggle(name, state) { const on = state === undefined ? !names.has(name) : state; on ? names.add(name) : names.delete(name); return on; },
      },
      style: { setProperty: (name, value) => values.set(name, value), removeProperty: (name) => values.delete(name) },
      append(...nodes) { nodes.forEach((child) => { child.parent = node; node.children.push(child); }); },
      remove() { if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node); },
      setAttribute(name, value) { attributes.set(name, value); },
      hasAttribute: (name) => attributes.has(name),
      addEventListener(name, handler, options) { listeners[name] = { handler, options }; },
      getBoundingClientRect: () => node.bounds,
      contains(target) { return node === target || node.children.some((child) => child.contains(target)); },
      closest() { let current = node; while (current) { if (current.excluded) return current; current = current.parent; } return null; },
      querySelector(selector) { return selector === 'h1, h2, h3' ? node.heading || null : node.hasForm ? { tagName: 'FORM' } : null; },
      focus(options) { document.activeElement = node; node.focusOptions = options; },
    };
    Object.defineProperty(node, 'className', { get: () => [...names].join(' '), set: (value) => { names.clear(); value.split(/\s+/).filter(Boolean).forEach((name) => names.add(name)); } });
    return node;
  };
  const root = makeNode('html');
  root.scrollHeight = 3600;
  const body = makeNode('body');
  body.dataset.motionPage = editorial ? 'editorial' : 'functional';
  const main = makeNode('main');
  main.id = 'main';
  body.append(main);
  root.append(body);
  const sections = [0, 1200, 2400].map((top, index) => {
    const node = makeNode('section', top, 1200);
    node.id = `chapter-${index + 1}`;
    node.dataset.motionSection = `Chapter ${index + 1}`;
    node.heading = makeNode('h2', top);
    node.append(node.heading);
    main.append(node);
    return node;
  });
  const near = makeNode('article', 100);
  const far = makeNode('article', 1450);
  const last = makeNode('article', 2650);
  sections[0].append(near);
  sections[1].append(far);
  sections[2].append(last);
  const focusTarget = makeNode('a', 1460);
  far.append(focusTarget);
  const formCard = makeNode('article', 1500);
  formCard.hasForm = true;
  const hiddenCard = makeNode('article', 1500);
  hiddenCard.excluded = true;
  const showcaseCard = makeNode('article', 1500);
  showcaseCard.excluded = true;
  const nested = makeNode('p', 1500);
  far.append(nested);
  const candidates = [near, far, last, formCard, hiddenCard, showcaseCard, nested];
  const journey = makeNode('li', 300);
  const depth = makeNode('figure', 100);
  main.querySelectorAll = (selector) => selector === '[data-motion-section][id]' ? sections : selector === '.journey-step' ? [journey] : selector === '[data-scroll-depth]' ? [depth] : candidates;
  const allNodes = (node = root) => [node, ...node.children.flatMap((child) => allNodes(child))];
  const docEvents = {};
  document = {
    documentElement: root, body, hidden: false, activeElement: body,
    querySelector: (selector) => selector === 'main' ? main : null,
    createElement: (tag) => makeNode(tag),
    getElementById: (id) => allNodes().find((node) => node.id === id) || null,
    addEventListener: (name, handler, options) => { docEvents[name] = { handler, options }; },
  };
  const events = {};
  const dispatched = [];
  const storedWrites = [];
  const media = [
    { matches: reduced, addEventListener(name, handler) { this.change = handler; } },
    { matches: desktop, addEventListener(name, handler) { this.change = handler; } },
  ];
  let pending;
  let io;
  const window = {
    innerHeight: 900, scrollY: 0, location: { hash },
    matchMedia: (query) => query.includes('reduced') ? media[0] : media[1],
    requestAnimationFrame(callback) { pending = callback; return 1; },
    cancelAnimationFrame() { pending = null; },
    addEventListener: (name, handler, options) => { events[name] = { handler, options }; },
    dispatchEvent: (event) => { dispatched.push(event); },
    sessionStorage: {
      getItem() { if (storageBlocked) throw new Error('Storage blocked'); return stored; },
      setItem(key, value) { if (storageBlocked) throw new Error('Storage blocked'); storedWrites.push([key, value]); },
    },
  };
  if (intersection) window.IntersectionObserver = class {
    constructor(callback, options) { if (brokenObserver) throw new Error('Observer unavailable'); this.callback = callback; this.options = options; this.observed = new Set(); io = this; }
    observe(node) { this.observed.add(node); }
    unobserve(node) { this.observed.delete(node); }
    disconnect() { this.observed.clear(); }
  };
  vm.runInNewContext(script, { window, document, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } });
  const flush = () => { const callback = pending; pending = null; if (callback) callback(); };
  flush();
  const find = (className) => allNodes().find((node) => node.classList.contains(className));
  const click = () => find('scroll-tools__toggle').listeners.click.handler();
  return { window, document, root, main, body, sections, near, far, last, focusTarget, formCard, hiddenCard, showcaseCard, nested, journey, depth, io, media, events, docEvents, dispatched, storedWrites, find, click, flush };
}

test('motion math is bounded and device reduced-motion always takes precedence', () => {
  assert.equal(clamp(-2), 0);
  assert.equal(clamp(2), 1);
  assert.equal(pageProgress(500, 2000, 1000), .5);
  assert.equal(pageProgress(-20, 2000, 1000), 0);
  assert.equal(pageProgress(4000, 2000, 1000), 1);
  assert.equal(pageProgress(100, 500, 900), 0);
  assert.equal(activeSectionIndex([10, 600, 1200], 900), 0);
  assert.equal(activeSectionIndex([-1200, -100, 1000], 900), 1);
  assert.equal(activeSectionIndex([-2400, -1200, 200], 900), 2);
  assert.equal(motionAllowed(false, 'on'), true);
  assert.equal(motionAllowed(false, 'off'), false);
  assert.equal(motionAllowed(true, 'on'), false);
});

test('every full page wires one deferred shared script and stylesheet with a declared page mode', () => {
  const functional = new Set(['auth.html', 'account.html', 'stage2.html', 'supplier-portal.html', 'feedback.html', 'contact.html']);
  for (const page of fs.readdirSync(path.join(__dirname, '../dist')).filter((file) => file.endsWith('.html') && file !== 'request.html')) {
    const html = read(page);
    assert.equal((html.match(/<script\b[^>]*src="site-motion\.js"[^>]*>/g) || []).length, 1, `${page} loads the shared script once`);
    assert.match(html, /<script\b(?=[^>]*src="site-motion\.js")(?=[^>]*\bdefer\b)[^>]*>/, `${page} defers enhancement until static content exists`);
    assert.equal((html.match(/<link\b[^>]*href="site-motion\.css"[^>]*>/g) || []).length, 1, `${page} loads the shared styles once`);
    assert.match(html, /<body\b[^>]*data-motion-page="(?:editorial|functional)"/, `${page} declares its mode`);
    if (functional.has(page)) assert.match(html, /<body\b[^>]*data-motion-page="functional"/, `${page} protects its working forms`);
  }
  assert.ok(read('index.html').indexOf('site-motion.js') < read('index.html').indexOf('window-showcase.js'), 'saved preference is applied before the glass assembly starts');
});

test('reveal enhancement affects only offscreen editorial content and runs once', () => {
  const env = setup();
  assert.equal(env.root.dataset.motion, 'on');
  assert.ok(env.near.classList.contains('motion-shown'));
  assert.equal(env.near.classList.contains('motion-pending'), false);
  assert.ok(env.far.classList.contains('motion-pending'));
  assert.ok(env.io.observed.has(env.far));
  for (const excluded of [env.formCard, env.hiddenCard, env.showcaseCard, env.nested]) assert.equal(excluded.classList.contains('motion-reveal'), false);
  env.io.callback([{ target: env.far, isIntersecting: true }]);
  assert.ok(env.far.classList.contains('motion-shown'));
  assert.equal(env.io.observed.has(env.far), false);
  env.events.pageshow.handler();
  assert.equal(env.far.classList.contains('motion-pending'), false, 'previously revealed content never hides again');
  assert.equal(env.events.scroll.options.passive, true);
  assert.equal(env.find('reading-progress').attributes.get('aria-hidden'), 'true');
});

test('missing IntersectionObserver and blocked storage leave content visible and controls usable', () => {
  const env = setup({ intersection: false, storageBlocked: true });
  assert.equal(env.root.dataset.motion, 'on');
  assert.equal(env.far.classList.contains('motion-pending'), false);
  env.click();
  assert.equal(env.root.dataset.motion, 'off');
  assert.equal(env.find('scroll-tools__toggle').textContent, 'Motion off');
  env.click();
  assert.equal(env.root.dataset.motion, 'on');
});

test('manual preference persists and notifies the assembly while clearing motion state', () => {
  const env = setup();
  assert.ok(env.depth.values.has('--scroll-depth'));
  assert.ok(env.journey.values.has('--journey-read'));
  env.click();
  assert.equal(env.root.dataset.motion, 'off');
  assert.equal(env.root.classList.contains('motion-enabled'), false);
  assert.equal(env.far.classList.contains('motion-pending'), false);
  assert.equal(env.depth.values.has('--scroll-depth'), false);
  assert.equal(env.journey.values.has('--journey-read'), false);
  assert.deepEqual(env.storedWrites, [['fi-motion-preference', 'off']]);
  assert.equal(env.dispatched.at(-1).type, 'fi:motion-change');
  assert.equal(env.dispatched.at(-1).detail.enabled, false);
  const stored = setup({ stored: 'off' });
  assert.equal(stored.root.dataset.motion, 'off');
  assert.equal(stored.far.classList.contains('motion-pending'), false);
});

test('reduced-motion changes disable motion regardless of manual preference', () => {
  const env = setup({ reduced: true });
  assert.equal(env.root.dataset.motion, 'off');
  assert.equal(env.find('scroll-tools__toggle').disabled, true);
  assert.equal(env.find('scroll-tools__toggle').textContent, 'Motion reduced');
  assert.equal(env.far.classList.contains('motion-pending'), false);
  env.media[0].matches = false;
  env.media[0].change();
  assert.equal(env.root.dataset.motion, 'on');
  assert.equal(env.find('scroll-tools__toggle').disabled, false);
  env.media[0].matches = true;
  env.media[0].change();
  assert.equal(env.root.dataset.motion, 'off');
  assert.equal(env.far.classList.contains('motion-pending'), false);
});

test('keyboard focus and deep links reveal content immediately without hiding it from assistive technology', () => {
  const env = setup();
  env.docEvents.focusin.handler({ target: env.focusTarget });
  assert.equal(env.far.classList.contains('motion-pending'), false);
  assert.equal(env.far.attributes.has('aria-hidden'), false);
  env.window.location.hash = '#chapter-3';
  env.events.hashchange.handler();
  assert.equal(env.last.classList.contains('motion-pending'), false);
  const linked = setup({ hash: '#chapter-2' });
  assert.equal(linked.far.classList.contains('motion-pending'), false, 'an initial deep link remains readable');
  assert.doesNotThrow(() => { env.window.location.hash = '#%broken'; env.events.hashchange.handler(); });
});

test('default body focus and broad structural targets do not prematurely reveal the full page', () => {
  const env = setup();
  assert.equal(env.document.activeElement, env.body);
  assert.ok(env.far.classList.contains('motion-pending'));
  for (const target of [env.body, env.root, env.main, env.sections[2]]) {
    env.docEvents.focusin.handler({ target });
    assert.ok(env.last.classList.contains('motion-pending'), 'focusing a container does not reveal every descendant');
  }
  env.window.location.hash = '#main';
  env.events.hashchange.handler();
  assert.ok(env.last.classList.contains('motion-pending'), 'back to top does not reveal all content');
});

test('chapter controls use real anchors and preserve focus while reading progress follows scroll', () => {
  const env = setup();
  const picker = env.find('scroll-chapters__select');
  assert.equal(picker.value, 'chapter-1');
  picker.value = 'chapter-2';
  picker.listeners.change.handler();
  assert.equal(env.window.location.hash, 'chapter-2');
  assert.equal(env.document.activeElement, env.sections[1].heading);
  assert.equal(env.sections[1].heading.attributes.get('tabindex'), '-1');
  assert.equal(env.sections[1].heading.focusOptions.preventScroll, true);
  assert.equal(env.far.classList.contains('motion-pending'), false);
  env.window.scrollY = 1350;
  env.sections.forEach((node, index) => { node.bounds.top = index * 1200 - 1350; });
  env.events.scroll.handler();
  env.flush();
  assert.equal(env.find('reading-progress').values.get('--reading-progress'), '0.5000');
  assert.equal(picker.value, 'chapter-2');
  assert.equal(env.find('scroll-tools__next').href, '#chapter-3');
});

test('functional pages add only progress and static controls without revealing or moving content', () => {
  const env = setup({ editorial: false });
  assert.equal(env.find('scroll-chapters__select'), undefined);
  assert.equal(env.io, undefined);
  assert.equal(env.far.classList.contains('motion-reveal'), false);
  assert.equal(env.depth.values.has('--scroll-depth'), false);
  assert.equal(env.journey.values.has('--journey-read'), false);
  assert.ok(env.find('reading-progress'));
  assert.ok(env.find('scroll-tools__toggle'));
  assert.match(read('site-motion.css'), /body\[data-motion-page="functional"\] \.scroll-tools\s*\{\s*position:\s*static/);
});

test('enhancement initialization errors fail open without leaving hidden content or dead controls', () => {
  const env = setup({ brokenObserver: true });
  assert.equal(env.root.dataset.motion, 'off');
  assert.equal(env.far.classList.contains('motion-pending'), false);
  assert.equal(env.find('scroll-tools'), undefined);
  assert.equal(env.find('reading-progress'), undefined);
  assert.equal(env.dispatched.at(-1).detail.enabled, false);
});

test('page restoration reconnects pending reveals and short screens avoid decorative depth', () => {
  const env = setup({ desktop: false });
  assert.equal(env.depth.values.get('--scroll-depth'), '0.00px');
  env.events.pagehide.handler();
  assert.equal(env.io.observed.size, 0);
  env.events.pageshow.handler();
  assert.ok(env.io.observed.has(env.far));
  assert.ok(env.far.classList.contains('motion-pending'));
  assert.ok(env.near.classList.contains('motion-shown'));
});

test('motion styles retain mobile, reduced-motion and print fallbacks without changing native input scrolling', () => {
  const css = read('site-motion.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media print/);
  assert.match(css, /@media \(max-width: 900px\), \(max-height: 639px\)/);
  assert.match(css, /\.motion-reveal:focus-within/);
  assert.doesNotMatch(script, /preventDefault\(|addEventListener\(['"](?:wheel|touchmove|keydown)['"]/);
  assert.doesNotMatch(css, /scroll-snap-type\s*:\s*[^;]*mandatory/);
});
