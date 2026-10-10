const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { imageOpacity } = require('../dist/home-immersive.js');
const source = fs.readFileSync(require.resolve('../dist/home-immersive.js'), 'utf8');

test('hero fades during its exit and reverses on upward scroll', () => {
  assert.equal(imageOpacity(-20, 800), 1);
  assert.equal(imageOpacity(288, 800), .5);
  assert.equal(imageOpacity(576, 800), 0);
  assert.equal(imageOpacity(800 * .85, 800), 0);
  assert.equal(imageOpacity(0, 800), 1);
});

test('device and manual motion settings restore a static visible hero, including changes after load', () => {
  const handlers = {};
  const properties = {};
  let top = -300;
  let render;
  const media = { matches: false, addEventListener: (_, cb) => { media.change = cb; } };
  const hero = {
    dataset: {}, style: { setProperty: (key, value) => { properties[key] = value; } },
    querySelector: () => ({ offsetHeight: 420 }),
    getBoundingClientRect: () => ({ top }),
  };
  const window = {
    innerHeight: 800, matchMedia: () => media,
    requestAnimationFrame: cb => { render = cb; return 1; },
    addEventListener: (event, cb) => { handlers[event] = cb; },
  };
  const document = {
    documentElement: { dataset: { motion: 'on' } },
    querySelector: selector => selector === '.immersive-hero' ? hero : { offsetHeight: 140 },
  };
  vm.runInNewContext(source, { window, document });
  render();
  assert.equal(hero.dataset.heroMotion, 'on');
  assert.ok(Number(properties['--hero-image-opacity']) < 1);
  handlers['fi:motion-change']({ detail: { enabled: false } }); render();
  assert.equal(hero.dataset.heroMotion, 'off');
  assert.equal(properties['--hero-image-opacity'], '1.0000');
  media.matches = true;
  handlers['fi:motion-change']({ detail: { enabled: true } }); render();
  assert.equal(hero.dataset.heroMotion, 'off');
  media.matches = false; media.change(); render();
  assert.equal(hero.dataset.heroMotion, 'on');
  top = 0; handlers.scroll(); render();
  assert.equal(properties['--hero-image-opacity'], '1.0000');
});
