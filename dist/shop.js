'use strict';
// Local catalogue discovery. No searches or filters are sent to a third party.
(() => {
  const FI = window.FICatalogue;
  const grid = document.querySelector('#product-grid');
  const status = document.querySelector('#shop-status');
  const sampleBanner = document.querySelector('#sample-banner');
  const search = document.querySelector('#shop-search');
  const sort = document.querySelector('#shop-sort');
  const reset = document.querySelector('#shop-reset');
  const filters = [...document.querySelectorAll('.shop-filter[data-category]')];
  const finishButtons = [...document.querySelectorAll('.shop-filter[data-finish]')];
  const roomButtons = [...document.querySelectorAll('.shop-filter[data-room]')];
  const allowedSorts = ['featured', 'name', 'price-asc', 'price-desc'];
  let products = [];
  let ready = false;
  let state = readState();

  function readState() {
    const params = new URLSearchParams(window.location.search);
    return {category: FI.parseCategory(window.location.search), finish: FI.parseFinish(window.location.search), room: FI.parseRoom(window.location.search), query: (params.get('q') || '').slice(0,160), sort: allowedSorts.includes(params.get('sort')) ? params.get('sort') : 'featured'};
  }
  const clean = text => String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function matching(list, query) {
    const words = clean(query).trim().split(/\s+/).filter(Boolean);
    return list.filter(p => {
      const text = clean([p.product, p.maker, p.material, p.country, FI.categoryName(p.category), ...p.finishes, ...p.sizes].join(' '));
      return words.every(word => text.includes(word));
    });
  }
  function sorted(list) {
    if (state.sort === 'name') return [...list].sort((a,b) => a.product.localeCompare(b.product));
    if (state.sort.startsWith('price-')) return [...list].sort((a,b) => {
      const ap = typeof a.price_aud === 'number' ? a.price_aud : null;
      const bp = typeof b.price_aud === 'number' ? b.price_aud : null;
      if (ap === null && bp === null) return a.product.localeCompare(b.product);
      if (ap === null) return 1;
      if (bp === null) return -1;
      return state.sort === 'price-asc' ? ap-bp : bp-ap;
    });
    return FI.sortProducts(list);
  }
  function empty() {
    const item = document.createElement('li');
    item.className = 'shop-empty';
    const title = document.createElement('h2');
    title.textContent = state.query ? 'No matching pieces yet.' : 'More pieces are on their way.';
    const detail = document.createElement('p');
    detail.textContent = state.query ? 'Try another material, maker or product name, or clear your filters.' : `We are still researching products for ${FI.categoryName(state.category).toLowerCase()}. Tell us what you are looking for.`;
    const link = document.createElement('a');
    link.href = 'contact.html'; link.className = 'text-link'; link.textContent = 'Ask us to source it ↗';
    item.append(title,detail,link);
    return item;
  }
  function render() {
    search.value = state.query;
    sort.value = state.sort;
    if (!ready) return;
    const matches = matching(products,state.query);
    const inRoom = FI.filterByRoom(matches,state.room);
    const counts = FI.categoryCounts(FI.filterByFinish(inRoom,state.finish));
    const inCategory = FI.filterByCategory(inRoom,state.category);
    for (const button of roomButtons) {
      button.setAttribute('aria-pressed',String(button.dataset.room === state.room));
      button.querySelector('.shop-filter-count').textContent = FI.filterByRoom(FI.filterByFinish(matches,state.finish),button.dataset.room).length;
    }
    for (const button of finishButtons) {
      button.setAttribute('aria-pressed',String(button.dataset.finish === state.finish));
      button.querySelector('.shop-filter-count').textContent = FI.filterByFinish(inCategory,button.dataset.finish).length;
    }
    for (const button of filters) {
      button.setAttribute('aria-pressed', String(button.dataset.category === state.category));
      button.querySelector('.shop-filter-count').textContent = counts[button.dataset.category];
      button.hidden = button.dataset.category !== 'all' && button.dataset.category !== state.category && counts[button.dataset.category] === 0;
    }
    const list = sorted(FI.filterByFinish(inCategory,state.finish));
    grid.replaceChildren(...(list.length ? list.map(window.FIProductCard.card) : [empty()]));
    document.dispatchEvent(new Event('fi:collection-rendered'));
    sampleBanner.hidden = !list.some(p => p.sample);
    const parts = [state.room === 'all' ? '' : FI.roomName(state.room),state.category === 'all' ? '' : FI.categoryName(state.category),state.finish === 'all' ? '' : FI.finishName(state.finish)].filter(Boolean);
    const where = parts.length ? ` in ${parts.join(', ')}` : '';
    const query = state.query ? ` matching “${state.query}”` : '';
    status.textContent = `${list.length} product${list.length === 1 ? '' : 's'}${where}${query}`;
    if (state.sort.startsWith('price-')) status.textContent += '. Listed prices may cover different pack sizes; compare units on each product.';
    reset.hidden = state.category === 'all' && state.finish === 'all' && state.room === 'all' && !state.query && state.sort === 'featured';
  }
  function updateUrl(replace = false) {
    const url = new URL(window.location.href);
    for (const [key, value, fallback] of [['category',state.category,'all'],['finish',state.finish,'all'],['room',state.room,'all'],['q',state.query,''],['sort',state.sort,'featured']]) {
      if (value === fallback) url.searchParams.delete(key); else url.searchParams.set(key,value);
    }
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
    render();
  }
  for (const button of filters) button.addEventListener('click', () => { state.category = button.dataset.category; state.room = 'all'; updateUrl(); });
  for (const button of finishButtons) button.addEventListener('click', () => { state.finish = button.dataset.finish; updateUrl(); });
  for (const button of roomButtons) button.addEventListener('click', () => { state.room = button.dataset.room; state.category = 'all'; updateUrl(); });
  search.addEventListener('input', () => { state.query = search.value.slice(0,160); updateUrl(true); });
  sort.addEventListener('change', () => { state.sort = sort.value; updateUrl(); });
  reset.addEventListener('click', () => { state = {category:'all',finish:'all',room:'all',query:'',sort:'featured'}; updateUrl(); search.focus(); });
  window.addEventListener('popstate', () => { state = readState(); render(); });
  render();
  if (window.location.hash === '#shop-search') search.focus();
  FI.loadProducts().then(list => {
    products = FI.listedProducts(list); ready = true;
    grid.removeAttribute('aria-busy'); render();
  }).catch(error => {
    console.error(error);
    grid.removeAttribute('aria-busy');
    status.textContent = 'The collection could not load. Refresh this page or contact our team.';
    const item = empty();
    item.querySelector('h2').textContent = 'We could not load the collection.';
    item.querySelector('p').textContent = 'Please refresh the page. If it happens again, we can help you find a product.';
    grid.replaceChildren(item);
  });
})();
