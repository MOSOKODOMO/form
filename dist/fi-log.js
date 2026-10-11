/* First-party service logs for Axiom. Fixed event names, page path only, no identifiers, no cookies. */
(() => {
  'use strict';
  const config = window.FI_LOG || {};
  const eventNames = new Set(['page_view', 'js_error', 'checkout_click', 'bug_report_submit']);
  const privatePaths = /^\/(?:auth|account|orders|order-catalogue|commerce-admin|supplier-portal|admin|dashboard|customer|supplier|stage2)\b/;
  const endpointOk = typeof config.endpoint === 'string' && /^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/fi-log$/.test(config.endpoint) && typeof config.publishableKey === 'string' && config.publishableKey.length > 10;
  const nav = window.navigator || {};
  const optedOut = nav.globalPrivacyControl === true || nav.doNotTrack === '1' || window.doNotTrack === '1';
  const pathname = (window.location && window.location.pathname) || '/';
  const production = ['fabricationintelligence.com', 'www.fabricationintelligence.com'].includes(window.location && window.location.hostname);
  const active = endpointOk && !optedOut && production && !privatePaths.test(pathname);
  const sent = new Set();
  window.fiLog = (name, details = {}) => {
    if (!active || !eventNames.has(name)) return false;
    const row = {event: name, path: pathname.slice(0, 120)};
    if (name === 'js_error' && typeof details.message === 'string') row.message = details.message.replace(/https?:\/\/\S+/g, '[url]').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').slice(0, 120);
    const key = name + ':' + (row.message || '');
    if (name !== 'checkout_click' && sent.has(key)) return false;
    sent.add(key);
    if (sent.size > 20) return false;
    try {
      fetch(config.endpoint, {method: 'POST', keepalive: true, headers: {'Content-Type': 'application/json', apikey: config.publishableKey}, body: JSON.stringify(row)}).catch(() => {});
    } catch {}
    return true;
  };
  if (!active) return;
  window.fiLog('page_view');
  window.addEventListener('error', event => window.fiLog('js_error', {message: String(event.message || 'error')}));
  window.addEventListener('unhandledrejection', () => window.fiLog('js_error', {message: 'unhandled promise rejection'}));
  document.addEventListener('click', event => {
    if (event.target && event.target.closest && event.target.closest('.catalog-detail__buy, .product-buy-button, .shopify-buy')) window.fiLog('checkout_click');
  });
})();
