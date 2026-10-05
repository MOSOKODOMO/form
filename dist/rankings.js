'use strict';
// Rankings: live products (or their makers) by FI Score, from data/products.json only. The view and category are kept in the URL.
(() => {
  const FI = window.FICatalogue;
  const list = document.querySelector('#ranking-list');
  const status = document.querySelector('#rankings-status');
  const sort = document.querySelector('#rankings-sort');
  const example = document.querySelector('#ranking-example');
  const exampleList = document.querySelector('#example-list');
  const filters = [...document.querySelectorAll('.shop-filter[data-category]')];
  const views = [...document.querySelectorAll('.shop-filter[data-view]')];
  let live = [];
  let samples = [];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function scoreBadge(score, label) {
    const badge = el('span', `fi-score fi-score--${FI.scoreBand(score)} rank-score`);
    badge.style.setProperty('--score', score);
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', label);
    badge.append(el('span', 'fi-score-label', 'FI'), el('b', '', String(score)));
    return badge;
  }

  // One bar in four zones sized 40, 30, 15 and 15, each filled by the points earned. The numbers are in the list below it.
  function breakdown(parts) {
    const wrap = el('div', 'score-breakdown');
    const bar = el('div', 'score-bar');
    bar.setAttribute('aria-hidden', 'true');
    const rows = el('dl', 'score-parts');
    for (const part of parts) {
      const zone = el('span', `score-zone score-zone--${part.key}`);
      zone.style.flexGrow = String(part.max);
      const fill = el('span', 'score-fill');
      fill.style.width = `${part.points === null ? 0 : Math.round((part.points / part.max) * 100)}%`;
      zone.append(fill);
      bar.append(zone);
      const row = el('div', `score-part score-part--${part.key}`);
      row.append(el('dt', '', part.label), el('dd', '', part.points === null ? 'not recorded' : `${part.points} / ${part.max}`));
      rows.append(row);
    }
    wrap.append(bar, rows);
    return wrap;
  }

  function chips(items, label) {
    const group = el('ul', 'cert-chips');
    group.setAttribute('aria-label', label);
    for (const chip of items) group.append(el('li', `cert-chip cert-chip--${chip.state.replace(' ', '-')}`, `${chip.name}: ${chip.label}`));
    return group;
  }

  function meta(parts, sample) {
    const line = el('p', 'rank-meta');
    for (const part of parts) line.append(el('span', '', part));
    if (sample) line.append(el('span', 'rank-sample', 'SAMPLE'));
    return line;
  }

  function productItem(product, index) {
    const item = el('li', 'rank-item');
    const place = el('span', 'rank-number', String(index + 1));
    place.setAttribute('aria-hidden', 'true');
    const body = el('div', 'rank-body');
    const title = el('h2', 'rank-title');
    const link = el('a', '', product.product);
    link.href = FI.productUrl(product);
    title.append(link);
    body.append(meta([FI.categoryName(product.category), product.country], product.sample), title, el('p', 'rank-maker', `by ${product.maker}`),
      breakdown(FI.scoreBreakdown(product)), chips(FI.certificateChips(product), `Checks for ${product.product}`),
      el('p', 'rank-notes', FI.scoreNotes(product).join(' ')));
    item.append(place, body, scoreBadge(product.fi_score, `FI Score ${product.fi_score} out of 100`));
    return item;
  }

  function makerItem(group, index) {
    const item = el('li', 'rank-item rank-item--maker');
    const place = el('span', 'rank-number', String(index + 1));
    place.setAttribute('aria-hidden', 'true');
    const body = el('div', 'rank-body');
    const title = el('h2', 'rank-title');
    title.textContent = group.maker;
    const count = `${group.products.length} product${group.products.length === 1 ? '' : 's'}`;
    const products = el('p', 'rank-products');
    products.append(document.createTextNode('Products: '));
    group.products.forEach((product, position) => {
      if (position) products.append(document.createTextNode(', '));
      const link = el('a', '', product.product);
      link.href = FI.productUrl(product);
      products.append(link, document.createTextNode(` (FI Score ${product.fi_score})`));
    });
    const notes = [];
    if (group.products.every((product) => !(Array.isArray(product.reviews) && product.reviews.length))) notes.push('No reviews yet.', 'Early scores, based on our research.');
    if (group.checked) notes.push(`Last checked ${FI.formatDate(group.checked)}.`);
    const makerPart = FI.SCORE_PARTS.find((part) => part.key === 'maker_check');
    body.append(meta([group.country, count], group.sample), title, breakdown([{...makerPart, points: group.makerCheck}]),
      chips(group.checks, `Company checks for ${group.maker}`), products, el('p', 'rank-notes', notes.join(' ')));
    const score = el('span', 'maker-score');
    score.setAttribute('role', 'img');
    score.setAttribute('aria-label', group.makerCheck === null ? 'Maker check not recorded' : `Maker check ${group.makerCheck} out of 40`);
    score.append(el('b', '', group.makerCheck === null ? 'n/a' : String(group.makerCheck)), el('span', '', 'OF 40'));
    item.append(place, body, score);
    return item;
  }

  function emptyItem(view, category) {
    const item = el('li', 'shop-empty');
    const what = category === 'all' ? (view === 'makers' ? 'makers' : 'products') : FI.categoryName(category).toLowerCase();
    item.append(el('h2', '', `No live ${what} yet`),
      el('p', '', 'A product is ranked once it’s live: a person approves it after checking the maker, and it goes live when it can be bought.'));
    return item;
  }

  function items(products, view) {
    return view === 'makers' ? FI.rankMakers(products).map(makerItem) : FI.sortByScore(products).map(productItem);
  }

  function render(view, category) {
    const counts = FI.categoryCounts(live);
    for (const button of filters) {
      button.setAttribute('aria-pressed', String(button.dataset.category === category));
      button.querySelector('.shop-filter-count').textContent = counts[button.dataset.category];
    }
    for (const button of views) button.setAttribute('aria-pressed', String(button.dataset.view === view));
    sort.textContent = view === 'makers' ? 'SORTED BY MAKER CHECK' : 'SORTED BY FI SCORE';

    const ranked = items(FI.filterByCategory(live, category), view);
    list.replaceChildren(...(ranked.length ? ranked : [emptyItem(view, category)]));
    const where = category === 'all' ? '' : ` in ${FI.categoryName(category)}`;
    const noun = view === 'makers' ? 'maker' : 'product';
    status.textContent = ranked.length
      ? `Showing ${ranked.length} ${noun}${ranked.length === 1 ? '' : 's'}${where}, ${view === 'makers' ? 'highest maker check' : 'highest FI Score'} first.`
      : `Nothing is ranked${where} yet.`;

    // Until something is live, show what a ranking will look like, using the labelled samples.
    const examples = live.length ? [] : items(FI.filterByCategory(samples, category), view);
    exampleList.replaceChildren(...examples);
    example.hidden = !examples.length;
  }

  function current() {
    return [FI.parseView(window.location.search), FI.parseCategory(window.location.search)];
  }

  function go(view, category) {
    const url = new URL(window.location.href);
    if (view === 'makers') url.searchParams.set('view', 'makers');
    else url.searchParams.delete('view');
    if (category === 'all') url.searchParams.delete('category');
    else url.searchParams.set('category', category);
    window.history.pushState({view, category}, '', url);
    render(view, category);
  }

  for (const button of filters) button.addEventListener('click', () => go(current()[0], button.dataset.category));
  for (const button of views) button.addEventListener('click', () => go(button.dataset.view, current()[1]));
  window.addEventListener('popstate', () => render(...current()));

  FI.loadProducts()
    .then((products) => {
      live = products.filter(FI.isLive);
      samples = products.filter((product) => product.sample === true);
      list.removeAttribute('aria-busy');
      render(...current());
    })
    .catch((error) => {
      console.error(error);
      list.removeAttribute('aria-busy');
      const item = el('li', 'shop-empty');
      item.append(el('h2', '', 'We couldn’t load the rankings'), el('p', '', 'Please refresh the page.'));
      list.replaceChildren(item);
      status.textContent = 'The rankings didn’t load.';
    });
})();
