/* Find it from a photo: page wiring. Matching rules live in photo-match.js. */
(() => {
  'use strict';
  const FI = window.FICatalogue;
  const PM = window.FIPhotoMatch;
  const drop = document.querySelector('#find-drop');
  const input = document.querySelector('#find-file');
  const preview = document.querySelector('#find-preview');
  const grid = document.querySelector('#find-grid');
  const status = document.querySelector('#find-status');
  const seen = document.querySelector('#find-seen');
  const exampleBox = document.querySelector('#find-examples');
  if (!FI || !PM || !input || !grid) return;
  let products = [];
  let busy = false;

  const say = (text) => { status.textContent = text; };
  const describeAttrs = (attrs) => {
    const a = PM.cleanAttrs(attrs);
    const parts = [];
    if (a.category) parts.push(FI.categoryName(a.category).toLowerCase());
    if (a.finish) parts.push((FI.FINISHES.find((f) => f.id === a.finish) || {name: a.finish}).name.toLowerCase());
    if (a.size_mm) parts.push(`about ${Math.round(a.size_mm)} mm`);
    if (a.keywords.length) parts.push(a.keywords.slice(0, 3).join(', '));
    return parts.join(', ');
  };

  function showResults(attrs, how) {
    grid.replaceChildren();
    seen.hidden = true;
    const description = describeAttrs(attrs);
    if (attrs && attrs.summary) { seen.textContent = `What the AI saw: ${attrs.summary}`; seen.hidden = false; }
    if (attrs && attrs.is_hardware === false) { say('That does not look like a renovation item. Try a photo of a handle, knob, hook or door fitting.'); return; }
    const matches = PM.matchProducts(attrs, products, FI);
    if (!matches.length) { say(`No close match${description ? ` for ${description}` : ''}. Browse the full shop or ask us to find it.`); return; }
    say(`${matches.length} close match${matches.length === 1 ? '' : 'es'}${description ? ` for ${description}` : ''}. ${how}`);
    matches.forEach(({product, reasons}, index) => {
      const item = window.FIProductCard.card(product, index);
      const why = document.createElement('p');
      why.className = 'find-why';
      why.textContent = reasons.join(' · ');
      item.querySelector('.product-card-body').prepend(why);
      grid.append(item);
    });
  }

  function failure(result) {
    grid.replaceChildren();
    seen.hidden = true;
    if (result.reason === 'person') say(result.message || 'This photo shows a person. Please use a photo of the item only.');
    else if (result.reason === 'Too many photos. Try again in a few minutes.') say(result.reason);
    else say('Photo search is unavailable right now. The free AI quota may be used up. Please try an example below, or browse the shop.');
    exampleBox.classList.add('find-examples--highlight');
  }

  async function handleFile(file) {
    if (busy || !file) return;
    if (!/^image\//.test(file.type)) { say('Please choose an image file.'); return; }
    busy = true;
    drop.classList.add('find-drop--busy');
    exampleBox.classList.remove('find-examples--highlight');
    say('Reading your photo…');
    try {
      const blob = await PM.downscaleToJpeg(file);
      preview.src = URL.createObjectURL(blob);
      preview.hidden = false;
      const result = await PM.describePhoto(blob);
      if (result.ok) showResults(result.attrs, result.fallbackUsed ? 'Described by the backup AI.' : 'Described by Google Gemini.');
      else failure(result);
    } catch (error) {
      say('We could not read that photo. Try a different one, or use an example.');
    } finally {
      busy = false;
      drop.classList.remove('find-drop--busy');
    }
  }

  input.addEventListener('change', () => handleFile(input.files && input.files[0]));
  ['dragenter', 'dragover'].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add('find-drop--over'); }));
  ['dragleave', 'drop'].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove('find-drop--over'); }));
  drop.addEventListener('drop', (event) => handleFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]));

  function buildExamples() {
    exampleBox.replaceChildren();
    PM.EXAMPLES.forEach((example) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'find-example';
      const picture = FI.listedProducts(products).filter((p) => !p.sample).find((p) => p.category === example.attrs.category && FI.finishesOf(p).includes(example.attrs.finish) && p.photo_url);
      if (picture) button.append(window.FIProductImage(picture, {width: 120, height: 150, decorative: true}));
      const label = document.createElement('span');
      label.textContent = example.label;
      button.append(label);
      button.addEventListener('click', () => {
        preview.hidden = true;
        showResults(example.attrs, 'This is an example, so no AI was used.');
        grid.scrollIntoView({behavior: 'smooth', block: 'start'});
      });
      exampleBox.append(button);
    });
  }

  FI.loadProducts().then((list) => { products = Array.isArray(list) ? list : (list && list.products) || []; buildExamples(); }).catch(() => say('The product list could not load. Please refresh the page.'));
})();
