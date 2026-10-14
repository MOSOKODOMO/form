'use strict';
// Room preview: put a product cut-out on a photo of your own room, in the browser.
// The photo is drawn on a canvas on this device. Nothing is uploaded, stored or sent anywhere.
(() => {
  const M = window.FIRoomMath;
  const canvas = document.querySelector('#room-stage');
  if (!M || !canvas) return;
  const context = canvas.getContext('2d');
  const empty = document.querySelector('#room-empty');
  const drop = document.querySelector('#room-drop');
  const fileInput = document.querySelector('#room-file');
  const sampleButton = document.querySelector('#room-sample');
  const choices = document.querySelector('#room-choices');
  const place = document.querySelector('#room-place');
  const sizeInput = document.querySelector('#room-size');
  const rotateInput = document.querySelector('#room-rotate');
  const downloadButton = document.querySelector('#room-download');
  const resetButton = document.querySelector('#room-reset');
  const productLink = document.querySelector('#room-product-link');
  const status = document.querySelector('#room-status');

  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const state = {room: null, item: null, placement: null, drag: null, selected: true, products: []};

  const say = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  };
  const stageSize = () => ({width: canvas.width, height: canvas.height});
  // Stage pixels per on-screen pixel, so handles stay the same size on screen however the canvas is scaled.
  const unit = () => canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
  const aspect = () => (state.item ? state.item.aspect : 1);

  function handleShapes(placement, k) {
    const {resize, rotate} = M.handlePoints(placement, aspect(), 34 * k);
    return {resize, rotate};
  }

  function drawHandles(p, k) {
    const h = p.width * aspect();
    context.save();
    context.translate(p.x, p.y);
    context.rotate(M.toRadians(p.rotation));
    context.lineJoin = 'round';
    const outline = () => context.strokeRect(-p.width / 2, -h / 2, p.width, h);
    context.setLineDash([6 * k, 5 * k]);
    context.strokeStyle = 'rgba(20,26,20,.75)';
    context.lineWidth = 3.5 * k;
    outline();
    context.strokeStyle = '#fafbf8';
    context.lineWidth = 1.6 * k;
    outline();
    context.setLineDash([]);
    // The stalk to the rotate handle.
    context.beginPath();
    context.moveTo(0, -h / 2);
    context.lineTo(0, -h / 2 - 34 * k);
    context.strokeStyle = 'rgba(20,26,20,.75)';
    context.lineWidth = 3.5 * k;
    context.stroke();
    context.strokeStyle = '#fafbf8';
    context.lineWidth = 1.6 * k;
    context.stroke();
    // Rotate dot and resize square.
    context.fillStyle = '#fafbf8';
    context.strokeStyle = '#213d2b';
    context.lineWidth = 2.5 * k;
    context.beginPath();
    context.arc(0, -h / 2 - 34 * k, 9 * k, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.rect(p.width / 2 - 8 * k, h / 2 - 8 * k, 16 * k, 16 * k);
    context.fill();
    context.stroke();
    context.restore();
  }

  function draw({forExport = false} = {}) {
    const {width, height} = stageSize();
    context.clearRect(0, 0, width, height);
    if (!state.room) return;
    context.drawImage(state.room, 0, 0, width, height);
    if (state.item && state.placement) {
      const p = state.placement;
      const h = p.width * state.item.aspect;
      context.save();
      context.translate(p.x, p.y);
      context.rotate(M.toRadians(p.rotation));
      context.shadowColor = 'rgba(18,22,16,.4)';
      context.shadowBlur = Math.max(6, p.width * 0.045);
      context.shadowOffsetY = Math.max(3, p.width * 0.022);
      context.drawImage(state.item.image, -p.width / 2, -h / 2, p.width, h);
      context.restore();
      if (!forExport && state.selected) drawHandles(p, unit());
    }
    if (forExport) {
      const size = Math.max(14, Math.round(height * 0.024));
      const text = 'Fabrication Intelligence room preview. Product not to scale.';
      context.font = `600 ${size}px Arial, sans-serif`;
      const pad = size * 0.6;
      const boxWidth = context.measureText(text).width + pad * 2;
      context.fillStyle = 'rgba(250,251,248,.88)';
      context.fillRect(0, height - size - pad * 2, boxWidth, size + pad * 2);
      context.fillStyle = '#172019';
      context.textBaseline = 'middle';
      context.fillText(text, pad, height - size / 2 - pad);
    }
  }

  function syncControls() {
    const ready = Boolean(state.room);
    const usable = ready && Boolean(state.item);
    place.disabled = !usable;
    downloadButton.disabled = !usable;
    resetButton.disabled = !usable;
    canvas.classList.toggle('is-ready', ready);
    empty.hidden = ready;
    if (usable && state.placement) {
      sizeInput.value = String(Math.round((state.placement.width / M.maxWidth(stageSize())) * 100));
      rotateInput.value = String(Math.round(state.placement.rotation));
    }
    if (state.item) {
      canvas.setAttribute('aria-label', `Your room with the ${state.item.entry.product} on it. Use the arrow keys to move it.`);
    }
  }

  function setPlacement(placement) {
    state.placement = placement;
    syncControls();
    draw();
  }

  function useRoom(source, width, height, label) {
    const fit = M.fitWithin(width, height);
    const buffer = document.createElement('canvas');
    buffer.width = fit.width;
    buffer.height = fit.height;
    buffer.getContext('2d').drawImage(source, 0, 0, fit.width, fit.height);
    state.room = buffer;
    canvas.width = fit.width;
    canvas.height = fit.height;
    state.placement = state.item ? M.startPlacement(stageSize(), state.item.aspect) : null;
    state.selected = true;
    syncControls();
    draw();
    say(state.item ? `${label} is ready. Drag the product where you want it.` : `${label} is ready. Pick a product.`);
  }

  async function decode(file) {
    const viaImage = () => new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
      image.src = url;
    });
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, {imageOrientation: 'from-image'}); } catch { /* fall back */ }
    }
    return viaImage();
  }

  async function loadRoomFile(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { say('Please choose a JPEG, PNG or WebP photo.', true); return; }
    if (file.size > MAX_FILE_BYTES) { say('That photo is over 20 MB. Please choose a smaller one.', true); return; }
    try {
      const source = await decode(file);
      useRoom(source, source.naturalWidth || source.width, source.naturalHeight || source.height, 'Your photo');
      if (source.close) source.close();
    } catch (error) {
      console.warn(error);
      say('We couldn’t read that photo. Try a JPEG or PNG.', true);
    }
  }

  function loadSample() {
    const image = new Image();
    image.onload = () => useRoom(image, image.naturalWidth || 1600, image.naturalHeight || 1000, 'The sample wall');
    image.onerror = () => say('The sample wall didn’t load. Please choose your own photo.', true);
    image.src = 'assets/room/sample-wall.svg';
  }

  function selectProduct(entry) {
    const image = new Image();
    image.onload = () => {
      const ratio = (image.naturalHeight || entry.height) / (image.naturalWidth || entry.width);
      const previous = state.placement;
      state.item = {entry, image, aspect: ratio};
      if (state.room) {
        const next = previous
          ? {...previous, width: M.clamp(previous.width, M.MIN_WIDTH, M.maxWidth(stageSize()))}
          : M.startPlacement(stageSize(), ratio);
        setPlacement(next);
        say(`${entry.product} is on your room. Drag it where you want it.`);
      } else {
        syncControls();
        say(`${entry.product} chosen. Now choose a photo of your room.`);
      }
      productLink.href = `product.html?handle=${encodeURIComponent(entry.handle)}`;
      productLink.hidden = false;
    };
    image.onerror = () => say(`We couldn’t load the picture of ${entry.product}.`, true);
    image.src = entry.cutout;
  }

  function renderChoices(list, wanted) {
    choices.replaceChildren();
    list.forEach((entry, index) => {
      const label = document.createElement('label');
      label.className = 'room-choice-label';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'room-product';
      input.value = entry.handle;
      input.className = 'room-choice-input';
      const card = document.createElement('span');
      card.className = 'room-choice';
      const picture = document.createElement('img');
      picture.src = entry.cutout;
      picture.alt = '';
      picture.width = 72;
      picture.height = Math.max(24, Math.round(72 * (entry.height / entry.width)));
      picture.loading = 'lazy';
      const name = document.createElement('span');
      name.className = 'room-choice-name';
      name.textContent = entry.product;
      card.append(picture, name);
      label.append(input, card);
      input.addEventListener('change', () => selectProduct(entry));
      choices.append(label);
      if ((wanted && entry.handle === wanted) || (!wanted && index === 0)) input.checked = true;
    });
    const picked = list.find((entry) => entry.handle === wanted) || list[0];
    if (picked) selectProduct(picked);
  }

  // ----- pointer and keyboard -----
  function pointerPoint(event) {
    return M.toStagePoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), stageSize());
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!state.room || !state.item || !state.placement) return;
    const point = pointerPoint(event);
    const k = unit();
    const handle = state.selected ? M.hitHandle(point, state.placement, aspect(), 22 * k, 34 * k) : null;
    if (handle) state.drag = {mode: handle};
    else if (M.hitItem(point, state.placement, aspect(), 8 * k)) state.drag = {mode: 'move', dx: state.placement.x - point.x, dy: state.placement.y - point.y};
    else { state.selected = false; draw(); return; }
    state.selected = true;
    try { canvas.setPointerCapture(event.pointerId); } catch { /* the drag still works while the pointer stays over the canvas */ }
    canvas.focus({preventScroll: true});
    event.preventDefault();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!state.room || !state.item || !state.placement) return;
    const point = pointerPoint(event);
    if (!state.drag) {
      const k = unit();
      const handle = state.selected ? M.hitHandle(point, state.placement, aspect(), 22 * k, 34 * k) : null;
      canvas.style.cursor = handle === 'resize' ? 'nwse-resize' : handle === 'rotate' ? 'crosshair' : M.hitItem(point, state.placement, aspect(), 8 * k) ? 'grab' : 'default';
      return;
    }
    if (state.drag.mode === 'move') {
      setPlacement(M.moveTo(state.placement, {x: point.x + state.drag.dx, y: point.y + state.drag.dy}, stageSize()));
    } else if (state.drag.mode === 'resize') {
      setPlacement({...state.placement, width: M.widthFromPointer(point, state.placement, aspect(), stageSize())});
    } else if (state.drag.mode === 'rotate') {
      setPlacement({...state.placement, rotation: M.rotationFromPointer(point, state.placement, !event.shiftKey)});
    }
  });

  const endDrag = (event) => {
    if (!state.drag) return;
    state.drag = null;
    try { if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); } catch { /* nothing to release */ }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('keydown', (event) => {
    if (!state.placement || event.ctrlKey || event.metaKey || event.altKey) return;
    const next = M.nudge(state.placement, event.key, {shift: event.shiftKey, stage: stageSize()});
    if (!next) return;
    event.preventDefault();
    state.selected = true;
    setPlacement(next);
  });
  canvas.addEventListener('focus', () => { state.selected = true; draw(); });

  sizeInput.addEventListener('input', () => {
    if (!state.placement) return;
    const width = M.clamp((Number(sizeInput.value) / 100) * M.maxWidth(stageSize()), M.MIN_WIDTH, M.maxWidth(stageSize()));
    state.placement = {...state.placement, width};
    draw();
  });
  rotateInput.addEventListener('input', () => {
    if (!state.placement) return;
    state.placement = {...state.placement, rotation: Number(rotateInput.value)};
    draw();
  });

  fileInput.addEventListener('change', () => { loadRoomFile(fileInput.files && fileInput.files[0]); fileInput.value = ''; });
  sampleButton.addEventListener('click', loadSample);
  resetButton.addEventListener('click', () => {
    if (!state.item) return;
    state.selected = true;
    setPlacement(M.startPlacement(stageSize(), state.item.aspect));
    say('Back to the start.');
  });

  downloadButton.addEventListener('click', () => {
    if (!state.room || !state.item) return;
    draw({forExport: true});
    canvas.toBlob((blob) => {
      draw();
      if (!blob) { say('We couldn’t save the picture. Try a screenshot instead.', true); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'fi-room-preview.png';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      say('Saved. Check your downloads.');
    }, 'image/png');
  });

  // Drop a photo on the stage.
  ['dragenter', 'dragover'].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add('is-dropping'); }));
  ['dragleave', 'drop'].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove('is-dropping'); }));
  drop.addEventListener('drop', (event) => loadRoomFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]));

  window.addEventListener('resize', () => draw());

  // ----- products -----
  const valid = (entry) => entry && typeof entry.handle === 'string' && typeof entry.product === 'string'
    && typeof entry.cutout === 'string' && /^assets\/[A-Za-z0-9._\-\/]+\.webp$/.test(entry.cutout)
    && !entry.cutout.includes('..') && Number(entry.width) > 0 && Number(entry.height) > 0;

  fetch('data/room-products.json', {cache: 'no-cache'})
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((list) => {
      state.products = (Array.isArray(list) ? list : []).filter(valid);
      if (!state.products.length) throw new Error('no products');
      const wanted = new URLSearchParams(window.location.search).get('handle');
      renderChoices(state.products, wanted);
    })
    .catch((error) => {
      console.warn('Room products did not load:', error);
      choices.replaceChildren();
      const note = document.createElement('p');
      note.className = 'room-small';
      note.textContent = 'We couldn’t load the products. Please refresh the page.';
      choices.append(note);
    });

  syncControls();
})();
