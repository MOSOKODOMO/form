'use strict';
const CATALOGUE = 'https://fabricationintelligence.com/data/products.json';
const SITE = 'https://fabricationintelligence.com/';
const PRICES = 'https://dszagdjnymxalpwamjyh.supabase.co/functions/v1/fi-price-compare';
const statusEl = document.getElementById('status');
const list = document.getElementById('results');
const manual = document.getElementById('manual');
const compareBox = document.getElementById('compare');
const compareList = document.getElementById('compare-list');
const fabintBox = document.getElementById('fabint');
const pricesBox = document.getElementById('prices');
const priceList = document.getElementById('price-list');
const priceNote = document.getElementById('price-note');
let lookup = 0;

function readPage() {
  const text = (el) => (el && el.textContent ? el.textContent.trim().slice(0, 200) : '');
  const meta = (name) => (document.querySelector(`meta[property="${name}"],meta[name="${name}"]`) || {}).content || '';
  let price = meta('product:price:amount') || meta('og:price:amount');
  let currency = meta('product:price:currency') || meta('og:price:currency');
  let name = '', brand = '', model = '', gtin = '';
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const nodes = Array.isArray(data) ? data : (data['@graph'] || [data]);
      for (const node of nodes) {
        if (String(node['@type']).includes('Product')) {
          name = name || node.name || '';
          brand = brand || (node.brand && (node.brand.name || node.brand)) || '';
          model = model || node.mpn || node.model || node.sku || '';
          gtin = gtin || node.gtin13 || node.gtin12 || node.gtin14 || node.gtin8 || node.gtin || '';
          const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
          if (offer && !price) { price = offer.price || offer.lowPrice || ''; currency = currency || offer.priceCurrency || ''; }
        }
      }
    } catch (error) { /* ignore pages with unreadable data */ }
  }
  return {title: String(name).slice(0, 200) || meta('og:title').slice(0, 200) || document.title.slice(0, 200), heading: text(document.querySelector('h1')), brand: String(brand).slice(0, 80), model: String(model).slice(0, 60), gtin: String(gtin).slice(0, 20), price, currency};
}

async function loadCatalogue() {
  try {
    const cached = await chrome.storage.local.get('fabint');
    if (cached.fabint && Date.now() - cached.fabint.at < 3600000) return cached.fabint.products;
  } catch (error) { /* storage is optional */ }
  const response = await fetch(CATALOGUE);
  if (!response.ok) throw new Error('catalogue');
  const products = await response.json();
  try { await chrome.storage.local.set({fabint: {at: Date.now(), products}}); } catch (error) { /* ignore */ }
  return products;
}

function money(value) { return 'A$' + value.toLocaleString('en-AU', {minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2}); }

async function showPrices(query) {
  const mine = ++lookup;
  priceList.replaceChildren();
  pricesBox.hidden = !query;
  if (!query) return;
  priceNote.textContent = 'Looking up prices...';
  try {
    const response = await fetch(PRICES, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({q: query})});
    const data = await response.json();
    if (mine !== lookup) return;
    const rows = response.ok && Array.isArray(data.results) ? data.results : [];
    if (!rows.length) { priceNote.textContent = response.ok ? 'No prices found for this search. Try the shop links below.' : 'Live prices are not available right now. Try the shop links below.'; return; }
    priceNote.textContent = '';
    rows.forEach((row, index) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = row.link; link.target = '_blank'; link.rel = 'noopener noreferrer';
      const left = document.createElement('span');
      const shop = document.createElement('strong'); shop.textContent = row.seller;
      const title = document.createElement('small'); title.textContent = row.title;
      left.append(shop, title);
      const right = document.createElement('span'); right.className = 'price'; right.textContent = money(row.price);
      if (index === 0 && rows.length > 1) { const tag = document.createElement('em'); tag.className = 'tag'; tag.textContent = 'LOWEST'; right.append(tag); }
      link.append(left, right);
      li.append(link);
      priceList.append(li);
    });
  } catch (error) {
    if (mine === lookup) priceNote.textContent = 'Live prices are not available right now. Try the shop links below.';
  }
}

function showCompare(raw) {
  const {query, links} = window.FIMatch.compareLinks(raw);
  compareList.replaceChildren();
  compareBox.hidden = !links.length;
  if (!links.length) { statusEl.textContent = 'Could not read a product on this page. Type what you are looking for below.'; return; }
  statusEl.textContent = 'Searching for: ' + query;
  for (const shop of links) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = shop.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = shop.name;
    li.append(link);
    compareList.append(li);
  }
}

function show(result) {
  list.replaceChildren();
  fabintBox.hidden = !(result.category && result.matches.length);
  if (fabintBox.hidden) { manual.hidden = false; return; }
  for (const match of result.matches) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = `${SITE}product.html?handle=${encodeURIComponent(match.handle)}`;
    link.target = '_blank'; link.rel = 'noopener'; link.textContent = match.name;
    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = match.price === null ? 'See price on the product page' : `${money(match.price)} ${match.unit}`.trim();
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = [match.material, match.finishHit ? 'finish matches' : '', match.sizeHit ? 'size close' : ''].filter(Boolean).join(' · ');
    li.append(link, price, meta);
    if (match.comparison === 'cheaper') { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'STARTS LOWER THAN THIS PAGE'; li.append(tag); }
    list.append(li);
  }
  manual.hidden = false;
}

async function run(raw) {
  showCompare(raw);
  showPrices(window.FIMatch.compareLinks(raw).query);
  try {
    const products = await loadCatalogue();
    show(window.FIMatch.findAlternatives(raw, products));
  } catch (error) {
    fabintBox.hidden = true;
    manual.hidden = false;
  }
}

manual.addEventListener('submit', (event) => { event.preventDefault(); run({title: document.getElementById('query').value}); });

(async () => {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    const [injection] = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: readPage});
    await run(injection.result || {});
  } catch (error) {
    statusEl.textContent = 'This page cannot be read here. Type what you are looking for below.';
    manual.hidden = false;
  }
})();
