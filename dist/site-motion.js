/* Progressive scroll enhancement. Native scrolling and static content remain the baseline. */
(() => {
  'use strict';

  const clamp = (value) => Math.min(1, Math.max(0, value));
  const pageProgress = (scroll, height, viewport) => height <= viewport ? 0 : clamp(scroll / (height - viewport));
  const activeSectionIndex = (tops, viewport) => {
    let index = 0;
    tops.forEach((top, i) => { if (top <= viewport * .36) index = i; });
    return index;
  };
  const motionAllowed = (reduced, preference) => !reduced && preference !== 'off';
  if (typeof module === 'object' && module.exports) module.exports = { clamp, pageProgress, activeSectionIndex, motionAllowed };
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const root = document.documentElement;
  const main = document.querySelector('main');
  if (!main || !window.matchMedia || !window.requestAnimationFrame || root.dataset.motionReady) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = window.matchMedia('(min-width: 901px) and (min-height: 640px)');
  const editorial = document.body.dataset.motionPage === 'editorial';
  const storageKey = 'fi-motion-preference';
  const sections = editorial ? [...main.querySelectorAll('[data-motion-section][id]')] : [];
  const journeys = editorial ? [...main.querySelectorAll('.journey-step')] : [];
  const depth = editorial ? [...main.querySelectorAll('[data-scroll-depth]')] : [];
  const seen = new WeakSet();
  let preference = 'on';
  let enabled = false;
  let frame = 0;
  let observer;
  let resizeObserver;
  let active = -1;
  let candidates = [];
  let progress;
  let controls;
  let toggle;
  let picker;
  let count;
  let next;

  try { preference = window.sessionStorage.getItem(storageKey) === 'off' ? 'off' : 'on'; } catch (_) { /* Storage is optional. */ }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function show(node) {
    node.classList.remove('motion-pending');
    node.classList.add('motion-shown');
    seen.add(node);
    if (observer) observer.unobserve(node);
  }

  function revealTarget(target, includeDescendants = false) {
    if (!target || !target.closest || target === document.body || target === root || target === main) return;
    candidates.forEach((node) => { if (node.contains(target) || (includeDescendants && target.contains(node))) show(node); });
  }

  function revealHash() {
    let id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch (_) { return; }
    if (id) revealTarget(document.getElementById(id), true);
  }

  function updateSelection(index) {
    if (index === active || !sections.length) return;
    active = index;
    sections.forEach((section, i) => section.classList.toggle('motion-current-section', i === index));
    if (picker && document.activeElement !== picker) picker.value = sections[index].id;
    if (count) count.textContent = `${String(index + 1).padStart(2, '0')} / ${String(sections.length).padStart(2, '0')}`;
    if (next) {
      const target = sections[index + 1];
      next.href = `#${target ? target.id : main.id}`;
      next.textContent = target ? '↓' : '↑';
      next.setAttribute('aria-label', target ? `Next section: ${target.dataset.motionSection}` : 'Back to top');
    }
  }

  function render() {
    frame = 0;
    const viewport = window.innerHeight;
    const scroll = window.scrollY || 0;
    const amount = pageProgress(scroll, root.scrollHeight, viewport);
    if (progress) progress.style.setProperty('--reading-progress', amount.toFixed(4));
    root.classList.toggle('has-scrolled', scroll > 60);
    if (sections.length) updateSelection(activeSectionIndex(sections.map((node) => node.getBoundingClientRect().top), viewport));
    if (!enabled) return;
    journeys.forEach((step) => {
      const bounds = step.getBoundingClientRect();
      const reading = clamp((viewport * .8 - bounds.top) / Math.max(1, bounds.height + viewport * .15));
      step.style.setProperty('--journey-read', reading.toFixed(4));
      step.classList.toggle('motion-reading', bounds.top < viewport * .8 && bounds.bottom > viewport * .2);
    });
    depth.forEach((node) => {
      const bounds = node.getBoundingClientRect();
      const shift = desktop.matches ? (clamp((viewport - bounds.top) / (viewport + bounds.height)) - .5) * 24 : 0;
      node.style.setProperty('--scroll-depth', `${shift.toFixed(2)}px`);
    });
  }

  function queueRender() {
    if (!frame && !document.hidden) frame = window.requestAnimationFrame(render);
  }

  function configure() {
    enabled = motionAllowed(reduced.matches, preference);
    root.dataset.motion = enabled ? 'on' : 'off';
    root.classList.toggle('motion-enabled', enabled);
    if (toggle) {
      toggle.textContent = reduced.matches ? 'Motion reduced' : enabled ? 'Motion on' : 'Motion off';
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.setAttribute('aria-label', reduced.matches ? 'Motion reduced by your device setting' : enabled ? 'Turn motion off' : 'Turn motion on');
      toggle.disabled = reduced.matches;
    }
    if (observer) observer.disconnect();
    candidates.forEach((node) => node.classList.remove('motion-pending'));
    if (enabled && observer) {
      candidates.forEach((node, index) => {
        const bounds = node.getBoundingClientRect();
        if (seen.has(node) || bounds.top < window.innerHeight * .96) { show(node); return; }
        node.style.setProperty('--reveal-delay', `${(index % 3) * 55}ms`);
        node.classList.add('motion-pending');
        observer.observe(node);
      });
      revealTarget(document.activeElement);
      revealHash();
    }
    if (!enabled) {
      journeys.forEach((step) => { step.classList.remove('motion-reading'); step.style.removeProperty('--journey-read'); });
      depth.forEach((node) => node.style.removeProperty('--scroll-depth'));
    }
    // The existing assembly listens too, so this is a site-wide motion preference.
    window.dispatchEvent(new CustomEvent('fi:motion-change', { detail: { enabled } }));
    queueRender();
  }

  function makeControls() {
    if (!main.id) main.id = 'main-content';
    progress = element('div', 'reading-progress');
    progress.setAttribute('aria-hidden', 'true');
    progress.append(element('span', 'reading-progress__fill'));
    document.body.append(progress);
    controls = element('div', 'scroll-tools');
    controls.setAttribute('role', 'region');
    controls.setAttribute('aria-label', 'Page navigation and motion');
    if (sections.length > 1) {
      const chapters = element('div', 'scroll-chapters');
      count = element('span', 'scroll-chapters__count');
      count.setAttribute('aria-hidden', 'true');
      picker = element('select', 'scroll-chapters__select');
      picker.setAttribute('aria-label', 'Jump to a page section');
      sections.forEach((section) => {
        const option = element('option', '', section.dataset.motionSection);
        option.value = section.id;
        picker.append(option);
      });
      picker.addEventListener('change', () => {
        const target = sections.find((section) => section.id === picker.value);
        if (!target) return;
        revealTarget(target, true);
        window.location.hash = target.id;
        const heading = target.querySelector('h1, h2, h3') || target;
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
        queueRender();
      });
      next = element('a', 'scroll-tools__next', '↓');
      chapters.append(count, picker, next);
      controls.append(chapters);
    }
    toggle = element('button', 'scroll-tools__toggle');
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      preference = enabled ? 'off' : 'on';
      try { window.sessionStorage.setItem(storageKey, preference); } catch (_) { /* Keep working without persistence. */ }
      configure();
    });
    const top = element('a', 'scroll-tools__top', '↑');
    top.href = `#${main.id}`;
    top.setAttribute('aria-label', 'Back to top');
    controls.append(toggle, top);
    document.body.append(controls);
    root.dataset.motionReady = 'true';
  }

  try {
    makeControls();
    if (editorial) {
      const selectors = [
        '.hero-copy > *', '.page-hero > *', '.window-home-product',
        '.glass-guide__hero > *', '.section-heading', '.glass-education-heading',
        '.home-glass-categories > a', '.home-glass-group-heading', '.home-glass-card', '.home-glass-help',
        '.glass-guide__section-heading', '.glass-guide__group-nav > a', '.glass-guide__group-heading',
        '.glass-type', '.glass-guide__decision > *', '.glass-guide__next > *',
        '.quote-card', '.comparison-verification', '.journey-heading', '.journey-step', '.journey-note',
        '.promise-copy', '.scope-list', '.cta-band > *', '.team-section > div:first-child', '.team-card',
        '.content-section > h2', '.content-section > .eyebrow', '.two-column > *', '.info-card',
        '.bio-card', '.about-purpose-list > div', '.content-lead', '.contact-card', '.price-table'
      ];
      candidates = [...main.querySelectorAll(selectors.join(','))].filter((node, index, list) =>
        !node.closest('[data-window-showcase], form, [hidden], [role="status"], [data-motion-exclude]') &&
        !node.querySelector('form, input, textarea, select, [role="status"]') &&
        !list.some((other) => other !== node && other.contains(node))
      );
      candidates.forEach((node) => node.classList.add('motion-reveal'));
      if ('IntersectionObserver' in window) {
        observer = new window.IntersectionObserver((entries) => {
          entries.forEach((entry) => { if (entry.isIntersecting) show(entry.target); });
        }, { threshold: 0, rootMargin: '0px 0px 32px 0px' });
      }
    }
    document.addEventListener('focusin', (event) => revealTarget(event.target));
    window.addEventListener('hashchange', () => { revealHash(); queueRender(); });
    window.addEventListener('scroll', queueRender, { passive: true });
    window.addEventListener('resize', queueRender, { passive: true });
    window.addEventListener('load', queueRender, { once: true });
    window.addEventListener('pageshow', configure);
    document.addEventListener('visibilitychange', queueRender);
    window.addEventListener('pagehide', () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (observer) observer.disconnect();
    });
    if (reduced.addEventListener) reduced.addEventListener('change', configure);
    if (desktop.addEventListener) desktop.addEventListener('change', configure);
    if ('ResizeObserver' in window) {
      resizeObserver = new window.ResizeObserver(queueRender);
      resizeObserver.observe(main);
    }
    configure();
  } catch (_) {
    // Any unsupported enhancement fails open: every word and control stays usable.
    if (observer) observer.disconnect();
    if (resizeObserver) resizeObserver.disconnect();
    candidates.forEach((node) => node.classList.remove('motion-pending'));
    root.dataset.motion = 'off';
    delete root.dataset.motionReady;
    root.classList.remove('motion-enabled');
    if (controls) controls.remove();
    if (progress) progress.remove();
    window.dispatchEvent(new CustomEvent('fi:motion-change', { detail: { enabled: false } }));
  }
})();
