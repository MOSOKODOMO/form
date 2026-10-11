/* Progressive enhancement only: navigation stays available without JavaScript. */
(() => {
  'use strict';
  const header = document.querySelector('.site-header--public');
  if (!header) return;
  const toggle = header.querySelector('.menu-toggle');
  const navigation = header.querySelector('.site-nav');
  const more = header.querySelector('.nav-more');
  if (toggle && navigation) {
    header.classList.add('nav-ready');
    function closeMenu(returnFocus = false) {
      toggle.setAttribute('aria-expanded', 'false');
      header.classList.remove('menu-open');
      if (returnFocus) toggle.focus();
    }
    toggle.addEventListener('click', () => {
      const opening = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(opening));
      header.classList.toggle('menu-open', opening);
    });
    navigation.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (more && more.open) { more.open = false; more.querySelector('summary').focus(); }
      if (header.classList.contains('menu-open')) closeMenu(true);
    });
    const desktop = window.matchMedia('(min-width: 901px)');
    desktop.addEventListener('change', () => closeMenu());
  }
  document.addEventListener('click', (event) => { if (more && more.open && !more.contains(event.target)) more.open = false; });
})();
