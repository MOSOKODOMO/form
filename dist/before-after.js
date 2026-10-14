'use strict';
// Before and after slider for the homepage. It shows the room pairs listed in data/room-pairs.json,
// each labelled "AI concept image". With no pairs listed, only the link to the room preview shows.
(() => {
  const IMAGE_PATH = /^assets\/[A-Za-z0-9._\-\/]+\.(?:webp|jpe?g|png)$/;
  const text = (value) => typeof value === 'string' && value.trim() !== '';
  const sitePath = (value) => IMAGE_PATH.test(value || '') && !value.includes('..') && !value.includes('//');

  function validPair(pair) {
    return Boolean(pair) && typeof pair === 'object' && text(pair.id) && text(pair.title)
      && sitePath(pair.before) && sitePath(pair.after)
      && text(pair.alt_before) && text(pair.alt_after);
  }

  if (typeof module === 'object' && module.exports) { module.exports = {validPair, IMAGE_PATH}; return; }

  const root = document.querySelector('[data-before-after]');
  if (!root) return;
  const tabs = root.querySelector('[data-ba-tabs]');
  const stage = root.querySelector('[data-ba-stage]');
  const caption = root.querySelector('[data-ba-caption]');

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function show(pair) {
    const frame = el('div', 'ba-frame');
    const after = el('img', 'ba-image ba-image--after');
    after.src = pair.after;
    after.alt = pair.alt_after;
    after.decoding = 'async';
    const before = el('img', 'ba-image ba-image--before');
    before.src = pair.before;
    before.alt = pair.alt_before;
    before.decoding = 'async';
    frame.style.setProperty('--ba', '50%');
    const slider = el('input', 'ba-range');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = '50';
    slider.setAttribute('aria-label', `Compare before and after: ${pair.title}`);
    slider.addEventListener('input', () => frame.style.setProperty('--ba', `${slider.value}%`));
    const divider = el('span', 'ba-divider');
    divider.setAttribute('aria-hidden', 'true');
    frame.append(after, before, divider, el('span', 'ba-tag ba-tag--before', 'Before'), el('span', 'ba-tag ba-tag--after', 'After'), slider);
    stage.replaceChildren(frame);
    caption.textContent = `${pair.title}. AI concept image, not a photo of a real room.`;
  }

  fetch('data/room-pairs.json', {cache: 'no-cache'})
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((list) => {
      const pairs = (Array.isArray(list) ? list : []).filter(validPair);
      if (!pairs.length) return;
      tabs.replaceChildren(...pairs.map((pair, index) => {
        const button = el('button', 'ba-tab', pair.title);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(index === 0));
        button.addEventListener('click', () => {
          tabs.querySelectorAll('.ba-tab').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
          show(pair);
        });
        return button;
      }));
      tabs.hidden = pairs.length < 2;
      show(pairs[0]);
      root.hidden = false;
    })
    .catch((error) => console.warn('Room pairs did not load:', error));
})();
