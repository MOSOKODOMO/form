/* Photo search: turns what an AI sees in a photo (type, finish, size) into a ranked list of catalogue products.
   Pure functions, so Node tests can load them. The AI call itself lives in find.js. */
(() => {
  'use strict';
  const ENDPOINT = 'https://dszagdjnymxalpwamjyh.supabase.co/functions/v1/fi-photo-match';
  const KEY = 'sb_publishable_Dm6trfXjIO0C1r9A71PbNw_Q_PF4OM5';
  const MAX_RESULTS = 6;
  const MIN_SCORE = 3;
  // Words a vision model may use, mapped to the catalogue categories.
  const WORD_CATEGORY = {handle: 'handles', handles: 'handles', pull: 'handles', 't-bar': 'handles', knob: 'knobs', knobs: 'knobs', hook: 'bathroom', hooks: 'bathroom', towel: 'bathroom', robe: 'bathroom', lever: 'doors', stop: 'doors', door: 'doors'};
  const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function cleanAttrs(attrs) {
    const input = attrs && typeof attrs === 'object' ? attrs : {};
    const keywords = (Array.isArray(input.keywords) ? input.keywords : []).filter((word) => typeof word === 'string').map((word) => word.toLowerCase().trim()).filter((word) => word.length >= 3).slice(0, 6);
    let category = typeof input.category === 'string' ? input.category : null;
    if (!category) category = keywords.map((word) => WORD_CATEGORY[word]).find(Boolean) || null;
    const finish = ['black', 'brass', 'silver'].includes(input.finish) ? input.finish : null;
    const size = Number(input.size_mm);
    return {category, finish, keywords, size_mm: Number.isFinite(size) && size > 0 ? size : null, is_hardware: input.is_hardware !== false};
  }

  // Scores each buyable catalogue product against the photo's attributes. FI is window.FICatalogue.
  function matchProducts(attrs, products, FI) {
    const a = cleanAttrs(attrs);
    if (!a.is_hardware) return [];
    const list = FI.listedProducts(products).filter((product) => !product.sample);
    const results = [];
    for (const product of list) {
      let score = 0;
      const reasons = [];
      if (a.category && product.category === a.category) { score += 6; reasons.push(`Same type: ${FI.categoryName(product.category).toLowerCase()}`); }
      if (a.finish && FI.finishesOf(product).includes(a.finish)) { score += 3; reasons.push(`Same finish: ${(FI.FINISHES.find((f) => f.id === a.finish) || {name: a.finish}).name.toLowerCase()}`); }
      const text = `${product.product} ${product.material || ''}`.toLowerCase();
      const hits = a.keywords.filter((word) => text.includes(word)).slice(0, 3);
      if (hits.length) { score += hits.length; reasons.push(`Looks like: ${hits.join(', ')}`); }
      if (a.size_mm) {
        const sizeText = `${product.product} ${(Array.isArray(product.sizes) ? product.sizes : []).join(' ')}`;
        if (new RegExp(`\\b${escapeRegExp(String(Math.round(a.size_mm)))}\\s*mm\\b`, 'i').test(sizeText)) { score += 2; reasons.push(`Size: ${Math.round(a.size_mm)} mm`); }
      }
      if (score >= MIN_SCORE) results.push({product, score: score + (FI.canBuyNow(product) ? 0.5 : 0), reasons});
    }
    return results.sort((x, y) => y.score - x.score || x.product.product.localeCompare(y.product.product)).slice(0, MAX_RESULTS);
  }

  // Three example photos that always work, with no AI call. The attributes are what the AI would report for that kind of photo.
  const EXAMPLES = [
    {id: 'black-handle', label: 'Matte black cabinet handle', attrs: {category: 'handles', finish: 'black', keywords: ['handle', 'bar']}},
    {id: 'brass-knob', label: 'Brass drawer knob', attrs: {category: 'knobs', finish: 'brass', keywords: ['knob']}},
    {id: 'brass-hook', label: 'Brass bathroom hook', attrs: {category: 'bathroom', finish: 'brass', keywords: ['hook']}},
  ];

  // A shrunk JPEG also drops any location data stored in the original photo.
  function downscaleToJpeg(file, maxSide = 1024, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), 'image/jpeg', quality);
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      image.src = url;
    });
  }

  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(blob);
  });

  async function describePhoto(blob, fetchImpl = fetch, timeoutMs = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(ENDPOINT, {method: 'POST', headers: {'Content-Type': 'application/json', apikey: KEY}, body: JSON.stringify({image: await blobToBase64(blob)}), signal: controller.signal});
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.attrs) return {ok: true, source: data.source, attrs: data.attrs, fallbackUsed: Boolean(data.fallback_used)};
      return {ok: false, reason: data.error || 'error', message: data.message || ''};
    } catch (error) {
      return {ok: false, reason: 'network', message: ''};
    } finally {
      clearTimeout(timer);
    }
  }

  const api = {ENDPOINT, MAX_RESULTS, MIN_SCORE, EXAMPLES, cleanAttrs, matchProducts, downscaleToJpeg, describePhoto};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.FIPhotoMatch = api;
})();
