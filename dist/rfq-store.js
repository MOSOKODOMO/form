'use strict';
// Versioned browser-only storage; never sends requests to FI or fabricators.
const RFQStore = (() => {
  const key = 'fi.rfqs.v1';
  function read() {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.some(r => !r || typeof r.id !== 'string' || typeof r.updatedAt !== 'string' || !r.brief || typeof r.brief !== 'object' || Array.isArray(r.brief))) throw new Error('Invalid saved requests');
    return rows;
  }
  function save(brief, id) {
    const rows = read(), index = id ? rows.findIndex(r => r.id === id) : -1;
    if (id && index < 0) throw new Error('Request no longer exists');
    const now = new Date().toISOString();
    const row = {id: id || 'FI-' + crypto.randomUUID(), createdAt: index < 0 ? now : rows[index].createdAt, updatedAt: now, brief: {...brief}, status: 'saved-locally'};
    if (index < 0) rows.unshift(row); else rows[index] = row;
    localStorage.setItem(key, JSON.stringify(rows));
    return row;
  }
  return {read, save};
})();
