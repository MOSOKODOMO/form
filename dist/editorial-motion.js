/* Small, progressive motions. No scroll interception or continuous scroll handler. */
(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const key = 'fi-motion-preference';
  let preference = 'on';
  try { preference = sessionStorage.getItem(key) || 'on'; } catch (_) { /* Optional storage. */ }
  let observer;
  const seen = new WeakSet();
  const toggle = document.querySelector('[data-motion-toggle]');
  const allowed = () => !reduced.matches && preference !== 'off';
  const show = element => { element.classList.remove('reveal-pending'); element.classList.add('reveal-seen'); seen.add(element); observer?.unobserve(element); };

  function observe() {
    if (!allowed() || !observer) return;
    const selectors = '.home-collection .collection-heading, .materials-story > *, .home-steps-section .home-section-heading, .home-step, .home-founders .home-section-heading, .home-founders .team-card, .home-testimonials-box, .home-contact-copy, .home-contact .contact-block, .product-card, .store-section > h2, .store-grid > *, .about-team .bio-card';
    for (const element of document.querySelectorAll(selectors)) {
      if (seen.has(element) || element.classList.contains('reveal-pending')) continue;
      // Items already on screen remain immediately readable and clickable.
      if (element.getBoundingClientRect().top < window.innerHeight * .97) { show(element); continue; }
      const siblings = [...element.parentElement.children];
      const stagger = element.matches('.product-card,.home-step,.team-card') ? (siblings.indexOf(element) % 4) * 65 : 0;
      element.style.setProperty('--reveal-delay', `${stagger}ms`);
      observer.observe(element);
      element.classList.add('reveal-item', 'reveal-pending');
    }
  }
  function configure() {
    observer?.disconnect();
    document.querySelectorAll('.reveal-pending').forEach(show);
    const enabled = allowed();
    root.dataset.editorialMotion = enabled ? 'on' : 'off';
    if (enabled && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => { if (entry.isIntersecting) show(entry.target); });
      }, {threshold: .04, rootMargin: '0px 0px -16px 0px'});
      observe();
    }
    if (toggle) {
      toggle.disabled = reduced.matches;
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.textContent = reduced.matches ? 'Reduced motion' : enabled ? 'Motion on' : 'Motion off';
      toggle.setAttribute('aria-label', reduced.matches ? 'Reduced motion follows your device setting' : enabled ? 'Turn decorative motion off' : 'Turn decorative motion on');
    }
  }
  toggle?.addEventListener('click', () => {
    preference = preference === 'off' ? 'on' : 'off';
    try { sessionStorage.setItem(key, preference); } catch (_) { /* Optional storage. */ }
    configure();
  });
  reduced.addEventListener('change', configure);
  document.addEventListener('fi:collection-rendered', observe);
  document.addEventListener('focusin', event => {
    const element = event.target.closest?.('.reveal-pending');
    if (element) show(element);
  });
  window.addEventListener('pageshow', event => { if (event.persisted) configure(); });
  window.addEventListener('beforeprint', () => document.querySelectorAll('.reveal-pending').forEach(show));
  configure();
})();
