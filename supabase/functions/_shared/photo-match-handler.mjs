// Describes a product photo (type, finish, size) so the website can match it to the catalogue.
// Backup chain: Gemini first, then OpenRouter. If both fail the browser shows its example photos.
// API keys live only in the function environment. Photos are never stored or logged, and the caller's IP is never forwarded.
const origins = new Set(['https://fabricationintelligence.com', 'https://www.fabricationintelligence.com']);
export const CATEGORIES = ['handles', 'knobs', 'tiles', 'taps', 'bathroom', 'doors', 'decoration', 'furniture'];
export const FINISHES = ['black', 'brass', 'silver', 'other'];
const MAX_BODY = 900000;
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const LIMIT = {count: 12, windowMs: 10 * 60 * 1000};
const seen = new Map();

export const PROMPT = [
  'You help a renovation hardware shop match a customer photo to its catalogue.',
  'Look at the photo and reply with ONE JSON object only, no other text, with these keys:',
  `"is_hardware" (boolean, true if the photo mainly shows a handle, knob, hook, tap, tile, door fitting or similar renovation item),`,
  '"contains_person" (boolean, true if a person or face is clearly visible),',
  `"category" (one of ${CATEGORIES.join(', ')}, or null),`,
  `"finish" (one of ${FINISHES.join(', ')}, or null),`,
  '"keywords" (up to 6 short lowercase words describing the item, for example "t-bar", "knurled", "lever"),',
  '"size_mm" (a number in millimetres if a size is printed or clearly estimable, else null),',
  '"summary" (one plain sentence, max 20 words, describing what the item is).',
  'Do not identify people. Do not guess brands.',
].join(' ');

export function normalise(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const word = (value) => (typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9\- ]/g, '').trim().slice(0, 24) : '');
  const size = Number(raw.size_mm);
  return {
    is_hardware: raw.is_hardware !== false,
    contains_person: raw.contains_person === true,
    category: CATEGORIES.includes(raw.category) ? raw.category : null,
    finish: FINISHES.includes(raw.finish) ? raw.finish : null,
    keywords: (Array.isArray(raw.keywords) ? raw.keywords : []).map(word).filter(Boolean).slice(0, 6),
    size_mm: Number.isFinite(size) && size >= 5 && size <= 2000 ? Math.round(size) : null,
    summary: typeof raw.summary === 'string' ? raw.summary.replace(/https?:\/\/\S+/g, '').slice(0, 140) : '',
  };
}

export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

async function askGemini(image, env, fetchImpl) {
  const model = /^[a-z0-9.\-]+$/.test(env.geminiModel || '') ? env.geminiModel : DEFAULT_GEMINI_MODEL;
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'x-goog-api-key': env.geminiKey},
    body: JSON.stringify({
      contents: [{parts: [{text: PROMPT}, {inline_data: {mime_type: 'image/jpeg', data: image}}]}],
      generationConfig: {temperature: 0.1, maxOutputTokens: 400, responseMimeType: 'application/json'},
    }),
  });
  if (!response.ok) throw new Error(`gemini ${response.status}`);
  const data = await response.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
  const attrs = normalise(extractJson(text));
  if (!attrs) throw new Error('gemini unreadable');
  return attrs;
}

async function askOpenRouter(image, env, fetchImpl) {
  const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {Authorization: `Bearer ${env.openrouterKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://fabricationintelligence.com', 'X-Title': 'Fabrication Intelligence'},
    body: JSON.stringify({
      model: env.openrouterModel,
      temperature: 0.1,
      max_tokens: 400,
      messages: [{role: 'user', content: [{type: 'text', text: PROMPT}, {type: 'image_url', image_url: {url: `data:image/jpeg;base64,${image}`}}]}],
    }),
  });
  if (!response.ok) throw new Error(`openrouter ${response.status}`);
  const data = await response.json();
  const attrs = normalise(extractJson(data.choices?.[0]?.message?.content));
  if (!attrs) throw new Error('openrouter unreadable');
  return attrs;
}

function limited(ip, now) {
  if (!ip) return false;
  const stamps = (seen.get(ip) || []).filter((time) => now - time < LIMIT.windowMs);
  if (stamps.length >= LIMIT.count) { seen.set(ip, stamps); return true; }
  stamps.push(now);
  seen.set(ip, stamps);
  if (seen.size > 2000) seen.clear();
  return false;
}

export async function handlePhotoMatch(req, {env, fetchImpl = fetch, now = () => Date.now()}) {
  const origin = req.headers.get('origin') || '';
  const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin'};
  if (origins.has(origin)) Object.assign(headers, {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type,apikey', 'Access-Control-Allow-Methods': 'POST,OPTIONS'});
  const reply = (body, status = 200) => new Response(JSON.stringify(body), {status, headers});
  if (!origins.has(origin)) return reply({error: 'Origin not allowed.'}, 403);
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  if (req.method !== 'POST') return reply({error: 'POST required.'}, 405);
  if (!env.publishableKey || req.headers.get('apikey') !== env.publishableKey) return reply({error: 'Website API key required.'}, 401);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply({error: 'Photo is too large.'}, 413);
  let input;
  try { input = JSON.parse(raw); } catch { return reply({error: 'Invalid request.'}, 400); }
  const image = input && typeof input.image === 'string' ? input.image : '';
  if (!/^[A-Za-z0-9+/=]{200,}$/.test(image)) return reply({error: 'Send a JPEG photo as base64.'}, 400);
  if (limited((req.headers.get('x-forwarded-for') || '').split(',')[0].trim(), now())) return reply({error: 'Too many photos. Try again in a few minutes.'}, 429);
  const tries = [];
  if (env.geminiKey) tries.push(['gemini', () => askGemini(image, env, fetchImpl)]);
  if (env.openrouterKey && /^[A-Za-z0-9._\-\/:]+$/.test(env.openrouterModel || '')) tries.push(['openrouter', () => askOpenRouter(image, env, fetchImpl)]);
  if (!tries.length) return reply({error: 'unavailable', reason: 'not_configured'}, 503);
  const failed = [];
  for (const [source, run] of tries) {
    try {
      const attrs = await run();
      if (attrs.contains_person) return reply({error: 'person', message: 'This photo shows a person. Please use a photo of the item only.'}, 422);
      return reply({source, attrs, fallback_used: failed.length > 0});
    } catch (error) {
      failed.push(source);
    }
  }
  return reply({error: 'unavailable', reason: 'upstream', tried: failed}, 503);
}
