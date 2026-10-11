/* Shared, accessible catalogue image with a local fallback. */
(() => {
  'use strict';
  window.FIProductImage = (product, {width = 800, height = 1000, eager = false, decorative = false} = {}) => {
    const image = document.createElement('img');
    image.src = product.photo_url;
    image.alt = decorative ? '' : window.FICatalogue.imageAlt(product);
    image.width = width;
    image.height = height;
    image.decoding = 'async';
    image.loading = eager ? 'eager' : 'lazy';
    image.addEventListener('error', () => {
      image.src = 'assets/products/photo-coming-soon.svg';
      image.alt = decorative ? '' : `Image unavailable for ${product.product}`;
    }, {once: true});
    return image;
  };
})();
