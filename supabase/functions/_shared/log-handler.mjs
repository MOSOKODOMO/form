// Forwards fixed, non-personal website events to Axiom. The token lives only in the function environment.
const origins = new Set(['https://fabricationintelligence.com', 'https://www.fabricationintelligence.com']);
const events = new Set(['page_view', 'js_error', 'checkout_click', 'bug_report_submit']);
const privatePaths = /^\/(?:auth|account|orders|order-catalogue|commerce-admin|supplier-portal|admin|dashboard|customer|supplier|stage2)\b/;

export async function handleLog(req, {env, fetchImpl = fetch, now = () => new Date()}) {
  const origin = req.headers.get('origin') || '';
  const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin'};
  if (origins.has(origin)) Object.assign(headers, {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type,apikey', 'Access-Control-Allow-Methods': 'POST,OPTIONS'});
  const reply = (body, status = 200) => new Response(JSON.stringify(body), {status, headers});
  if (!origins.has(origin)) return reply({error: 'Origin not allowed.'}, 403);
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  if (req.method !== 'POST') return reply({error: 'POST required.'}, 405);
  if (!env.publishableKey || req.headers.get('apikey') !== env.publishableKey) return reply({error: 'Website API key required.'}, 401);
  const raw = await req.text();
  if (raw.length > 1000) return reply({error: 'Event is too large.'}, 413);
  let input;
  try { input = JSON.parse(raw); } catch { return reply({error: 'Invalid event.'}, 400); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return reply({error: 'Invalid event.'}, 400);
  if (!events.has(input.event)) return reply({error: 'Unknown event.'}, 400);
  const path = typeof input.path === 'string' ? input.path : '';
  if (!/^\/[A-Za-z0-9._\-\/]{0,119}$/.test(path) || privatePaths.test(path)) return reply({error: 'Unknown page.'}, 400);
  // Axiom is optional: without a token and dataset nothing leaves the function.
  if (!env.axiomToken || !env.axiomDataset) return reply({logged: false, reason: 'not_configured'});
  const domain = env.axiomDomain || 'api.axiom.co';
  if (!/^[a-zA-Z0-9.-]+$/.test(domain) || !/^[a-zA-Z0-9_-]+$/.test(env.axiomDataset)) return reply({error: 'Logging is misconfigured.'}, 500);
  const row = {_time: now().toISOString(), event: input.event, path, site: 'fabricationintelligence.com'};
  if (input.event === 'js_error' && typeof input.message === 'string') {
    row.message = input.message.replace(/https?:\/\/\S+/g, '[url]').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').slice(0, 120);
  }
  // The caller's IP address and browser are never forwarded.
  try {
    const response = await fetchImpl(`https://${domain}/v1/ingest/${encodeURIComponent(env.axiomDataset)}`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${env.axiomToken}`, 'Content-Type': 'application/json'},
      body: JSON.stringify([row]),
    });
    if (!response.ok) return reply({logged: false, reason: 'upstream'}, 502);
  } catch { return reply({logged: false, reason: 'upstream'}, 502); }
  return reply({logged: true});
}
