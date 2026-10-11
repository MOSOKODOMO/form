/* Project list: a renovator or trade buyer collects products, then sends the list to FI as one quote request.
   Stored only in this browser (localStorage). Nothing is sent until the visitor presses send on project.html. */
(() => {
  'use strict';
  const KEY = 'fi.project.v1';
  const MAX_ITEMS = 30;
  const HANDLE = /^[a-z0-9][a-z0-9-]{0,199}$/;

  function clean(entry) {
    if (!entry || typeof entry !== 'object' || !HANDLE.test(String(entry.h))) return null;
    const quantity = Math.floor(Number(entry.q));
    return {
      h: String(entry.h),
      q: Number.isFinite(quantity) ? Math.min(999, Math.max(1, quantity)) : 1,
      o: typeof entry.o === 'string' ? entry.o.replace(/[\r\n]+/g, ' ').slice(0, 60) : '',
    };
  }

  function createStore(storage) {
    const listeners = new Set();
    const read = () => {
      try {
        const parsed = JSON.parse(storage.getItem(KEY) || '[]');
        const seen = new Set();
        return (Array.isArray(parsed) ? parsed : []).map(clean).filter((item) => item && !seen.has(item.h) && seen.add(item.h)).slice(0, MAX_ITEMS);
      } catch { return []; }
    };
    const write = (items) => {
      try { storage.setItem(KEY, JSON.stringify(items)); } catch { /* storage may be blocked; the list then lasts only for this page */ }
      for (const listener of listeners) listener(items);
    };
    return {
      items: read,
      count: () => read().length,
      has: (handle) => read().some((item) => item.h === handle),
      add(handle) {
        const items = read();
        if (!HANDLE.test(String(handle))) return false;
        if (items.some((item) => item.h === handle)) return true;
        if (items.length >= MAX_ITEMS) return false;
        write([...items, {h: handle, q: 1, o: ''}]);
        return true;
      },
      remove: (handle) => write(read().filter((item) => item.h !== handle)),
      update(handle, changes) {
        write(read().map((item) => (item.h === handle ? clean({...item, ...changes}) || item : item)));
      },
      clear: () => write([]),
      onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    };
  }

  const api = {createStore, MAX_ITEMS, KEY};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return;

  let storage;
  try { storage = window.localStorage; storage.getItem(KEY); } catch { storage = {getItem: () => null, setItem: () => {}}; }
  const store = createStore(storage);
  const refreshLinks = () => {
    const count = store.count();
    for (const link of document.querySelectorAll('[data-project-link]')) link.textContent = count ? `Project list (${count})` : 'Project list';
  };
  store.onChange(refreshLinks);
  window.addEventListener('storage', (event) => { if (event.key === KEY) refreshLinks(); });
  document.addEventListener('DOMContentLoaded', refreshLinks);

  // A toggle button for a product card or product page.
  function button(handle, name, className = 'project-add') {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = className;
    const sync = () => {
      const on = store.has(handle);
      node.textContent = on ? 'On your project list' : 'Add to project list';
      node.setAttribute('aria-pressed', String(on));
      node.setAttribute('aria-label', `${on ? 'Remove from' : 'Add to'} project list: ${name}`);
    };
    node.addEventListener('click', () => {
      if (store.has(handle)) store.remove(handle);
      else if (!store.add(handle)) { node.textContent = `List is full (${MAX_ITEMS})`; return; }
    });
    store.onChange(sync);
    window.addEventListener('storage', (event) => { if (event.key === KEY) sync(); });
    sync();
    return node;
  }
  window.FIProject = {...store, button, MAX_ITEMS};
})();
