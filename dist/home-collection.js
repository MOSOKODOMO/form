(() => {
  'use strict';
  const grid = document.querySelector('#home-products');
  const status = document.querySelector('#home-products-status');
  if (!grid || !status) return;
  const chosen = ['american-style-matte-black-cabinet-handles-solid-aluminum-alloy-kitchen-cupboard', 'retro-brass-cabinet-knobs-elegant-ribbed-handles-for-drawers-dressing-tables-mod', 'naierdi-luxury-brushed-gold-cabinet-handle-drawer-aluminum-alloy-long-furniture', 'brushed-brass-kitchen-cabinet-knobs-decorative-drawer-dresser-pulls-cupboard-war'];
  window.FICatalogue.loadProducts().then(list => {
    const products = window.FICatalogue.sortProducts(window.FICatalogue.listedProducts(list));
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
