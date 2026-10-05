'use strict';

// Public catalogue renderer. The JSON files contain only publishable exports,
// and these checks run again in the browser so stale or malformed rows stay hidden.
(function () {
  const PUBLIC_BASE = 'https://fabricationintelligence.com/';
  const today = () => new Date().toISOString().slice(0, 10);
  const value = (input) => String(input ?? '').trim();
  const isDate = (input) => /^\d{4}-\d{2}-\d{2}$/.test(value(input)) && !Number.isNaN(Date.parse(input));
  const productType = (input) => value(input).toLocaleLowerCase().replace(/[^a-z0-9]/g, '').replace(/([^s])s$/, '$1');

  function safeExternalUrl(input) {
    try {
      const url = new URL(value(input));
      const host = url.hostname.toLowerCase();
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        !host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
        /^(127\.|10\.|192\.168\.|169\.254\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
        /\/(?:login|log-in|signin|sign-in|auth)(?:\/|$)/i.test(url.pathname)) return null;
      return url.href;
    } catch { return null; }
  }

  function safeHttpsExternalUrl(input) {
    const safe = safeExternalUrl(input);
    return safe && new URL(safe).protocol === 'https:' ? safe : null;
  }

  function safePhotoUrl(input) {
    const text = value(input);
    if (/^assets\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp|avif)$/.test(text) && !text.split('/').includes('..')) return text;
    return safeHttpsExternalUrl(text);
  }

  function safePaymentLink(input) {
    const safe = safeHttpsExternalUrl(input);
    if (!safe) return null;
    const url = new URL(safe);
    return ['checkout.stripe.com', 'buy.stripe.com'].includes(url.hostname.toLowerCase()) && url.pathname.length > 1 ? safe : null;
  }

  function sameMaker(report, maker) {
    if (value(report?.maker?.name).toLocaleLowerCase() !== value(maker?.name).toLocaleLowerCase()) return false;
    const reportUrl = safeExternalUrl(report?.maker?.website);
    const makerUrl = safeExternalUrl(maker?.website);
    if (!reportUrl || !makerUrl) return false;
    const host = (url) => new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return host(reportUrl) === host(makerUrl);
  }

  function isApprovedReport(report, maker) {
    const reviewer = report?.humanReviewer;
    const score = report?.score;
    return report?.status === 'approved'
      && value(report?.id) !== ''
      && sameMaker(report, maker)
      && value(reviewer?.id) !== ''
      && value(reviewer?.name) !== ''
      && reviewer?.role === 'human_reviewer'
      && isDate(value(reviewer?.approvedAt).slice(0, 10))
      && isDate(report?.dateChecked)
      && score && (score.value === null || (Number.isFinite(score.value) && score.value >= 0 && score.value <= 100))
      && Array.isArray(score.breakdown)
      && score.provisional === true
      && score.breakdown.some((part) => part.key === 'buyerExperience' && part.assessed === false)
      && Array.isArray(report.sources)
      && report.sources.length > 0
      && report.sources.every((source) => source?.access === 'public' && safeExternalUrl(source?.url));
  }

  function hasCurrentProof(report) {
    const currentCertificate = Array.isArray(report?.certificates) && report.certificates.some((certificate) =>
      certificate.status === 'Verified'
      && certificate.registerCheck?.result === 'found'
      && certificate.humanVerification?.reviewer?.id
      && certificate.humanVerification?.checkedAt
      && safeExternalUrl(certificate.registerUrl)
      && isDate(certificate.expiryDate)
      && certificate.expiryDate >= today());
    const currentTest = Array.isArray(report?.testReports) && report.testReports.some((testReport) =>
      testReport.status === 'Verified'
      && testReport.accreditationCheck?.result === 'found'
      && testReport.humanVerification?.reviewer?.id
      && testReport.humanVerification?.checkedAt
      && safeExternalUrl(testReport.accreditationUrl)
      && (testReport.accreditationExpiryDate === null || (isDate(testReport.accreditationExpiryDate) && testReport.accreditationExpiryDate >= today())));
    return Boolean(currentCertificate || currentTest);
  }

  function isCurrentVerifiedReport(report, maker) {
    return report?.decision === 'verified'
      && report?.verificationCurrent === true
      && Number.isFinite(report?.score?.value)
      && isApprovedReport(report, maker)
      && hasCurrentProof(report);
  }

  function isPublishableProduct(product, maker, report) {
    return ['Approved', 'Live'].includes(product?.status)
      && product?.photoRights === 'Approved'
      && value(product?.name) !== ''
      && value(product?.makerId) !== ''
      && product.makerId === maker?.id
      && Boolean(productType(product?.category))
      && productType(product?.category) === productType(report?.maker?.productType)
      && value(product?.reportId) !== ''
      && product.reportId === report?.id
      && Boolean(safePhotoUrl(product?.photoUrl))
      && isCurrentVerifiedReport(report, maker);
  }

  const rules = { isApprovedReport, isCurrentVerifiedReport, isPublishableProduct, safeExternalUrl, safePhotoUrl, safePaymentLink };
  if (typeof module !== 'undefined' && module.exports) module.exports = rules;
  if (typeof document === 'undefined') return;

  const scriptUrl = document.currentScript?.src || PUBLIC_BASE + 'catalog.js';
  const dataUrl = (name) => new URL(`data/${name}.json`, scriptUrl).href;
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = value(text);
    return node;
  };
  const append = (parent, ...children) => { children.forEach((child) => parent.append(child)); return parent; };
  const externalLink = (url, label) => {
    const safe = safeExternalUrl(url);
    if (!safe) return null;
    const link = el('a', '', label);
    link.href = safe;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  };

  function empty(container, message) {
    const notice = el('p', 'catalog-empty', message);
    notice.setAttribute('role', 'status');
    container.replaceChildren(notice);
  }

  function scoreLabel(report) {
    const amount = report.score.value;
    return amount === null ? `${report.score.reason || 'Insufficient evidence'} · Provisional` : `FI Score ${amount}/100 · Provisional`;
  }

  function appendScore(parent, report) {
    append(parent, el('p', 'catalog-card__score', scoreLabel(report)));
    const coverage = Number(report.score.coveragePercent);
    if (Number.isFinite(coverage) && coverage >= 0 && coverage <= 100) {
      append(parent, el('p', 'catalog-score-note', `Evidence coverage: ${coverage}%. Buyer experience remains unscored until verified purchase reviews exist.`));
    } else {
      append(parent, el('p', 'catalog-score-note', 'Buyer experience remains unscored until verified purchase reviews exist.'));
    }
  }

  function sourceList(report) {
    const list = el('ul', 'catalog-sources');
    report.sources.forEach((source) => {
      const link = externalLink(source.url, source.title || new URL(source.url).hostname);
      if (!link) return;
      const item = el('li');
      append(item, link);
      if (isDate(value(source.checkedAt).slice(0, 10))) append(item, el('small', '', ` · checked ${value(source.checkedAt).slice(0, 10)}`));
      append(list, item);
    });
    return list;
  }

  function scoreBreakdown(report) {
    const list = el('ul', 'catalog-breakdown');
    report.score.breakdown.forEach((part) => {
      if (!part || !value(part.key)) return;
      const weight = Number.isFinite(Number(part.weight)) ? ` · ${part.weight}% of rubric` : '';
      const key = value(part.key).replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
      const item = el('li');
      append(item, el('strong', '', `${key}${weight}`));
      if (part.key === 'buyerExperience' && !part.assessed) {
        append(item, el('p', '', 'No verified purchase reviews yet; this category is not scored.'));
      } else {
        const checked = Number(part.assessedWeight);
        const possible = Number(part.weight);
        const coverage = Number.isFinite(checked) && Number.isFinite(possible) ? `${checked} of ${possible} weighted points assessed` : value(part.outcome).replaceAll('_', ' ');
        append(item, el('p', '', coverage));
      }
      if (Array.isArray(part.components) && part.components.length) {
        const checks = el('ul');
        part.components.forEach((component) => {
          const label = value(component.key).replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
          const outcome = component.outcome === 'not_found' ? 'Not found; not a failure' : value(component.outcome).replaceAll('_', ' ') || 'Not checked';
          append(checks, el('li', '', `${label}: ${outcome}${component.summary ? `. ${component.summary}` : ''}`));
        });
        append(item, checks);
      }
      append(list, item);
    });
    return list;
  }

  function certificateList(report) {
    if (!Array.isArray(report.certificates) || report.certificates.length === 0) return null;
    const section = el('section', 'catalog-certificates');
    append(section, el('h3', '', 'Certificate checks'));
    const list = el('ul');
    report.certificates.forEach((certificate) => {
      const expired = isDate(certificate.expiryDate) && certificate.expiryDate < today();
      const verified = certificate.status === 'Verified' && !expired && certificate.registerCheck?.result === 'found' && Boolean(certificate.humanVerification?.reviewer?.id) && Boolean(certificate.humanVerification?.checkedAt) && Boolean(safeExternalUrl(certificate.registerUrl));
      const status = expired ? 'Expired' : verified ? 'Verified' : 'Not verified';
      const item = el('li');
      append(item, el('span', '', `${value(certificate.type) || 'Certificate'}${certificate.number ? ` ${value(certificate.number)}` : ''} · ${status}`));
      const register = externalLink(certificate.registerUrl, 'Issuer register');
      if (register) append(item, register);
      append(list, item);
    });
    return append(section, list);
  }

  function testReportList(report) {
    if (!Array.isArray(report.testReports) || report.testReports.length === 0) return null;
    const section = el('section', 'catalog-test-reports');
    append(section, el('h3', '', 'Australian test checks'));
    const list = el('ul');
    report.testReports.forEach((testReport) => {
      const expired = isDate(testReport.accreditationExpiryDate) && testReport.accreditationExpiryDate < today();
      const verified = testReport.status === 'Verified' && !expired && testReport.accreditationCheck?.result === 'found' && Boolean(testReport.humanVerification?.reviewer?.id) && Boolean(testReport.humanVerification?.checkedAt) && Boolean(safeExternalUrl(testReport.accreditationUrl));
      const status = expired ? 'Expired' : verified ? 'Verified' : 'Not verified';
      const item = el('li');
      append(item, el('span', '', `${value(testReport.type) || 'Test report'}${testReport.number ? ` ${value(testReport.number)}` : ''} · ${status}`));
      const lab = externalLink(testReport.accreditationUrl, 'Lab accreditation');
      if (lab) append(item, lab);
      append(list, item);
    });
    return append(section, list);
  }

  function productCard(product, maker, report) {
    const card = el('article', 'catalog-card');
    const imageLink = el('a', 'catalog-card__image');
    imageLink.href = `product.html?id=${encodeURIComponent(product.id)}`;
    const photo = el('img');
    photo.src = safePhotoUrl(product.photoUrl);
    photo.alt = `${product.name} by ${maker.name}`;
    photo.loading = 'lazy';
    append(imageLink, photo);
    const body = el('div', 'catalog-card__body');
    append(body, el('p', 'catalog-card__meta', [product.category, product.material].filter(Boolean).join(' · ')));
    const heading = el('h3');
    const link = el('a', '', product.name);
    link.href = imageLink.href;
    append(heading, link);
    append(body, heading, el('p', '', `By ${maker.name}`));
    appendScore(body, report);
    if (product.usdPrice) append(body, el('p', 'catalog-card__price', `USD ${product.usdPrice} · indicative; confirm with maker`));
    append(body, el('a', 'catalog-card__cta', 'View product and evidence →'));
    body.lastChild.href = imageLink.href;
    return append(card, imageLink, body);
  }

  function detailField(list, label, content) {
    if (!content || (Array.isArray(content) && content.length === 0)) return;
    const item = el('div');
    append(item, el('dt', '', label), el('dd', '', Array.isArray(content) ? content.join(', ') : content));
    append(list, item);
  }

  function productDetail(product, maker, report) {
    const article = el('article', 'catalog-detail');
    const image = el('img');
    image.src = safePhotoUrl(product.photoUrl);
    image.alt = `${product.name} by ${maker.name}`;
    const imageFrame = append(el('div', 'catalog-detail__image'), image);
    const content = el('div', 'catalog-detail__content');
    append(content, el('p', 'catalog-card__meta', product.category), el('h2', '', product.name), el('p', '', `Made by ${maker.name}`));
    appendScore(content, report);
    if (product.storyEn) append(content, el('p', 'catalog-detail__story', product.storyEn));
    if (product.storyZh) {
      const bilingual = el('details');
      append(bilingual, el('summary', '', '中文故事'), el('p', '', product.storyZh));
      append(content, bilingual);
    }
    const specs = el('dl', 'catalog-detail__specs');
    detailField(specs, 'Material', product.material);
    detailField(specs, 'Finishes', product.finishes);
    detailField(specs, 'Sizes', product.sizes);
    detailField(specs, 'Indicative price', product.usdPrice ? `USD ${product.usdPrice}; confirm current quote and delivery costs` : 'Ask the maker');
    detailField(specs, 'Minimum order', product.moq);
    if (product.deliveryTime && product.deliveryTimeConfirmed === true) detailField(specs, 'Confirmed delivery time', product.deliveryTime);
    append(content, specs);
    const seller = externalLink(product.productUrl || maker.website, 'View maker’s product page ↗');
    if (seller) append(content, seller);
    const paymentLink = safePaymentLink(product.paymentLink);
    if (product.checkoutReady === true && paymentLink) {
      const buy = externalLink(paymentLink, 'Buy securely ↗');
      buy.className = 'catalog-detail__buy';
      append(content, buy);
    }
    const evidence = el('section', 'catalog-detail__evidence');
    append(evidence, el('h2', '', 'Why we trust this maker'));
    if (report.verdict) append(evidence, el('p', '', report.verdict));
    append(evidence, el('p', 'catalog-score-note', `Checked ${report.dateChecked}. Approved by ${report.humanReviewer.name} on ${value(report.humanReviewer.approvedAt).slice(0, 10)}.`));
    append(evidence, el('h3', '', 'Score breakdown'), scoreBreakdown(report), el('h3', '', 'Public sources'), sourceList(report));
    const certificates = certificateList(report);
    if (certificates) append(evidence, certificates);
    const testReports = testReportList(report);
    if (testReports) append(evidence, testReports);
    append(content, evidence);
    const origin = product.origin;
    if (origin && (origin.town || origin.craft || origin.materials || (origin.distanceToMelbourneKm !== null && origin.distanceToMelbourneKm !== undefined && value(origin.distanceToMelbourneKm) !== ''))) {
      const story = el('section', 'catalog-origin');
      append(story, el('h3', '', 'Origin story'));
      const facts = el('dl');
      detailField(facts, 'Maker', maker.name);
      detailField(facts, 'Town', origin.town);
      detailField(facts, 'Craft', origin.craft);
      detailField(facts, 'Materials', origin.materials || product.material);
      if (Number.isFinite(Number(origin.distanceToMelbourneKm)) && Number(origin.distanceToMelbourneKm) >= 0 && value(origin.distanceToMelbourneKm) !== '') {
        detailField(facts, 'Distance to Melbourne', `${origin.distanceToMelbourneKm} km`);
      }
      append(story, facts);
      append(content, story);
    }
    return append(article, imageFrame, content);
  }

  async function loadJson(name) {
    const response = await fetch(dataUrl(name), { cache: 'no-store' });
    if (!response.ok) throw new Error(`${name}.json returned ${response.status}`);
    const result = await response.json();
    if (!Array.isArray(result)) throw new Error(`${name}.json must be an array`);
    return result;
  }

  async function renderCatalogue() {
    const shop = document.querySelector('#shop-products');
    const detail = document.querySelector('#product-detail');
    const makers = document.querySelector('#maker-list');
    if (!shop && !detail && !makers) return;
    try {
      const [products, makerRows, reports] = await Promise.all(['products', 'makers', 'reports'].map(loadJson));
      const makerById = new Map(makerRows.map((maker) => [maker.id, maker]));
      const reportById = new Map(reports.map((report) => [report.id, report]));
      const visible = products.filter((product) => isPublishableProduct(product, makerById.get(product.makerId), reportById.get(product.reportId)));
      visible.sort((a, b) => (reportById.get(b.reportId).score.value ?? -1) - (reportById.get(a.reportId).score.value ?? -1) || value(a.name).localeCompare(value(b.name)));
      if (shop) {
        if (visible.length > 0) shop.replaceChildren(...visible.map((product) => productCard(product, makerById.get(product.makerId), reportById.get(product.reportId))));
      }
      if (detail) {
        const params = new URLSearchParams(location.search);
        const id = params.get('id') || params.get('product');
        const product = visible.find((item) => item.id === id);
        if (id && !product) empty(detail, 'This product is not published yet. Explore the shop for available products.');
        else if (product) detail.replaceChildren(productDetail(product, makerById.get(product.makerId), reportById.get(product.reportId)));
      }
      if (makers) {
        const directory = makerRows.map((maker) => ({
          maker,
          reports: (Array.isArray(maker.reportIds) ? maker.reportIds : [])
            .map((id) => reportById.get(id))
            .filter((report) => isCurrentVerifiedReport(report, maker))
            .sort((a, b) => b.dateChecked.localeCompare(a.dateChecked)),
        })).filter((entry) => entry.reports.length > 0);
        if (directory.length > 0) makers.replaceChildren(...directory.map(({ maker, reports: makerReports }) => {
          const itemCount = visible.filter((product) => product.makerId === maker.id).length;
          const card = el('article', 'maker-card');
          append(card, el('h2', '', maker.name));
          append(card, el('p', 'catalog-score-note', `${itemCount} approved ${itemCount === 1 ? 'product' : 'products'} listed`));
          makerReports.forEach((report) => {
            const section = el('section', 'maker-card__report');
            append(section, el('h3', '', report.maker.productType));
            appendScore(section, report);
            if (report.verdict) append(section, el('p', '', report.verdict));
            append(section, el('p', 'catalog-score-note', `Checked ${report.dateChecked} · human approved ${value(report.humanReviewer.approvedAt).slice(0, 10)}`));
            append(section, el('h4', '', 'Score breakdown'), scoreBreakdown(report), el('h4', '', 'Public sources'), sourceList(report));
            append(card, section);
          });
          const website = externalLink(maker.website, 'Maker website ↗');
          if (website) append(card, website);
          return card;
        }));
      }
    } catch (error) {
      console.error('Catalogue could not load', error);
      if (shop) empty(shop, 'The catalogue is unavailable right now. Please try again later.');
      if (detail) empty(detail, 'This product is unavailable right now. Please try again later.');
      if (makers) empty(makers, 'Maker reports are unavailable right now. Please try again later.');
    }
  }

  renderCatalogue();
})();
