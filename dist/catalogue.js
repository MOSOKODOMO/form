/* FI shop catalogue: shared logic for shop.html and product.html. Pure functions, so Node tests can load them too. */
(() => {
  'use strict';

  const CATEGORIES = [
    {id: 'handles', name: 'Handles'},
    {id: 'knobs', name: 'Knobs'},
    {id: 'tiles', name: 'Tiles'},
    {id: 'taps', name: 'Taps'},
    {id: 'bathroom', name: 'Bathroom'},
    {id: 'doors', name: 'Doors and walls'},
  ];
  const CATEGORY_IDS = CATEGORIES.map((category) => category.id);
  // Verified: a person confirmed it on the issuer's own database. Claimed: on the maker's page only. Failed: checked and it didn't hold up.
  const CHECK_STATUSES = ['verified', 'claimed', 'failed', 'not stated'];
  const CHECK_LABELS = {verified: 'Verified', claimed: 'Claimed, not yet checked', failed: 'Failed our check', 'not stated': 'Not stated'};
  const CHIP_LABELS = {verified: 'Verified', claimed: 'Claimed', failed: 'Failed', 'not stated': 'Not stated'};
  // The FI Score out of 100. Buyers stays at 0 until a product has real reviews, so an early score tops out at 85.
  const SCORE_PARTS = [
    {key: 'maker_check', label: 'Maker check', max: 40},
    {key: 'product_proof', label: 'Product proof', max: 30},
    {key: 'value', label: 'Value', max: 15},
    {key: 'buyers', label: 'Buyers', max: 15},
  ];
  // Every product starts as a draft. Only a person approves it, and only a person sets it live.
  const PRODUCT_STATUSES = ['draft', 'approved', 'live', 'rejected'];
  const LISTED_STATUSES = ['approved', 'live'];
  const NOT_STATED = 'not stated';
  const TEXT_FIELDS = ['handle', 'status', 'product', 'category', 'maker', 'country', 'ships_from', 'material', 'photo_url', 'story_en', 'price_unit', 'delivery_estimate'];
  const LINK_FIELDS = ['shopify_url', 'shopify_buy_button', 'stripe_link'];
  // Keys that must never reach the browser: Stripe secret, restricted and webhook keys, Shopify Admin tokens, private keys.
  const SECRET_PATTERNS = [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{6,}/, /\bwhsec_[A-Za-z0-9]{6,}/, /\bshp(?:at|ca|pa|ss)_[A-Za-z0-9]{6,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
  const SHOPIFY_SDK = 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js';

  const isHttps = (value) => typeof value === 'string' && /^https:\/\/[^\s"'<>]+$/.test(value);
  const isStripeLink = (value) => typeof value === 'string' && /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_-]+$/.test(value);
  const isSitePath = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(value) && !value.includes('..');
  const isStated = (value) => (typeof value === 'number' ? Number.isFinite(value) : typeof value === 'string' && value.trim() !== '' && value.trim().toLowerCase() !== NOT_STATED);

  function containsSecret(value) {
    if (typeof value === 'string') return SECRET_PATTERNS.some((pattern) => pattern.test(value));
    if (Array.isArray(value)) return value.some(containsSecret);
    if (value && typeof value === 'object') return Object.values(value).some(containsSecret);
    return false;
  }

  // Reads a pasted Shopify Buy Button snippet for its store, public storefront token and product id.
  // The snippet is never run as code; product.js loads Shopify's own script and builds the button itself.
  function parseShopifyBuyButton(snippet) {
    if (typeof snippet !== 'string' || !snippet.trim()) return null;
    const domain = (snippet.match(/domain:\s*['"]([a-z0-9][a-z0-9-]*\.myshopify\.com)['"]/i) || [])[1];
    const storefrontAccessToken = (snippet.match(/storefrontAccessToken:\s*['"]([a-f0-9]{32})['"]/i) || [])[1];
    const productId = (snippet.match(/createComponent\(\s*['"]product['"]\s*,\s*\{[\s\S]*?\bid:\s*\[?\s*['"]?(\d+)['"]?/) || [])[1];
    if (!domain || !storefrontAccessToken || !productId) return null;
    return {domain: domain.toLowerCase(), storefrontAccessToken, productId};
  }

  // Every reason a product can't be shown. An empty list means the product is fine.
  function productProblems(product) {
    if (!product || typeof product !== 'object' || Array.isArray(product)) return ['not a product object'];
    const problems = [];
    if (containsSecret(product)) problems.push('contains what looks like a secret key; remove it, secret keys never go in products.json');
    for (const key of TEXT_FIELDS) {
      if (typeof product[key] !== 'string' || !product[key].trim()) problems.push(`${key} is missing (write "not stated" if the source doesn’t say)`);
    }
    if (typeof product.handle === 'string' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.handle)) problems.push('handle must be lowercase words joined by hyphens');
    if (!PRODUCT_STATUSES.includes(product.status)) problems.push(`status must be one of ${PRODUCT_STATUSES.join(', ')}`);
    if (!CATEGORY_IDS.includes(product.category)) problems.push(`category must be one of ${CATEGORY_IDS.join(', ')}`);
    if (typeof product.sample !== 'boolean') problems.push('sample must be true or false');
    for (const key of ['finishes', 'sizes']) {
      if (!Array.isArray(product[key]) || !product[key].length || product[key].some((value) => typeof value !== 'string' || !value.trim())) problems.push(`${key} must be a list of words`);
    }
    if (product.price_aud !== NOT_STATED && (typeof product.price_aud !== 'number' || !(product.price_aud > 0))) problems.push('price_aud must be a positive number or "not stated"');
    if (!Number.isInteger(product.fi_score) || product.fi_score < 0 || product.fi_score > 100) problems.push('fi_score must be a whole number from 0 to 100');
    if (product.maker_url !== '' && !isHttps(product.maker_url)) problems.push('maker_url must be an https link or empty');
    if (product.source_url !== undefined && product.source_url !== '' && !isHttps(product.source_url)) problems.push('source_url must be an https link or empty');
    if (product.source_check_status !== undefined && !['listing_found', 'details_unclear', 'unavailable'].includes(product.source_check_status)) problems.push('source_check_status must describe a found, unclear or unavailable listing');
    if (product.photo_is_render !== undefined && typeof product.photo_is_render !== 'boolean') problems.push('photo_is_render must be true or false');
    if (!Array.isArray(product.certificates) || !product.certificates.length) {
      problems.push('certificates must list at least one check');
    } else {
      product.certificates.forEach((check, index) => {
        const label = `certificate ${index + 1}`;
        if (!check || typeof check.name !== 'string' || !check.name.trim()) problems.push(`${label} needs a name`);
        if (!check || !CHECK_STATUSES.includes(check.status)) problems.push(`${label} status must be one of ${CHECK_STATUSES.join(', ')}`);
        if (!check || (check.link !== '' && !isHttps(check.link))) problems.push(`${label} link must be an https link or empty`);
      });
    }
    if (!isSitePath(product.photo_url) && !isHttps(product.photo_url)) problems.push('photo_url must be a path on this site or an https link');
    for (const key of LINK_FIELDS) {
      if (typeof product[key] !== 'string') problems.push(`${key} must be text (empty if there is none)`);
    }
    if (product.shopify_url && !isHttps(product.shopify_url)) problems.push('shopify_url must be an https link or empty');
    if (product.stripe_link && !isStripeLink(product.stripe_link)) problems.push('stripe_link must be a buy.stripe.com link or empty');
    if (product.stripe_price_aud !== undefined && product.stripe_price_aud !== '' && !(typeof product.stripe_price_aud === 'number' && product.stripe_price_aud > 0)) problems.push('stripe_price_aud must be a positive number or empty');
    if (product.sample === true && (product.status === 'live' || LINK_FIELDS.some((key) => product[key]))) problems.push('a sample product cannot be live or have checkout links');
    if (product.score_parts !== undefined) {
      const parts = product.score_parts && typeof product.score_parts === 'object' ? product.score_parts : {};
      const fits = SCORE_PARTS.every(({key, max}) => Number.isInteger(parts[key]) && parts[key] >= 0 && parts[key] <= max);
      if (!fits) problems.push('score_parts needs maker_check (0 to 40), product_proof (0 to 30), value (0 to 15) and buyers (0 to 15)');
      else if (SCORE_PARTS.reduce((sum, {key}) => sum + parts[key], 0) !== product.fi_score) problems.push('score_parts must add up to fi_score');
    }
    return problems;
  }

  // Keeps only products that pass every rule, and says which were left out and why.
  function validProducts(list, warn = () => {}) {
    if (!Array.isArray(list)) throw new Error('products.json must be a list');
    const handles = new Set();
    return list.filter((product) => {
      const problems = productProblems(product);
      if (!problems.length && handles.has(product.handle)) problems.push('handle is used twice');
      if (problems.length) { warn(`Left out ${product && product.handle ? product.handle : 'a product'}: ${problems.join('; ')}`); return false; }
      handles.add(product.handle);
      return true;
    });
  }

  // The shop and its counts show approved and live products only. Drafts and rejected products stay out.
  const isListed = (product) => LISTED_STATUSES.includes(product.status);
  const listedProducts = (list) => list.filter(isListed);

  const byScore = (a, b) => b.fi_score - a.fi_score || a.product.localeCompare(b.product);
  const sortByScore = (list) => [...list].sort(byScore);
  const filterByCategory = (list, category) => (CATEGORY_IDS.includes(category) ? list.filter((product) => product.category === category) : list);

  function categoryCounts(list) {
    const counts = {all: list.length};
    for (const id of CATEGORY_IDS) counts[id] = list.filter((product) => product.category === id).length;
    return counts;
  }

  function parseCategory(search) {
    const value = new URLSearchParams(search || '').get('category');
    return CATEGORY_IDS.includes(value) ? value : 'all';
  }

  // product.html?handle=<handle>; ?id= still works for older links.
  function parseHandle(search) {
    const params = new URLSearchParams(search || '');
    return params.get('handle') || params.get('id') || '';
  }

  const categoryName = (id) => (CATEGORIES.find((category) => category.id === id) || {name: 'All products'}).name;

  function formatPrice(value) {
    const digits = Number.isInteger(value) ? 0 : 2;
    return 'A$' + value.toLocaleString('en-AU', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  }

  const shownValue = (value) => (isStated(value) ? value : 'Not stated');
  const imageAlt = (product) => {
    if (product.sample) return `Sample illustration of a ${product.product.toLowerCase()}`;
    const alt = isStated(product.photo_alt) ? product.photo_alt : product.product;
    return product.photo_is_render === true && !/^AI render/i.test(alt) ? `AI render of ${alt}` : alt;
  };
  const SOURCE_CHECK_LABELS = {listing_found: 'Supplier listing found', details_unclear: 'Supplier details need confirmation', unavailable: 'Source listing unavailable'};
  function sourceEvidence(product) {
    return {
      href: isHttps(product.source_url) ? product.source_url : null,
      label: SOURCE_CHECK_LABELS[product.source_check_status] || 'Source not checked',
      checked: formatDate(product.source_checked_on),
      note: isStated(product.source_check_note) ? product.source_check_note : 'Confirm the exact product and variant with the supplier before ordering.',
    };
  }
  const productUrl = (product) => `product.html?handle=${encodeURIComponent(product.handle)}`;
  const quoteHref = (product) => `contact.html?product=${encodeURIComponent(product.product)}#contact-form`;

  function scoreBand(score) {
    if (score >= 85) return 'high';
    if (score >= 70) return 'good';
    return 'fair';
  }

  const findProduct = (list, handle) => list.find((product) => product.handle === handle) || null;

  // What the buy area shows. Only live products can be bought, in this order: Shopify embed, Shopify link, Stripe link, then a quote request.
  function buyAction(product) {
    if (product.sample) return {kind: 'none', label: 'Sample: not for sale', note: 'This sample shows how the shop works. It can’t be bought.'};
    if (product.status === 'draft') return {kind: 'none', label: 'Draft: not for sale', note: 'This product hasn’t been approved yet.'};
    if (product.status === 'rejected') return {kind: 'none', label: 'Not available', note: 'This product is no longer listed.'};
    const quote = {kind: 'quote', label: 'Request a quote', href: quoteHref(product), note: 'Ask us for a price and delivery time. We reply within 48 hours.'};
    if (product.source_check_status === 'unavailable' || product.source_check_status === 'details_unclear') {
      return {...quote, label: 'Confirm product details', note: 'We need to confirm the source, variant and availability before accepting an order.'};
    }
    if (product.status !== 'live') return quote;
    const shopifyLink = isHttps(product.shopify_url) ? {kind: 'link', label: 'Buy', href: product.shopify_url, note: 'Secure checkout with Shopify.'} : null;
    const stripeLink = isStripeLink(product.stripe_link) ? {kind: 'link', label: 'Buy', href: product.stripe_link, note: 'Secure checkout with Stripe.'} : null;
    const embed = parseShopifyBuyButton(product.shopify_buy_button);
    if (embed) return {kind: 'embed', embed, sdk: SHOPIFY_SDK, fallback: shopifyLink || stripeLink || quote, note: 'Secure checkout with Shopify.'};
    return shopifyLink || stripeLink || quote;
  }

  // Shown under the buy button, and only when the product's source states them.
  function purchaseFacts(product) {
    const facts = [];
    if (isStated(product.price_aud)) facts.push({label: 'Price', value: `${formatPrice(product.price_aud)}${isStated(product.price_unit) ? ` ${product.price_unit}` : ''}, incl. GST`});
    if (isStated(product.ships_from)) facts.push({label: 'Ships from', value: product.ships_from});
    if (isStated(product.delivery_estimate)) facts.push({label: 'Delivery', value: product.delivery_estimate});
    return facts;
  }

  const cardPrice = (product) => (isStated(product.price_aud) ? {value: formatPrice(product.price_aud), unit: isStated(product.price_unit) ? product.price_unit : ''} : {value: 'Price on request', unit: ''});

  // Photos first; the maker's origin story is always the last slide.
  function galleryItems(product) {
    return [
      {type: 'photo', src: product.photo_url, alt: imageAlt(product)},
      {type: 'story', title: `Made by ${product.maker}`, place: shownValue(product.country), text: isStated(product.story_en) ? product.story_en : 'We haven’t recorded this maker’s story yet.'},
    ];
  }

  function checkItems(product) {
    return product.certificates.map((check) => ({
      name: check.name,
      state: check.status,
      status: CHECK_LABELS[check.status] || 'Not stated',
      link: check.status === 'verified' && isHttps(check.link) ? check.link : null,
    }));
  }

  function checkSummary(product) {
    const verified = product.certificates.filter((check) => check.status === 'verified').length;
    return `${verified} of ${product.certificates.length} verified`;
  }

  const specRows = (product) => [
    ['Material', shownValue(product.material)],
    ['Finishes', product.finishes.join(', ')],
    ['Sizes', product.sizes.join(', ')],
    ['Made in', shownValue(product.country)],
    ['Maker', product.maker],
  ];

  // ---------- rankings ----------
  const isLive = (product) => product.status === 'live';
  const parseView = (search) => (new URLSearchParams(search).get('view') === 'makers' ? 'makers' : 'products');

  function scoreBreakdown(product) {
    const parts = product.score_parts && typeof product.score_parts === 'object' ? product.score_parts : {};
    return SCORE_PARTS.map((part) => ({...part, points: Number.isInteger(parts[part.key]) ? parts[part.key] : null}));
  }

  function certificateChips(product) {
    return product.certificates.map((check) => ({name: check.name, state: check.status, label: CHIP_LABELS[check.status] || 'Not stated'}));
  }

  const isRegistration = (check) => /registration|licen[cs]e/i.test(check.name);

  // Makers ranked by their maker check, then by their best product.
  function rankMakers(products) {
    const groups = new Map();
    for (const product of sortByScore(products)) {
      const key = product.maker.trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, {maker: product.maker, country: product.country, products: [], makerCheck: null, checks: [], checked: '', sample: true});
      const group = groups.get(key);
      group.products.push(product);
      group.sample = group.sample && product.sample === true;
      const points = scoreBreakdown(product)[0].points;
      if (points !== null && (group.makerCheck === null || points > group.makerCheck)) group.makerCheck = points;
      for (const check of product.certificates.filter(isRegistration)) {
        if (!group.checks.some((existing) => existing.name === check.name)) group.checks.push({name: check.name, state: check.status, label: CHIP_LABELS[check.status] || 'Not stated'});
      }
      if (typeof product.score_checked === 'string' && product.score_checked > group.checked) group.checked = product.score_checked;
    }
    return [...groups.values()].sort((a, b) => (b.makerCheck ?? -1) - (a.makerCheck ?? -1)
      || b.products[0].fi_score - a.products[0].fi_score || a.maker.localeCompare(b.maker));
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function formatDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof iso === 'string' ? iso : '');
    return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : '';
  }

  function scoreNotes(product) {
    const reviews = Array.isArray(product.reviews) ? product.reviews.length : 0;
    const notes = reviews ? [`Includes ${reviews} buyer review${reviews === 1 ? '' : 's'}.`] : ['No reviews yet.', 'Early score, based on our research.'];
    const checked = formatDate(product.score_checked);
    if (checked) notes.push(`Score checked ${checked}.`);
    return notes;
  }

  async function loadProducts(url = 'data/products.json') {
    const response = await fetch(url, {cache: 'no-cache'});
    if (!response.ok) throw new Error(`Could not load products (HTTP ${response.status})`);
    return validProducts(await response.json(), (message) => console.warn(message));
  }

  const api = {CATEGORIES, CATEGORY_IDS, CHECK_STATUSES, CHECK_LABELS, PRODUCT_STATUSES, LISTED_STATUSES, NOT_STATED, SHOPIFY_SDK, isHttps, isStripeLink, isStated, containsSecret, parseShopifyBuyButton, productProblems, validProducts, isListed, listedProducts, sortByScore, filterByCategory, categoryCounts, parseCategory, parseHandle, categoryName, formatPrice, imageAlt, sourceEvidence, productUrl, quoteHref, scoreBand, findProduct, buyAction, purchaseFacts, cardPrice, galleryItems, checkItems, checkSummary, specRows, loadProducts, SCORE_PARTS, CHIP_LABELS, isLive, parseView, scoreBreakdown, certificateChips, rankMakers, formatDate, scoreNotes};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.FICatalogue = api;
})();
