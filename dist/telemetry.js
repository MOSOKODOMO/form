/* Optional GA4 instrumentation. Set a real measurement ID only after the
   property and privacy copy are ready. No ID means no network request. */
(() => {
  'use strict';

  const measurementId = '';
  const allowedEvents = new Set([
    'shop_open',
    'product_open',
    'maker_open',
    'checkout_click',
    'partner_open',
    'feedback_submit',
  ]);

  window.fiTrackEvent = (name) => {
    if (!allowedEvents.has(name) || !/^G-[A-Z0-9]+$/.test(measurementId)) return false;
    window.gtag('event', name);
    return true;
  };

  if (!/^G-[A-Z0-9]+$/.test(measurementId)) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId);

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(script);

  const pageEvents = {
    '/shop.html': 'shop_open',
    '/product.html': 'product_open',
    '/verified-makers.html': 'maker_open',
    '/partner.html': 'partner_open',
  };
  const pageEvent = pageEvents[window.location.pathname];
  if (pageEvent) window.fiTrackEvent(pageEvent);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('.catalog-detail__buy, .product-buy-button, .shopify-buy')) window.fiTrackEvent('checkout_click');
  });
})();
