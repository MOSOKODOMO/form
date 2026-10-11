(() => {
  'use strict';
  const grid = document.querySelector('#home-products');
  const status = document.querySelector('#home-products-status');
  if (!grid || !status) return;
  const chosen = ['yamazon-solid-wood-saddle-stool', 'balance-round-ceramic-vase', 'abi-elysian-brushed-nickel-kitchen-mixer', 'brass-cabinet-handle-modern-long-pull-for-kitchen-wardrobe-and-drawers', 'imark-green-crackle-wall-tile'];
  const sceneHandle = 'brass-cabinet-handle-modern-long-pull-for-kitchen-wardrobe-and-drawers';
  window.FICatalogue.loadProducts().then(list => {
    const products = window.FICatalogue.sortProducts(window.FICatalogue.listedProducts(list));
    const selections = chosen.map(handle => products.find(p => p.handle === handle)).filter(Boolean);
    grid.replaceChildren(...selections.map((product,index) => window.FIProductCard.card(product.handle === sceneHandle
      ? {...product, photo_url:'assets/products/scene-cabinet-pull-studio.webp', photo_is_reference:true, photo_is_render:false}
      : product,index)));
    document.dispatchEvent(new Event('fi:collection-rendered'));
    grid.removeAttribute('aria-busy');
    status.textContent = selections.length ? '' : 'Our next collection is being prepared. Get in touch to tell us what you need.';
  }).catch(() => {
    grid.removeAttribute('aria-busy');
    status.textContent = 'The collection could not load. Visit the shop or contact our team for help.';
  });
})();
