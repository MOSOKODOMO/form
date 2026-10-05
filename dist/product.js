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
        if (product.sample) slide.append(el('span', 'sample-badge', 'SAMPLE'));
        const small = el('img');
        small.src = item.src;
        small.alt = '';
        small.width = 80;
        small.height = 100;
        small.loading = 'lazy';
        thumb.append(small);
        thumb.setAttribute('aria-label', 'Show the photo');
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
    const explain = el('p', 'product-score-note', 'Our research score for this maker and product. Checked certificates raise it, missing ones lower it, and buyer reviews add to it over time. ');
    explain.append(link('./#how-it-works', 'How we score'));
    scoreText.append(scoreLine, explain);
    score.append(scoreBadge(product.fi_score, true), scoreText);

    const buy = el('div', 'product-buy');
    const price = el('p', 'product-price', FI.formatPrice(product.price_aud));
    price.append(el('small', '', `${product.price_unit}, incl. GST`));
    const delivery = el('p', 'product-delivery');
    delivery.append(el('span', '', 'Delivery estimate'), document.createTextNode(` ${product.delivery_estimate} to your door in Australia`));
    const state = FI.buyState(product);
    let action;
    if (state.enabled) {
      action = link(state.href, '', false);
      action.className = 'button button-primary product-buy-button';
      const arrow = el('span', '', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      action.append(document.createTextNode(state.label), arrow);
    } else {
      action = el('button', 'button button-primary product-buy-button', state.label);
      action.type = 'button';
      action.disabled = true;
    }
    buy.append(price, delivery, action, el('p', 'product-buy-note', state.note));

    const specs = el('dl', 'product-specs');
    for (const [name, value] of FI.specRows(product)) {
      const row = el('div');
      row.append(el('dt', '', name), el('dd', '', value));
      specs.append(row);
    }

    section.append(eyebrow, title, maker, score, buy, specs);
    return section;
  }

  function trustPanel(product) {
    const section = el('section', 'trust-panel');
    section.setAttribute('aria-labelledby', 'trust-title');
    const heading = el('div', 'trust-heading');
    const titleBlock = el('div');
    const eyebrow = el('p', 'eyebrow');
    eyebrow.append(el('span'), document.createTextNode(' FI VERIFY'));
    const title = el('h2', '', 'Why we trust this maker');
    title.id = 'trust-title';
    titleBlock.append(eyebrow, title);
    heading.append(titleBlock, el('p', 'trust-summary', FI.checkSummary(product)));

    const list = el('ul', 'trust-list');
    for (const check of FI.checkItems(product)) {
      const item = el('li', `trust-item ${check.checked ? 'trust-item--checked' : 'trust-item--missing'}`);
      const mark = el('span', 'trust-mark', check.checked ? '✓' : '✕');
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
        item.append(el('span', 'trust-link trust-link--none', check.checked ? 'No public link' : 'Nothing to show'));
      }
      list.append(item);
    }

    const notes = el('div', 'trust-notes');
    notes.append(el('p', '', '“Not found” means we looked and couldn’t find it. It lowers the FI Score.'));
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

  const id = new URLSearchParams(window.location.search).get('id');
  FI.loadProducts()
    .then((products) => {
      const product = id && FI.findProduct(products, id);
      if (!product) { notFound('It may have been removed, or the link is incomplete.'); return; }
      document.title = `${product.product} | FABINT Shop`;
      const crumb = document.querySelector('#crumb-category');
      crumb.textContent = FI.categoryName(product.category);
      crumb.href = `shop.html?category=${product.category}`;
      document.querySelector('#crumb-product').textContent = product.product;
      const layout = el('div', 'product-layout');
      layout.append(gallery(product), details(product));
      root.replaceChildren(layout, trustPanel(product));
      root.removeAttribute('aria-busy');
    })
    .catch((error) => {
      console.error(error);
      notFound('The product list didn’t load. Please refresh the page.');
    });
})();
