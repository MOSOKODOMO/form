'use strict';
// Shop grid: loads data/products.json, sorts by FI Score and filters by category. The filter lives in the URL (?category=tiles).
(() => {
  const {loadProducts, sortByScore, filterByCategory, categoryCounts, parseCategory, categoryName, formatPrice, imageAlt, scoreBand} = window.FICatalogue;
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
    const badge = el('span', `fi-score fi-score--${scoreBand(score)}`);
    badge.style.setProperty('--score', score);
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', `FI Score ${score} out of 100`);
    badge.append(el('span', 'fi-score-label', 'FI'), el('b', '', String(score)));
    return badge;
  }

  function card(product, index) {
    const item = el('li', 'product-card');
    const link = el('a', 'product-card-link');
    link.href = `product.html?id=${encodeURIComponent(product.id)}`;
    link.setAttribute('aria-label', `${product.product}, ${formatPrice(product.price_aud)} ${product.price_unit}, FI Score ${product.fi_score} out of 100${product.sample ? ', sample product' : ''}`);

    const media = el('div', 'product-card-media');
    const image = el('img');
    image.src = product.photo_url;
    image.alt = imageAlt(product);
    image.width = 800;
    image.height = 1000;
    image.decoding = 'async';
    image.loading = index < 3 ? 'eager' : 'lazy';
    media.append(image);
    if (product.sample) media.append(el('span', 'sample-badge', 'SAMPLE'));

    const body = el('div', 'product-card-body');
    const meta = el('p', 'product-card-meta');
    meta.append(el('span', '', categoryName(product.category)), el('span', '', product.country));
    const price = el('p', 'product-card-price', formatPrice(product.price_aud));
    price.append(el('small', '', product.price_unit));
    const foot = el('div', 'product-card-foot');
    foot.append(price, scoreBadge(product.fi_score));
    body.append(meta, el('h2', 'product-card-title', product.product), el('p', 'product-card-maker', `by ${product.maker}`), foot);

    link.append(media, body);
    item.append(link);
    return item;
  }

  function emptyState(category) {
    const item = el('li', 'shop-empty');
    if (category === 'taps') {
      item.append(el('h2', '', 'No taps yet'), el('p', '', 'Taps sold in Australia need WaterMark certification and WELS registration, so we’ll list them once a maker passes both.'));
    } else {
      item.append(el('h2', '', `No ${categoryName(category).toLowerCase()} yet`), el('p', '', 'We list products only after their maker passes FI Verify.'));
    }
    return item;
  }

  function summary(count, category) {
    const where = category === 'all' ? '' : ` in ${categoryName(category)}`;
    if (!count) return `No products${where} yet.`;
    return `Showing ${count} product${count === 1 ? '' : 's'}${where}, highest FI Score first.`;
  }

  function render(category) {
    const counts = categoryCounts(products);
    for (const button of filters) {
      const id = button.dataset.category;
      button.setAttribute('aria-pressed', String(id === category));
      button.querySelector('.shop-filter-count').textContent = counts[id];
    }
    const list = sortByScore(filterByCategory(products, category));
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
  window.addEventListener('popstate', () => render(parseCategory(window.location.search)));

  loadProducts()
    .then((list) => {
      products = list;
      grid.removeAttribute('aria-busy');
      render(parseCategory(window.location.search));
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
