'use strict';
// Cards remain ordinary catalogue links if JavaScript is unavailable.
document.querySelectorAll('[data-collection-carousel]').forEach(root => {
  const cards = [...root.querySelectorAll('[data-collection-card]')];
  const stage = root.querySelector('.collection-carousel__stage');
  const name = root.querySelector('.collection-carousel__name');
  const count = root.querySelector('[data-collection-count]');
  const explore = root.querySelector('[data-collection-explore]');
  if (cards.length < 3 || !stage || !name || !count || !explore) return;
  const currentCollection = () => new URLSearchParams(window.location.search).get('collection');
  let selected = Math.max(0, cards.findIndex(card => card.dataset.collectionId === currentCollection()));
  let start = null;
  let suppressClickUntil = 0;

  function choose(index, focusCard = false) {
    selected = (index + cards.length) % cards.length;
    cards.forEach((card, i) => {
      const offset = (i - selected + cards.length) % cards.length;
      const position = offset === 0 ? 'center' : offset === 1 ? 'right' : offset === cards.length - 1 ? 'left' : offset === 2 ? 'far-right' : offset === cards.length - 2 ? 'far-left' : 'hidden';
      card.dataset.position = position;
      card.setAttribute('aria-hidden', String(position === 'hidden'));
      card.setAttribute('aria-label', `${i === selected ? 'Browse' : 'Preview'} ${card.dataset.collectionName}`);
    });
    name.textContent = cards[selected].dataset.collectionName;
    count.textContent = `${String(selected + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
    explore.href = cards[selected].href;
    explore.setAttribute('aria-label', `Explore ${cards[selected].dataset.collectionName}`);
    if (focusCard) cards[selected].focus({preventScroll: true});
  }

  cards.forEach((card, i) => {
    card.addEventListener('dragstart', event => event.preventDefault());
    card.addEventListener('click', event => {
      // Modified clicks retain standard open-in-new-tab behaviour.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (Date.now() < suppressClickUntil) { event.preventDefault(); return; }
      if (i !== selected) { event.preventDefault(); choose(i); }
    });
  });
  root.querySelectorAll('[data-collection-step]').forEach(button => {
    button.addEventListener('click', () => choose(selected + Number(button.dataset.collectionStep)));
  });
  root.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : selected + (event.key === 'ArrowRight' ? 1 : -1);
    choose(next, cards.includes(document.activeElement));
  });
  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    start = {x: event.clientX, y: event.clientY, id: event.pointerId};
  });
  stage.addEventListener('pointerup', event => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      suppressClickUntil = Date.now() + 400;
      choose(selected + (dx < 0 ? 1 : -1));
    }
  });
  stage.addEventListener('pointercancel', () => { start = null; });
  stage.addEventListener('pointerleave', () => { start = null; });
  window.addEventListener('popstate', () => choose(Math.max(0, cards.findIndex(card => card.dataset.collectionId === currentCollection()))));
  choose(selected);
  root.classList.add('is-ready');
});
