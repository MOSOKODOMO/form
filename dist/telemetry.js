/* GA4: consent first, public pages only, fixed event names and no form contents. */
(() => {
  'use strict';
  const config = window.FI_ANALYTICS || {};
  const measurementId = config.measurementId || '';
  const consentKey = 'fi.analytics.consent.v1';
  const eventNames = new Set(['shop_open', 'product_open', 'maker_open', 'partner_open', 'checkout_click', 'feedback_submit', 'message_view', 'message_cta_click', 'generate_lead']);
  const pageNames = {
    '/': 'Home', '/index.html': 'Home', '/shop.html': 'Shop', '/product.html': 'Product',
    '/rankings.html': 'Rankings', '/partner.html': 'Partner', '/verified-makers.html': 'Makers',
    '/how-it-works.html': 'How it works', '/services.html': 'Services', '/reviews.html': 'Product reviews', '/pricing.html': 'Product reviews',
    '/about.html': 'About', '/contact.html': 'Work with us', '/feedback.html': 'Feedback',
    '/windows.html': 'Windows', '/glass-guide.html': 'Glass guide', '/builders.html': 'Builders',
    '/privacy.html': 'Privacy', '/terms.html': 'Terms', '/shipping.html': 'Shipping', '/returns.html': 'Returns',
  };
  let started = false, consenting = false, messageSeen = false, observer, panel;
  const pathname = window.location?.pathname || '';
  const publicPage = Object.hasOwn(pageNames, pathname);
  const production = ['fabricationintelligence.com', 'www.fabricationintelligence.com'].includes(window.location?.hostname);
  const validId = /^G-[A-Z0-9]{5,20}$/.test(measurementId);
  const readChoice = () => { try { return window.localStorage.getItem(consentKey); } catch { return null; } };
  const saveChoice = value => { try { window.localStorage.setItem(consentKey, value); } catch {} };
  const experiment = config.experiment || {};
  const validLabel = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(value);
  const variants = experiment.variants || {};
  const experimentReady = validLabel(experiment.id) && validLabel(experiment.defaultVariant) && Object.hasOwn(variants, experiment.defaultVariant);
  let variant = experimentReady ? experiment.defaultVariant : null;
  const experimentKey = `fi.message.${experiment.id}`;
  if (experimentReady) {
    try {
      const saved = readChoice() === 'granted' ? window.sessionStorage.getItem(experimentKey) : null;
      const requested = new URLSearchParams(window.location.search).get('message_variant');
      const candidate = requested || saved;
      if (validLabel(candidate) && Object.hasOwn(variants, candidate)) variant = candidate;
    } catch {}
    const headline = document.querySelector?.('[data-message-headline]');
    const description = document.querySelector?.('[data-message-description]');
    if (headline && typeof variants[variant]?.headline === 'string') headline.textContent = variants[variant].headline;
    if (description && typeof variants[variant]?.description === 'string') description.textContent = variants[variant].description;
  }
  const safePage = () => ({page_location: `https://fabricationintelligence.com${pathname}`, page_title: pageNames[pathname], page_referrer: ''});
  window.fiTrackEvent = (name, details = {}) => {
    if (!started || !consenting || !eventNames.has(name)) return false;
    const parameters = safePage();
    if (experimentReady && variant) { parameters.experiment_id = experiment.id; parameters.message_variant = variant; }
    if (name === 'message_cta_click' && ['shop', 'how_it_works'].includes(details.cta)) parameters.cta = details.cta;
    if (name === 'generate_lead' && ['contact_home', 'contact_page'].includes(details.form_name)) parameters.form_name = details.form_name;
    window.gtag('event', name, parameters);
    return true;
  };
  function observeMessage() {
    if (messageSeen) return;
    const target = document.querySelector('[data-message-test]');
    if (!target || !experimentReady || !window.IntersectionObserver) return;
    observer?.disconnect();
    observer = new window.IntersectionObserver(entries => {
      if (messageSeen || !consenting || !entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return;
      if (window.fiTrackEvent('message_view')) { messageSeen = true; observer.disconnect(); }
    }, {threshold: 0.5});
    observer.observe(target);
  }
  function start() {
    consenting = true;
    window[`ga-disable-${measurementId}`] = false;
    if (experimentReady) { try { window.sessionStorage.setItem(experimentKey, variant); } catch {} }
    if (started) { window.gtag('consent', 'update', {analytics_storage: 'granted'}); observeMessage(); return; }
    started = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {...safePage(), send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: 60 * 60 * 24 * 90});
    window.gtag('event', 'page_view', safePage());
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.append(script);
    const pageEvents = {'/shop.html':'shop_open', '/product.html':'product_open', '/verified-makers.html':'maker_open', '/partner.html':'partner_open'};
    if (pageEvents[pathname]) window.fiTrackEvent(pageEvents[pathname]);
    observeMessage();
  }
  function withdraw() {
    consenting = false;
    observer?.disconnect();
    window[`ga-disable-${measurementId}`] = true;
    if (started) window.gtag('consent', 'update', {analytics_storage: 'denied'});
    try { window.sessionStorage.removeItem(experimentKey); } catch {}
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.trim().split('=')[0];
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of ['', '; domain=fabricationintelligence.com', '; domain=.fabricationintelligence.com']) document.cookie = `${name}=; Max-Age=0; path=/${domain}; SameSite=Lax`;
    }
  }
  function choose(value) {
    saveChoice(value);
    if (value === 'granted') start(); else withdraw();
    panel?.remove(); panel = null;
    document.querySelector('[data-analytics-choice]')?.focus({preventScroll: true});
  }
  function showChoice() {
    if (panel) { panel.querySelector('button')?.focus(); return; }
    panel = document.createElement('section');
    panel.className = 'analytics-consent';
    panel.setAttribute('aria-label', 'Optional website analytics');
    const heading = document.createElement('strong'); heading.textContent = 'Help us understand what works.';
    const copy = document.createElement('p'); copy.textContent = 'Allow Google Analytics to measure page visits, selected link clicks and successful enquiries? Optional analytics cookies are off until you choose. Forms and accounts work either way.';
    const privacy = document.createElement('a'); privacy.href = 'privacy.html#analytics'; privacy.textContent = 'How we use analytics';
    const buttons = document.createElement('div');
    for (const [label, value] of [['Allow analytics', 'granted'], ['No thanks', 'denied']]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => choose(value)); buttons.append(button);
    }
    panel.append(heading, copy, privacy, buttons); document.body.append(panel);
  }
  // Private flows, preview hosts and an unconfigured ID never load GA or show a banner.
  if (!validId || !publicPage || !production) return;
  const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = 'telemetry.css'; document.head.append(stylesheet);
  const footer = document.querySelector('.site-footer-links');
  if (footer) {
    const settings = document.createElement('button'); settings.type = 'button'; settings.className = 'analytics-settings'; settings.setAttribute('data-analytics-choice', ''); settings.textContent = 'Analytics choices'; settings.addEventListener('click', showChoice); footer.append(settings);
  }
  const choice = readChoice();
  if (choice === 'granted') start(); else if (choice !== 'denied') showChoice();
  document.addEventListener('click', event => {
    const target = event.target;
    if (target?.closest?.('.catalog-detail__buy, .product-buy-button, .shopify-buy')) window.fiTrackEvent('checkout_click');
    const cta = target?.closest?.('[data-message-cta]');
    if (cta && experimentReady) window.fiTrackEvent('message_cta_click', {cta: cta.dataset.messageCta});
  });
  window.addEventListener('storage', event => {
    if (event.key !== consentKey) return;
    if (event.newValue === 'granted') { panel?.remove(); panel = null; start(); } else withdraw();
  });
})();
