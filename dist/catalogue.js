/* FI shop catalogue: shared logic for shop.html and product.html. Pure functions, so Node tests can load them too. */
(() => {
  'use strict';

  const CATEGORIES = [
    {id: 'handles', name: 'Handles'},
    {id: 'knobs', name: 'Knobs'},
    {id: 'tiles', name: 'Tiles'},
    {id: 'taps', name: 'Taps'},
  ];
  const CATEGORY_IDS = CATEGORIES.map((category) => category.id);
  const STATUSES = ['checked', 'not found'];
  const TEXT_FIELDS = ['id', 'product', 'category', 'maker', 'country', 'material', 'photo_url', 'story_en', 'price_unit', 'delivery_estimate'];

  const isHttps = (value) => typeof value === 'string' && /^https:\/\/[^\s"'<>]+$/.test(value);
  const isStripeLink = (value) => typeof value === 'string' && /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_-]+$/.test(value);
  const isSitePath = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(value) && !value.includes('..');

  // Every reason a product can't be shown. An empty list means the product is fine.
  function productProblems(product) {
    if (!product || typeof product !== 'object' || Array.isArray(product)) return ['not a product object'];
    const problems = [];
    for (const key of TEXT_FIELDS) {
      if (typeof product[key] !== 'string' || !product[key].trim()) problems.push(`${key} is missing`);
    }
    if (typeof product.id === 'string' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.id)) problems.push('id must be lowercase words joined by hyphens');
    if (!CATEGORY_IDS.includes(product.category)) problems.push(`category must be one of ${CATEGORY_IDS.join(', ')}`);
    if (typeof product.sample !== 'boolean') problems.push('sample must be true or false');
    for (const key of ['finishes', 'sizes']) {
      if (!Array.isArray(product[key]) || !product[key].length || product[key].some((value) => typeof value !== 'string' || !value.trim())) problems.push(`${key} must be a list of words`);
    }
    if (typeof product.price_aud !== 'number' || !(product.price_aud > 0)) problems.push('price_aud must be a positive number');
    if (!Number.isInteger(product.fi_score) || product.fi_score < 0 || product.fi_score > 100) problems.push('fi_score must be a whole number from 0 to 100');
    if (product.maker_url !== '' && !isHttps(product.maker_url)) problems.push('maker_url must be an https link or empty');
    if (!Array.isArray(product.certificates) || !product.certificates.length) {
      problems.push('certificates must list at least one check');
    } else {
      product.certificates.forEach((check, index) => {
        const label = `certificate ${index + 1}`;
        if (!check || typeof check.name !== 'string' || !check.name.trim()) problems.push(`${label} needs a name`);
        if (!check || !STATUSES.includes(check.status)) problems.push(`${label} status must be "checked" or "not found"`);
        if (!check || (check.link !== '' && !isHttps(check.link))) problems.push(`${label} link must be an https link or empty`);
      });
    }
    if (!isSitePath(product.photo_url) && !isHttps(product.photo_url)) problems.push('photo_url must be a path on this site or an https link');
    if (product.stripe_link !== '' && !isStripeLink(product.stripe_link)) problems.push('stripe_link must be a buy.stripe.com link or empty');
    if (product.sample === true && product.stripe_link !== '') problems.push('a sample product cannot have a stripe_link');
    return problems;
  }

  // Keeps only products that pass every rule, and says which were left out and why.
  function validProducts(list, warn = () => {}) {
    if (!Array.isArray(list)) throw new Error('products.json must be a list');
    const ids = new Set();
    return list.filter((product) => {
      const problems = productProblems(product);
      if (!problems.length && ids.has(product.id)) problems.push('id is used twice');
      if (problems.length) { warn(`Left out ${product && product.id ? product.id : 'a product'}: ${problems.join('; ')}`); return false; }
      ids.add(product.id);
      return true;
    });
  }

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

  const categoryName = (id) => (CATEGORIES.find((category) => category.id === id) || {name: 'All products'}).name;

  function formatPrice(value) {
    const digits = Number.isInteger(value) ? 0 : 2;
    return 'A$' + value.toLocaleString('en-AU', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  }

  const imageAlt = (product) => (product.sample ? `Sample illustration of a ${product.product.toLowerCase()}` : product.product);

  function scoreBand(score) {
    if (score >= 85) return 'high';
    if (score >= 70) return 'good';
    return 'fair';
  }

  async function loadProducts(url = 'data/products.json') {
    const response = await fetch(url, {cache: 'no-cache'});
    if (!response.ok) throw new Error(`Could not load products (HTTP ${response.status})`);
    return validProducts(await response.json(), (message) => console.warn(message));
  }

  const api = {CATEGORIES, CATEGORY_IDS, STATUSES, isHttps, isStripeLink, productProblems, validProducts, sortByScore, filterByCategory, categoryCounts, parseCategory, categoryName, formatPrice, imageAlt, scoreBand, loadProducts};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.FICatalogue = api;
})();
