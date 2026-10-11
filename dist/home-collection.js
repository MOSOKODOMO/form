(() => {
  'use strict';
  const grid = document.querySelector('#home-products');
  const status = document.querySelector('#home-products-status');
  if (!grid || !status) return;
  const chosen = ['yila-matte-black-brass-t-bar', 'xinjun-vertical-knurled-brass-knob', 'mugu-brass-marble-t-bar', 'aqua-gallery-brass-towel-ring'];
  window.FICatalogue.loadProducts().then(list => {
    const products = window.FICatalogue.listedProducts(list);
    const selections = chosen.map(handle => products.find(p => p.handle === handle)).filter(Boolean);
    for (const product of products) if (selections.length < 4 && !selections.includes(product)) selections.push(product);
    grid.replaceChildren(...selections.map(window.FIProductCard.card));
    document.dispatchEvent(new Event('fi:collection-rendered'));
    grid.removeAttribute('aria-busy');
    status.textContent = selections.length ? '' : 'Our next collection is being prepared. Get in touch to tell us what you need.';
  }).catch(() => {
    grid.removeAttribute('aria-busy');
    status.textContent = 'The collection could not load. Visit the shop or contact our team for help.';
  });
})();
