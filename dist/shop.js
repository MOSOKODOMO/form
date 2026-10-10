'use strict';
// Shop grid: loads data/products.json, lists approved and live products by FI Score and filters by category (kept in the URL).
(() => {
  const FI = window.FICatalogue;
  const grid = document.querySelector('#product-grid');
  const status = document.querySelector('#shop-status');
  const sampleBanner = document.querySelector('#sample-banner');
  const filters = [...document.querySelectorAll('.shop-filter[data-category]')];
  let products = [];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function scoreBadge(score) {
    const badge = el('span', `fi-score fi-score--${FI.scoreBand(score)}`);
    badge.style.setProperty('--score', score);
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', `FI Score ${score} out of 100`);
    badge.append(el('span', 'fi-score-label', 'FI'), el('b', '', String(score)));
    return badge;
  }

  // The card's own button: Buy for live products, a quote request otherwise. Samples get none.
  function cardAction(product) {
    const action = FI.buyAction(product);
    if (action.kind === 'none') return null;
    const link = el('a', action.kind === 'quote' ? 'product-card-action product-card-action--quote' : 'product-card-action');
    link.href = action.kind === 'embed' ? FI.productUrl(product) : action.href;
    link.append(document.createTextNode(action.kind === 'embed' ? 'Buy' : action.label));
    const arrow = el('span', '', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    link.append(arrow);
    link.setAttribute('aria-label', `${action.kind === 'embed' ? 'Buy' : action.label + ' for'} ${product.product}`);
    return link;
  }

  function card(product, index) {
    const item = el('li', 'product-card');
    const inner = el('article', 'product-card-inner');

    const media = el('div', 'product-card-media');
    const image = el('img');
    image.src = product.photo_url;
    image.alt = FI.imageAlt(product);
    image.width = 800;
    image.height = 1000;
    image.decoding = 'async';
    image.loading = index < 3 ? 'eager' : 'lazy';
    media.append(image);
    if (product.photo_is_render) media.append(el('span', 'render-badge', 'AI RENDER'));
    if (product.sample) media.append(el('span', 'sample-badge', 'SAMPLE'));

    const body = el('div', 'product-card-body');
    const meta = el('p', 'product-card-meta');
    meta.append(el('span', '', FI.categoryName(product.category)), el('span', '', product.country));
    const title = el('h2', 'product-card-title');
    const link = el('a', 'product-card-link', product.product);
    link.href = FI.productUrl(product);
    title.append(link);
    const {value, unit} = FI.cardPrice(product);
    const price = el('p', 'product-card-price', value);
    if (unit) price.append(el('small', '', unit));
    const foot = el('div', 'product-card-foot');
    foot.append(price, scoreBadge(product.fi_score));
    body.append(meta, title, el('p', 'product-card-maker', `by ${product.maker}`), foot);
    if (product.source_check_status === 'unavailable' || product.source_check_status === 'details_unclear') {
      body.append(el('p', 'product-card-source-note', FI.sourceEvidence(product).label));
    }
    const action = cardAction(product);
    if (action) body.append(action);

    inner.append(media, body);
    item.append(inner);
    return item;
  }

  function emptyState(category) {
    const item = el('li', 'shop-empty');
    if (category === 'taps') {
      item.append(el('h2', '', 'No taps yet'), el('p', '', 'Taps sold in Australia need WaterMark certification and WELS registration, so we’ll list them once a maker passes both.'));
    } else {
      item.append(el('h2', '', `No ${FI.categoryName(category).toLowerCase()} yet`), el('p', '', 'We are still researching suppliers for this category.'));
    }
    return item;
  }

  function summary(count, category) {
    const where = category === 'all' ? '' : ` in ${FI.categoryName(category)}`;
    if (!count) return `No products${where} yet.`;
    return `Showing ${count} product${count === 1 ? '' : 's'}${where}, highest FI Score first.`;
  }

  function render(category) {
    const counts = FI.categoryCounts(products);
    for (const button of filters) {
      const id = button.dataset.category;
      button.setAttribute('aria-pressed', String(id === category));
      button.querySelector('.shop-filter-count').textContent = counts[id];
    }
    const list = FI.sortByScore(FI.filterByCategory(products, category));
    grid.replaceChildren(...(list.length ? list.map(card) : [emptyState(category)]));
    sampleBanner.hidden = !list.some((product) => product.sample);
    status.textContent = summary(list.length, category);
  }

  for (const button of filters) {
    button.addEventListener('click', () => {
      const category = button.dataset.category;
      const url = new URL(window.location.href);
      if (category === 'all') url.searchParams.delete('category');
      else url.searchParams.set('category', category);
      window.history.pushState({category}, '', url);
      render(category);
    });
  }
  window.addEventListener('popstate', () => render(FI.parseCategory(window.location.search)));

  FI.loadProducts()
    .then((list) => {
      products = FI.listedProducts(list);
      grid.removeAttribute('aria-busy');
      render(FI.parseCategory(window.location.search));
    })
    .catch((error) => {
      console.error(error);
      grid.removeAttribute('aria-busy');
      const item = el('li', 'shop-empty');
      const help = el('p', '', 'Please refresh the page, or email ');
      const mail = el('a', '', 'fabricationintelligence@gmail.com');
      mail.href = 'mailto:fabricationintelligence@gmail.com';
      help.append(mail, document.createTextNode('.'));
      item.append(el('h2', '', 'We couldn’t load the products'), help);
      grid.replaceChildren(item);
      status.textContent = 'The products didn’t load.';
    });
})();
