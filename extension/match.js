'use strict';
// FABINT Price Finder: pure matching code. It runs on the buyer's device and sends nothing anywhere.
(function () {
  const CATEGORY_WORDS = {
    handles: ['handle', 'handles', 'pull', 'pulls', 'bar', 'cabinet', 'drawer', 'wardrobe', 'cupboard', 'kitchen'],
    knobs: ['knob', 'knobs'],
    bathroom: ['towel', 'toilet', 'robe', 'hook', 'soap', 'bathroom', 'tissue', 'paper', 'shower', 'holder', 'brush'],
    doors: ['door', 'hinge', 'hinges', 'stopper', 'stop', 'latch', 'lock', 'lever', 'knocker', 'barn', 'track', 'sliding'],
  };
  const NOUNS = {
    handles: ['handle', 'pull'],
    knobs: ['knob'],
    bathroom: ['towel', 'toilet', 'robe', 'hook', 'soap', 'brush', 'ring', 'rail'],
    doors: ['hinge', 'latch', 'lock', 'lever', 'knocker', 'stopper', 'stop', 'track'],
  };
  const FINISHES = ['black', 'brass', 'gold', 'silver', 'stainless', 'chrome', 'bronze', 'nickel', 'copper', 'white'];
  const STOP = new Set(['the', 'and', 'for', 'with', 'of', 'a', 'an', 'in', 'to', 'pcs', 'pc', 'piece', 'pieces', 'set', 'pack', 'new', 'modern', 'style', 'home', 'free', 'shipping']);

  const singular = (word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word);
  const tokens = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t && !STOP.has(t)).map(singular);

  function inferCategory(words) {
    let best = null;
    let bestScore = 0;
    for (const [category, list] of Object.entries(CATEGORY_WORDS)) {
      const score = words.filter((word) => list.map(singular).includes(word)).length + 3 * words.filter((word) => NOUNS[category].includes(word)).length;
      if (score > bestScore) { best = category; bestScore = score; }
    }
    return best;
  }

  function sizesIn(text) {
    return [...String(text || '').toLowerCase().matchAll(/(\d{2,3})\s*mm/g)].map((m) => Number(m[1]));
  }

  const isBuyable = (product) => product && product.status === 'live' && typeof product.shopify_url === 'string' && product.shopify_url.startsWith('https://');

  function pageFacts(raw) {
    const title = [raw && raw.title, raw && raw.heading].filter(Boolean).join(' ');
    const price = raw && Number(raw.price);
    const currency = raw && typeof raw.currency === 'string' ? raw.currency.toUpperCase() : '';
    return {title, price: Number.isFinite(price) && price > 0 ? price : null, currency};
  }

  function findAlternatives(raw, products, limit = 3) {
    const facts = pageFacts(raw);
    const words = tokens(facts.title);
    const category = inferCategory(words);
    if (!category) return {facts, category: null, matches: []};
    const wantedNouns = words.filter((word) => NOUNS[category].includes(word));
    const wantedFinishes = FINISHES.filter((finish) => words.includes(finish));
    const wantedSizes = sizesIn(facts.title);
    const scored = [];
    for (const product of products || []) {
      if (!isBuyable(product) || product.category !== category) continue;
      const own = tokens([product.product, product.material, ...(product.finishes || [])].join(' '));
      if (wantedNouns.length && !wantedNouns.some((noun) => own.includes(noun))) continue;
      let score = 3;
      score += words.filter((word) => own.includes(word) && !CATEGORY_WORDS[category].map(singular).includes(word)).length;
      const ownFinishes = FINISHES.filter((finish) => own.includes(finish));
      const finishHit = wantedFinishes.some((finish) => ownFinishes.includes(finish));
      if (finishHit) score += 2;
      const productSizes = sizesIn((product.sizes || []).join(' '));
      const sizeHit = wantedSizes.some((size) => productSizes.some((own_) => Math.abs(own_ - size) <= Math.max(6, size * 0.1)));
      if (sizeHit) score += 1;
      if (score < 5) continue;
      const fiPrice = typeof product.price_aud === 'number' ? product.price_aud : null;
      let comparison = 'unknown';
      if (facts.price && facts.currency === 'AUD' && fiPrice !== null) comparison = fiPrice < facts.price ? 'cheaper' : 'not-cheaper';
      scored.push({handle: product.handle, name: product.product, price: fiPrice, unit: product.price_unit || '', material: product.material || '', finishHit, sizeHit, score, comparison});
    }
    scored.sort((a, b) => b.score - a.score || (a.price ?? Infinity) - (b.price ?? Infinity));
    return {facts, category, matches: scored.slice(0, limit)};
  }


  // Same-product search links for other shops. No prices are read from those shops.
  const SHOPS = [
    ['Google Shopping', 'https://www.google.com.au/search?tbm=shop&q='],
    ['PriceSpy', 'https://pricespy.com.au/search?search='],
    ['eBay Australia', 'https://www.ebay.com.au/sch/i.html?_nkw='],
    ['Amazon Australia', 'https://www.amazon.com.au/s?k='],
    ['Kogan', 'https://www.kogan.com/au/shop/?q='],
    ['AliExpress', 'https://www.aliexpress.com/wholesale?SearchText='],
  ];

  function cleanTitle(text) {
    const first = String(text || '').split(/\s+[|\u2013\u2014]\s+|\s+-\s+/)[0].replace(/\s+/g, ' ').trim();
    if (first.length <= 90) return first;
    const cut = first.slice(0, 90);
    return cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).trim();
  }

  // Best search text: a barcode if the page publishes one, then brand plus model, then the cleaned title.
  function searchQuery(raw) {
    const r = raw || {};
    const gtin = String(r.gtin || '').replace(/\D/g, '');
    if (gtin.length >= 8 && gtin.length <= 14) return gtin;
    const brand = String(r.brand || '').trim();
    const model = String(r.model || '').trim();
    if (brand && model && model.length >= 3 && model.length <= 40) return `${brand} ${model}`.slice(0, 90);
    return cleanTitle(r.title || r.heading || '');
  }

  function compareLinks(raw) {
    const query = searchQuery(raw);
    if (!query) return {query: '', links: []};
    return {query, links: SHOPS.map(([name, base]) => ({name, url: base + encodeURIComponent(query)}))};
  }

  const api = {tokens, inferCategory, sizesIn, isBuyable, pageFacts, findAlternatives, cleanTitle, searchQuery, compareLinks, SHOPS};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.FIMatch = api;
})();
