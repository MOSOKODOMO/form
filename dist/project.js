'use strict';
// Project list page: shows the saved products, lets the visitor set quantities and options, and sends the list as one quote request.
(() => {
  const FI = window.FICatalogue, store = window.FIProject;
  const itemsNode = document.querySelector('#project-items');
  const empty = document.querySelector('#project-empty');
  const panel = document.querySelector('#project-panel');
  const sendPanel = document.querySelector('[data-send-panel]');
  const summary = document.querySelector('#project-summary');
  const form = document.querySelector('#project-form');
  const status = document.querySelector('#project-status');
  const errorNode = document.querySelector('#project-error');
  let byHandle = new Map();

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function row(entry) {
    const product = byHandle.get(entry.h);
    const item = el('li', 'project-item');
    const image = el('img');
    image.alt = '';
    image.width = 72; image.height = 90;
    if (product) image.src = product.photo_url;
    const main = el('div');
    const title = el('h3');
    if (product) { const link = el('a', '', product.product); link.href = FI.productUrl(product); title.append(link); }
    else title.textContent = 'This product is no longer listed';
    main.append(title);
    if (product) main.append(el('p', '', `${FI.cardPrice(product).value}${FI.cardPrice(product).unit ? ' ' + FI.cardPrice(product).unit : ''}`));
    const labelText = 'Size or finish you want';
    const label = el('label', '', labelText);
    const input = el('input');
    input.type = 'text'; input.maxLength = 60; input.value = entry.o; input.placeholder = 'For example 128 mm, matte black';
    input.addEventListener('change', () => store.update(entry.h, {o: input.value.trim()}));
    label.append(input); main.append(label);
    const side = el('div', 'project-item-side');
    const qtyLabel = el('label', '', 'Quantity');
    const qty = el('input', 'project-qty');
    qty.type = 'number'; qty.min = '1'; qty.max = '999'; qty.value = String(entry.q);
    qty.addEventListener('change', () => store.update(entry.h, {q: qty.value}));
    qtyLabel.append(qty);
    const remove = el('button', 'project-remove', 'Remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${product ? product.product : 'this product'} from the list`);
    remove.addEventListener('click', () => store.remove(entry.h));
    side.append(qtyLabel, remove);
    item.append(image, main, side);
    return item;
  }

  function render() {
    const entries = store.items();
    empty.hidden = entries.length > 0;
    panel.hidden = entries.length === 0;
    sendPanel.hidden = entries.length === 0;
    // Keep what the visitor is typing: only rebuild the rows when the list itself changed.
    const signature = entries.map((entry) => entry.h).join('|');
    if (itemsNode.dataset.signature !== signature) {
      itemsNode.replaceChildren(...entries.map(row));
      itemsNode.dataset.signature = signature;
    }
    const units = entries.reduce((sum, entry) => sum + entry.q, 0);
    summary.textContent = entries.length ? `${entries.length} product${entries.length === 1 ? '' : 's'}, ${units} item${units === 1 ? '' : 's'} in total. Prices shown are the lowest option; the quote confirms the exact price for what you choose.` : '';
  }

  function buildMessage(values) {
    const lines = store.items().map((entry, index) => {
      const product = byHandle.get(entry.h);
      const name = product ? product.product.slice(0, 70) : entry.h;
      const from = product ? FI.cardPrice(product).value : '';
      return `${index + 1}. ${name} | qty ${entry.q} | options: ${entry.o || 'not chosen'}${from ? ` | listed ${from}` : ''} | ${entry.h.slice(0, 60)}`;
    });
    return [
      `PROJECT LIST (${lines.length} products)`,
      ...lines,
      '',
      `Delivery to: ${values.place || 'not given'}`,
      `Trade buyer: ${values.trade ? 'yes, wants trade pricing' : 'no'}`,
      `Note: ${values.note || 'none'}`,
    ].join('\n');
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const value = (name) => String(data.get(name) || '').trim();
    if (value('website')) return;
    errorNode.hidden = true;
    const values = {name: value('name'), email: value('email'), place: value('place'), trade: data.get('trade') === 'yes', note: value('note')};
    const button = form.querySelector('button[type="submit"]');
    const message = buildMessage(values);
    button.disabled = true;
    status.textContent = 'Sending…';
    try {
      const result = await window.FISend.sendEnquiry({kind: 'Project list', subject: `FI project list (${store.count()} products) from ${values.name}`, name: values.name, email: values.email, product: `Project list: ${store.count()} products`, message});
      store.clear();
      form.hidden = true;
      const thanks = document.querySelector('#project-thanks');
      document.querySelector('#project-thanks-text').textContent = result.notified ? 'Your list is with the team and they have been emailed. We reply within 48 hours.' : 'Your list is saved with the team. The email notice could not be confirmed, so you do not need to send it again. We reply within 48 hours.';
      thanks.hidden = false;
      sendPanel.hidden = false;
      empty.hidden = true;
      thanks.focus();
      window.fiTrackEvent?.('generate_lead', {form_name: 'contact_page'});
    } catch (error) {
      errorNode.textContent = `${error.message || 'We could not send your list.'} Please try again, or email fabricationintelligence@gmail.com.`;
      errorNode.hidden = false;
      status.textContent = '';
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('#project-clear')?.addEventListener('click', () => { store.clear(); });
  store.onChange(render);
  window.addEventListener('storage', render);
  FI.loadProducts().then((list) => { byHandle = new Map(list.map((product) => [product.handle, product])); render(); }).catch(() => { render(); });
})();
