'use strict';
// Product page: product.html?id=<id>. Builds the gallery (origin story last), details, Buy button and trust panel.
(() => {
  const FI = window.FICatalogue;
  const root = document.querySelector('#product');
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function link(href, text, external) {
    const anchor = el('a', '', text);
    anchor.href = href;
    if (external) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
    return anchor;
  }

  function scoreBadge(score, large) {
    const badge = el('span', `fi-score fi-score--${FI.scoreBand(score)}${large ? ' fi-score--large' : ''}`);
    badge.style.setProperty('--score', score);
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', `FI Score ${score} out of 100`);
    badge.append(el('span', 'fi-score-label', 'FI'), el('b', '', String(score)));
    return badge;
  }

  function gallery(product) {
    const section = el('section', 'product-gallery');
    section.setAttribute('aria-label', 'Photos and origin story');
    const track = el('div', 'gallery-track');
    track.tabIndex = 0;
    const thumbs = el('div', 'gallery-thumbs');
    thumbs.setAttribute('role', 'group');
    thumbs.setAttribute('aria-label', 'Choose what to show');
    const slides = [];

    FI.galleryItems(product).forEach((item, index) => {
      const slide = el('figure', `gallery-slide gallery-slide--${item.type}`);
      const thumb = el('button', `gallery-thumb gallery-thumb--${item.type}`);
      thumb.type = 'button';
      if (item.type === 'photo') {
        const image = el('img');
        image.src = item.src;
        image.alt = item.alt;
        image.width = 800;
        image.height = 1000;
        image.decoding = 'async';
        if (index === 0) image.setAttribute('fetchpriority', 'high');
        slide.append(image);
        if (product.photo_is_render) slide.append(el('span', 'render-badge', 'AI RENDER'));
        if (product.sample) slide.append(el('span', 'sample-badge', 'SAMPLE'));
        const small = el('img');
        small.src = item.src;
        small.alt = '';
        small.width = 80;
        small.height = 100;
        small.loading = 'lazy';
        thumb.append(small);
        thumb.setAttribute('aria-label', product.photo_is_render ? 'Show the AI catalogue render' : 'Show the photo');
      } else {
        const card = el('div', 'story-card');
        const backdrop = el('p', 'story-backdrop', item.place);
        backdrop.setAttribute('aria-hidden', 'true');
        card.append(backdrop, el('p', 'story-label', 'ORIGIN STORY'), el('h2', 'story-title', item.title), el('p', 'story-place', item.place), el('p', 'story-text', item.text));
        slide.append(card);
        thumb.append(el('span', '', 'Story'));
        thumb.setAttribute('aria-label', 'Show the origin story');
      }
      // Scroll only the gallery, never the page.
      thumb.addEventListener('click', () => track.scrollTo({left: index * track.clientWidth, behavior: reducedMotion ? 'auto' : 'smooth'}));
      slides.push(slide);
      track.append(slide);
      thumbs.append(thumb);
    });

    const markActive = () => {
      const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      [...thumbs.children].forEach((thumb, i) => thumb.setAttribute('aria-pressed', String(i === index)));
    };
    track.addEventListener('scroll', () => window.requestAnimationFrame(markActive), {passive: true});
    markActive();
    section.append(track, thumbs);
    if (product.photo_is_render) {
      section.append(el('p', 'gallery-caption', product.photo_caption || 'AI render based on supplier imagery. Illustration only; confirm the selected variant before ordering.'));
    }
    return section;
  }

  function details(product) {
    const section = el('section', 'product-details');
    section.setAttribute('aria-labelledby', 'product-title');

    const eyebrow = el('p', 'product-eyebrow');
    if (product.sample) eyebrow.append(el('span', 'sample-badge sample-badge--inline', 'SAMPLE'));
    eyebrow.append(el('span', '', `${FI.categoryName(product.category)} · ${product.country}`));
    const title = el('h1', 'product-title', product.product);
    title.id = 'product-title';
    const maker = el('p', 'product-maker', 'by ');
    maker.append(product.maker_url ? link(product.maker_url, product.maker, true) : document.createTextNode(product.maker));

    const score = el('div', 'product-score');
    const scoreText = el('div');
    const scoreLine = el('p', 'product-score-title');
    scoreLine.append(el('b', '', `FI Score ${product.fi_score}`), document.createTextNode(' out of 100'));
    const explain = el('p', 'product-score-note', 'Our research score for this maker and product, not a physical quality test. Supplier ratings are separate from FI buyer reviews. ');
    explain.append(link('rankings.html#how-we-score', 'How we score'));
    scoreText.append(scoreLine, explain);
    score.append(scoreBadge(product.fi_score, true), scoreText);

    const buy = buyArea(product);

    const specs = el('dl', 'product-specs');
    for (const [name, value] of FI.specRows(product)) {
      const row = el('div');
      row.append(el('dt', '', name), el('dd', '', value));
      specs.append(row);
    }

    if (product.status === 'draft' || product.status === 'rejected') {
      const note = product.status === 'draft' ? 'Draft preview: this product hasn’t been approved yet, so it isn’t in the shop.' : 'This product was rejected and isn’t in the shop.';
      section.append(el('p', 'product-status-note', note));
    }
    // With the FI rating off, the score and the supplier research panel stay hidden (see catalogue.js).
    if (FI.SHOW_FI_RATING) section.append(eyebrow, title, maker, sourcePanel(product), score, buy, specs);
    else section.append(eyebrow, title, maker, buy, specs);
    return section;
  }

  function sourcePanel(product) {
    const evidence = FI.sourceEvidence(product);
    const panel = el('div', 'product-source');
    panel.append(el('p', 'product-source-label', evidence.label));
    if (evidence.checked) panel.append(el('p', 'product-source-date', `Checked ${evidence.checked}`));
    panel.append(el('p', 'product-source-note', evidence.note));
    if (evidence.href) panel.append(link(evidence.href, 'View supplier product listing ↗', true));
    return panel;
  }

  function actionLink(action) {
    const anchor = link(action.href, '', false);
    anchor.className = `button ${action.kind === 'quote' ? 'button-quote' : 'button-primary'} product-buy-button`;
    const arrow = el('span', '', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    anchor.append(document.createTextNode(action.label), arrow);
    return anchor;
  }

  // Brand styling for Shopify's own Buy Button. Price and title come from our page, not the widget.
  const SHOPIFY_OPTIONS = {
    product: {
      contents: {img: false, title: false, price: false},
      text: {button: 'Buy'},
      styles: {button: {'font-family': 'Manrope, sans-serif', 'font-weight': '800', 'font-size': '13px', 'padding-top': '16px', 'padding-bottom': '16px', color: '#252b23', 'background-color': '#dce970', 'border-radius': '0px', ':hover': {color: '#252b23', 'background-color': '#e8f397'}, ':focus': {'background-color': '#e8f397'}}},
    },
    cart: {text: {total: 'Subtotal', button: 'Checkout'}, styles: {button: {color: '#252b23', 'background-color': '#dce970', 'border-radius': '0px', ':hover': {'background-color': '#e8f397'}}}},
    toggle: {styles: {toggle: {'background-color': '#dce970', ':hover': {'background-color': '#e8f397'}}, count: {color: '#252b23'}, iconPath: {fill: '#252b23'}}},
  };
  let shopifyLoading = null;

  function loadShopify(src) {
    if (window.ShopifyBuy && window.ShopifyBuy.UI) return Promise.resolve(window.ShopifyBuy);
    if (!shopifyLoading) {
      shopifyLoading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.async = true;
        script.src = src;
        script.onload = () => (window.ShopifyBuy && window.ShopifyBuy.UI ? resolve(window.ShopifyBuy) : reject(new Error('Shopify script loaded without ShopifyBuy')));
        script.onerror = () => reject(new Error('Shopify script failed to load'));
        document.head.append(script);
      });
    }
    return shopifyLoading;
  }

  // Builds Shopify's Buy Button from the store, public token and product id read out of the snippet.
  // If it can't load, the next option takes its place: Shopify link, Stripe link, then a quote request.
  function shopifyEmbed(action) {
    const holder = el('div', 'shopify-buy');
    const node = el('div', 'shopify-buy-node');
    const waiting = el('p', 'shopify-buy-status', 'Loading secure checkout…');
    holder.append(node, waiting);
    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      holder.replaceChildren(actionLink(action.fallback));
    };
    const timer = window.setTimeout(fallback, 10000);
    loadShopify(action.sdk)
      .then((ShopifyBuy) => {
        const client = ShopifyBuy.buildClient({domain: action.embed.domain, storefrontAccessToken: action.embed.storefrontAccessToken});
        return ShopifyBuy.UI.onReady(client).then((ui) => ui.createComponent('product', {id: action.embed.productId, node, moneyFormat: '%24%7B%7Bamount%7D%7D', options: SHOPIFY_OPTIONS}));
      })
      .then(() => {
        window.clearTimeout(timer);
        if (settled) return;
        if (!node.childElementCount) { fallback(); return; }
        settled = true;
        waiting.remove();
      })
      .catch((error) => {
        window.clearTimeout(timer);
        console.warn('Shopify Buy Button did not load:', error);
        fallback();
      });
    return holder;
  }

  // The buy control, then the price, "ships from" and delivery window, each only if the source states it.
  function buyArea(product) {
    const area = el('div', 'product-buy');
    const action = FI.buyAction(product);
    let control;
    if (action.kind === 'link' || action.kind === 'quote') {
      control = actionLink(action);
    } else if (action.kind === 'embed') {
      control = shopifyEmbed(action);
    } else {
      control = el('button', 'button button-primary product-buy-button', action.label);
      control.type = 'button';
      control.disabled = true;
    }
    area.append(control);
    const facts = FI.purchaseFacts(product);
    if (facts.length) {
      const list = el('dl', 'product-facts');
      for (const fact of facts) {
        const row = el('div', fact.label === 'Price' ? 'is-price' : '');
        row.append(el('dt', '', fact.label), el('dd', '', fact.value));
        list.append(row);
      }
      area.append(list);
    }
    area.append(el('p', 'product-buy-note', action.note));
    return area;
  }

  function trustPanel(product) {
    const section = el('section', 'trust-panel');
    section.setAttribute('aria-labelledby', 'trust-title');
    const heading = el('div', 'trust-heading');
    const titleBlock = el('div');
    const eyebrow = el('p', 'eyebrow');
    eyebrow.append(el('span'), document.createTextNode(' FI VERIFY'));
    const title = el('h2', '', 'Maker evidence and outstanding checks');
    title.id = 'trust-title';
    titleBlock.append(eyebrow, title);
    heading.append(titleBlock, el('p', 'trust-summary', FI.checkSummary(product)));

    const list = el('ul', 'trust-list');
    for (const check of FI.checkItems(product)) {
      const item = el('li', `trust-item trust-item--${check.state.replace(' ', '-')}`);
      const mark = el('span', 'trust-mark', {verified: '✓', claimed: '?', failed: '✕'}[check.state] || '–');
      mark.setAttribute('aria-hidden', 'true');
      const text = el('div', 'trust-text');
      text.append(el('p', 'trust-name', check.name), el('p', 'trust-status', check.status));
      item.append(mark, text);
      if (check.link) {
        const source = link(check.link, 'View source', true);
        source.className = 'trust-link';
        source.setAttribute('aria-label', `View source for ${check.name} (opens in a new tab)`);
        item.append(source);
      } else {
        item.append(el('span', 'trust-link trust-link--none', check.state === 'claimed' ? 'Not checked yet' : 'Nothing to show'));
      }
      list.append(item);
    }

    const notes = el('div', 'trust-notes');
    notes.append(el('p', '', 'Verified means we checked it on the issuer’s own database. Claimed means the maker says so and we haven’t checked it yet. Not stated means the maker doesn’t mention it.'));
    if (product.sample) notes.append(el('p', '', 'These checks are examples for a sample product. The links go to the registers where checks like these are made.'));
    section.append(heading, list, notes);
    return section;
  }

  function notFound(message) {
    const box = el('div', 'shop-empty product-missing');
    const back = link('shop.html', 'Back to the shop');
    back.className = 'button button-primary';
    box.append(el('h1', '', 'We couldn’t find that product'), el('p', '', message), back);
    root.replaceChildren(box);
    root.removeAttribute('aria-busy');
    document.querySelector('#crumb-product').textContent = 'Not found';
  }

  const handle = FI.parseHandle(window.location.search);
  FI.loadProducts()
    .then((products) => {
      const product = handle && FI.findProduct(products, handle);
      if (!product) { notFound('It may have been removed, or the link is incomplete.'); return; }
      document.title = `${product.product} | FABINT Shop`;
      const crumb = document.querySelector('#crumb-category');
      crumb.textContent = FI.categoryName(product.category);
      crumb.href = `shop.html?category=${product.category}`;
      document.querySelector('#crumb-product').textContent = product.product;
      const layout = el('div', 'product-layout');
      layout.append(gallery(product), details(product));
      const reviews = el('section', 'product-reviews');
      reviews.dataset.reviewHandle = product.handle;
      reviews.setAttribute('aria-label', 'Customer product reviews');
      if (FI.SHOW_FI_RATING) root.replaceChildren(layout, trustPanel(product), reviews);
      else root.replaceChildren(layout, reviews);
      root.removeAttribute('aria-busy');
    })
    .catch((error) => {
      console.error(error);
      notFound('The product list didn’t load. Please refresh the page.');
    });
})();
