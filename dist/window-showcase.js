(() => {
  'use strict';

  const showcase = document.querySelector('[data-window-showcase]');
  if (!showcase || !window.matchMedia || !window.requestAnimationFrame) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const roomyViewport = window.matchMedia('(min-width: 901px) and (min-height: 640px)');
  const image = showcase.querySelector('.window-showcase__image');
  const steps = [...showcase.querySelectorAll('[data-window-step]')];
  const stage = showcase.querySelector('[data-window-stage]');
  const labels = ['01 / LOW-E GLASS', '02 / GLAZING BUILD-UP', '03 / READY TO COMPARE'];
  let enabled = false;
  let frame = 0;
  let previousStage = -1;
  let imageFailed = false;

  const clamp = (value) => Math.min(1, Math.max(0, value));
  const smooth = (value) => value * value * (3 - 2 * value);

  function render() {
    frame = 0;
    if (!enabled) return;

    const bounds = showcase.getBoundingClientRect();
    const travel = Math.max(1, bounds.height - window.innerHeight);
    const progress = clamp(-bounds.top / travel);
    const assembled = smooth(clamp((progress - 0.08) / 0.6));
    const spread = 1 - assembled;
    const imageReady = image && image.complete && image.naturalWidth > 0 && !imageFailed;
    const reveal = imageReady ? smooth(clamp((progress - 0.72) / 0.2)) : 0;

    showcase.style.setProperty('--glass-progress', progress.toFixed(4));
    showcase.style.setProperty('--glass-reveal', reveal.toFixed(4));
    showcase.style.setProperty('--glass-front-x', `${-90 * spread}px`);
    showcase.style.setProperty('--glass-front-y', `${35 * spread}px`);
    showcase.style.setProperty('--glass-back-x', `${84 * spread}px`);
    showcase.style.setProperty('--glass-back-y', `${-25 * spread}px`);
    showcase.style.setProperty('--glass-spacer-x', `${36 * spread}px`);
    showcase.style.setProperty('--glass-frame-x', `${105 * spread}px`);
    showcase.style.setProperty('--glass-frame-y', `${-40 * spread}px`);

    const currentStage = progress < 0.34 ? 0 : progress < 0.72 ? 1 : 2;
    if (currentStage !== previousStage) {
      steps.forEach((step, index) => step.classList.toggle('is-active', index === currentStage));
      if (stage) stage.textContent = labels[currentStage];
      previousStage = currentStage;
    }
  }

  function queueRender() {
    if (enabled && !frame) frame = window.requestAnimationFrame(render);
  }

  function configure() {
    enabled = roomyViewport.matches && !reducedMotion.matches;
    showcase.classList.toggle('is-scroll-ready', enabled);
    if (enabled) {
      queueRender();
    } else {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      previousStage = -1;
      steps.forEach((step) => step.classList.remove('is-active'));
      if (stage) stage.textContent = labels[2];
    }
  }

  function onImageError() {
    imageFailed = true;
    showcase.classList.add('has-image-error');
    queueRender();
  }

  if (image) {
    image.addEventListener('load', queueRender);
    image.addEventListener('error', onImageError);
    if (image.complete && image.naturalWidth === 0) onImageError();
  }

  window.addEventListener('scroll', queueRender, { passive: true });
  window.addEventListener('resize', configure, { passive: true });
  // Older browsers without media-query change events retain the fully readable static view.
  if (!reducedMotion.addEventListener || !roomyViewport.addEventListener) return;
  reducedMotion.addEventListener('change', configure);
  roomyViewport.addEventListener('change', configure);
  configure();
})();
