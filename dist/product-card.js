/* One card renderer for the homepage and shop. Product data stays in catalogue.js. */
(() => {
  'use strict';
  const FI = window.FICatalogue;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function card(product, index = 0) {
    const item = el('li', 'product-card');
    const inner = el('article', 'product-card-inner');
    const media = el('div', `product-card-media${product.photo_is_render ? '' : ' product-card-media--source'}`);
    const image = el('img');
    image.src = product.photo_url;
    image.alt = FI.imageAlt(product);
    image.width = 800;
    image.height = 1000;
    image.decoding = 'async';
    image.loading = index < 4 ? 'eager' : 'lazy';
    image.addEventListener('error', () => {
      image.src = 'assets/products/photo-coming-soon.svg';
      image.alt = `Image unavailable for ${product.product}`;
    }, {once: true});
    media.append(image);
    if (product.photo_is_render) media.append(el('span', 'render-badge', 'AI catalogue render'));
    if (product.sample) media.append(el('span', 'sample-badge', 'SAMPLE'));
    const body = el('div', 'product-card-body');
    const meta = el('p', 'product-card-meta');
    meta.append(el('span', '', FI.categoryName(product.category)), el('span', '', product.country));
    const title = el('h2', 'product-card-title');
    const link = el('a', 'product-card-link', product.product);
    link.href = FI.productUrl(product);
    title.append(link);
    const price = FI.cardPrice(product);
    const priceNode = el('p', 'product-card-price', price.value);
    if (price.unit) priceNode.append(document.createTextNode(' '), el('small', '', price.unit));
    const foot = el('div', 'product-card-foot');
    foot.append(priceNode);
    body.append(meta, title, el('p', 'product-card-maker', product.maker), foot);
    if (FI.SHOW_FI_RATING) body.append(el('p', 'product-card-research', `FI research score ${product.fi_score}/100`));
    if (product.source_check_status === 'unavailable' || product.source_check_status === 'details_unclear') {
      body.append(el('p', 'product-card-source-note', FI.sourceEvidence(product).label));
    }
    const action = FI.buyAction(product);
    if (action.kind !== 'none') {
      const cta = el('a', `product-card-action${action.kind === 'quote' ? ' product-card-action--quote' : ''}`);
      cta.href = action.kind === 'embed' ? FI.productUrl(product) : action.href;
      const label = action.kind === 'embed' ? 'Buy' : action.label;
      cta.setAttribute('aria-label', `${label} for ${product.product}`);
      const arrow = el('span', '', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      cta.append(document.createTextNode(label), arrow);
      body.append(cta);
    }
    if (FI.canBuyNow(product) && window.FIProject) body.append(window.FIProject.button(product.handle, product.product, 'project-add project-add--card'));
    inner.append(media, body);
    item.append(inner);
    return item;
  }
  window.FIProductCard = {card};
})();
