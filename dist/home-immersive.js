/* Native scrolling: only the background opacity follows scroll position. */
(() => {
  'use strict';
  const imageOpacity = (distance, sceneHeight) => 1 - Math.min(1, Math.max(0, distance / Math.max(1, sceneHeight * .72)));
  if (typeof module === 'object' && module.exports) module.exports = { imageOpacity };
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const hero = document.querySelector('.immersive-hero');
  if (!hero || !window.matchMedia || !window.requestAnimationFrame) return;
  const copy = hero.querySelector('.home-hero-copy');
  const header = document.querySelector('.site-header');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let sceneHeight = window.innerHeight;
  let frame = 0;
  let allowed = document.documentElement.dataset.motion !== 'off';
  const enabled = () => allowed && !reduced.matches;

  function render() {
    frame = 0;
    const opacity = enabled() ? imageOpacity(-hero.getBoundingClientRect().top, sceneHeight) : 1;
    hero.style.setProperty('--hero-image-opacity', opacity.toFixed(4));
  }
  function queueRender() { if (!frame) frame = window.requestAnimationFrame(render); }
  function measure() {
    const top = header.offsetHeight + Math.max(32, Math.min(72, window.innerHeight * .065));
    sceneHeight = Math.max(window.innerHeight, top + copy.offsetHeight + 58);
    hero.style.setProperty('--hero-header-size', `${header.offsetHeight}px`);
    hero.style.setProperty('--hero-copy-top', `${top}px`);
    hero.style.setProperty('--hero-scene-size', `${sceneHeight}px`);
    queueRender();
  }
  function configure() {
    hero.dataset.heroMotion = enabled() ? 'on' : 'off';
    measure();
  }
  window.addEventListener('scroll', queueRender, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('pageshow', configure);
  window.addEventListener('fi:motion-change', (event) => { allowed = event.detail.enabled; configure(); });
  if (reduced.addEventListener) reduced.addEventListener('change', configure);
  if ('ResizeObserver' in window) {
    const observer = new window.ResizeObserver(measure);
    observer.observe(header);
    observer.observe(copy);
  }
  configure();
})();
