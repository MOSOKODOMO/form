'use strict';
const CATALOGUE = 'https://fabricationintelligence.com/data/products.json';
const SITE = 'https://fabricationintelligence.com/';
const statusEl = document.getElementById('status');
const list = document.getElementById('results');
const manual = document.getElementById('manual');

function readPage() {
  const text = (el) => (el && el.textContent ? el.textContent.trim().slice(0, 200) : '');
  const meta = (name) => (document.querySelector(`meta[property="${name}"],meta[name="${name}"]`) || {}).content || '';
  let price = meta('product:price:amount') || meta('og:price:amount');
  let currency = meta('product:price:currency') || meta('og:price:currency');
  let name = '';
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const nodes = Array.isArray(data) ? data : (data['@graph'] || [data]);
      for (const node of nodes) {
        if (String(node['@type']).includes('Product')) {
          name = name || node.name || '';
          const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
          if (offer && !price) { price = offer.price || offer.lowPrice || ''; currency = currency || offer.priceCurrency || ''; }
        }
      }
    } catch (error) { /* ignore pages with unreadable data */ }
  }
  return {title: String(name).slice(0, 200) || meta('og:title').slice(0, 200) || document.title.slice(0, 200), heading: text(document.querySelector('h1')), price, currency};
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

function money(value) { return 'A$' + (Number.isInteger(value) ? value : value.toFixed(2)); }

function show(result) {
  list.replaceChildren();
  if (!result.category || !result.matches.length) {
    statusEl.textContent = 'No similar FABINT product found for this page. Try the search below.';
    manual.hidden = false;
    return;
  }
  const page = result.facts.price && result.facts.currency === 'AUD' ? `This page: ${money(result.facts.price)}. FABINT prices are starting prices, so compare the same size. ` : 'Prices on other sites may differ in currency and delivery. ';
  statusEl.textContent = page + 'Similar FABINT products:';
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
  try {
    const products = await loadCatalogue();
    show(window.FIMatch.findAlternatives(raw, products));
  } catch (error) {
    statusEl.textContent = 'Could not load the FABINT catalogue. Check your connection and try again.';
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
