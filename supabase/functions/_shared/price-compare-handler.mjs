// Looks up live shopping listings for one product name through SearchApi (Google Shopping, Australia).
// The SearchApi key lives only in the function environment. It is never sent to a browser or logged.
// Nothing about the caller is stored: the cache is keyed by the product name alone and the per-address
// counters live in memory only, to protect the free search allowance.
const ENDPOINT = 'https://www.searchapi.io/api/v1/search';
const DAY = 86400000;
const state = {cache: new Map(), hits: new Map(), day: {stamp: '', used: 0}};

export function resetPriceCompareState() {
  state.cache.clear(); state.hits.clear(); state.day = {stamp: '', used: 0};
}

function priceOf(row) {
  if (typeof row.extracted_price === 'number' && row.extracted_price > 0) return row.extracted_price;
  const match = String(row.price || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function httpsUrl(value) {
  try { const url = new URL(String(value)); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

export function tidyResults(payload) {
  const rows = Array.isArray(payload && payload.shopping_results) ? payload.shopping_results : [];
  const cheapestPerSeller = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const seller = String(row.seller || row.source || row.merchant || '').trim().slice(0, 60);
    const price = priceOf(row);
    const link = httpsUrl(row.link || row.product_link || row.offers_link);
    if (!seller || price === null || !link) continue;
    const key = seller.toLowerCase();
    const entry = {seller, title: String(row.title || '').trim().slice(0, 120), price: Math.round(price * 100) / 100, link};
    if (!cheapestPerSeller.has(key) || entry.price < cheapestPerSeller.get(key).price) cheapestPerSeller.set(key, entry);
  }
  return [...cheapestPerSeller.values()].sort((a, b) => a.price - b.price).slice(0, 8);
}

export async function handlePriceCompare(req, {env, fetchImpl = fetch, now = () => Date.now(), limits = {}} = {}) {
  const perMinute = limits.perMinute ?? 12;
  const perDay = limits.perDay ?? 80;
  const headers = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), {status, headers});
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  if (req.method !== 'POST') return reply({error: 'POST required.'}, 405);
  const raw = await req.text();
  if (raw.length > 600) return reply({error: 'Request is too large.'}, 413);
  let input;
  try { input = JSON.parse(raw); } catch { return reply({error: 'Invalid request.'}, 400); }
  const query = input && typeof input.q === 'string' ? input.q.replace(/\s+/g, ' ').trim() : '';
  if (query.length < 3 || query.length > 120 || /[\u0000-\u001f]/.test(query)) return reply({error: 'Send a product name of 3 to 120 characters.'}, 400);
  if (!env || !env.apiKey) return reply({error: 'Prices are not switched on yet.', reason: 'not_configured'}, 503);

  const nowMs = now();
  const caller = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0, 64);
  const recent = (state.hits.get(caller) || []).filter((t) => nowMs - t < 60000);
  if (recent.length >= perMinute) return reply({error: 'Too many lookups. Try again in a minute.'}, 429);
  recent.push(nowMs); state.hits.set(caller, recent);
  if (state.hits.size > 2000) state.hits.clear();

  const cacheKey = query.toLowerCase();
  const cached = state.cache.get(cacheKey);
  if (cached && nowMs - cached.at < DAY) return reply({query, currency: 'AUD', results: cached.results, cached: true});

  const stamp = new Date(nowMs).toISOString().slice(0, 10);
  if (state.day.stamp !== stamp) state.day = {stamp, used: 0};
  if (state.day.used >= perDay) return reply({error: 'Daily price lookups are used up. Try again tomorrow.', reason: 'daily_limit'}, 429);
  state.day.used += 1;

  let payload;
  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set('engine', 'google_shopping');
    url.searchParams.set('q', query);
    url.searchParams.set('gl', 'au');
    url.searchParams.set('hl', 'en');
    url.searchParams.set('api_key', env.apiKey);
    const response = await fetchImpl(url.href, {headers: {Accept: 'application/json'}});
    if (!response.ok) return reply({error: 'The price service did not answer.', reason: 'upstream'}, 502);
    payload = await response.json();
  } catch {
    return reply({error: 'The price service did not answer.', reason: 'upstream'}, 502);
  }
  const results = tidyResults(payload);
  if (state.cache.size >= 500) state.cache.clear();
  state.cache.set(cacheKey, {at: nowMs, results});
  return reply({query, currency: 'AUD', results, cached: false});
}
