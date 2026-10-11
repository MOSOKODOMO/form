/* Sends a buyer enquiry through the same two routes as the contact form: the private FI inbox (Supabase) and an email notice (FormSubmit).
   Used by the project list and trade pages. Returns {saved: true, notified: boolean}; throws when the note could not be saved. */
(() => {
  'use strict';
  const NOTIFY = 'https://formsubmit.co/ajax/fabricationintelligence@gmail.com';
  const INTAKE = 'https://dszagdjnymxalpwamjyh.supabase.co/functions/v1/fi-enquiry';
  const KEY = 'sb_publishable_Dm6trfXjIO0C1r9A71PbNw_Q_PF4OM5';
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const keys = new Map();

  async function sendEnquiry({kind, subject, name, email, product, message}) {
    if (!name || !EMAIL.test(email) || !message) throw new Error('Add your name, a valid email and a message.');
    if (message.length > 4000) throw new Error('This is too long to send in one go. Remove a few items.');
    const contents = {name: name.slice(0, 120), email: email.slice(0, 200), relationship: 'buyer', product: String(product || '').slice(0, 200), message};
    const fingerprint = JSON.stringify(contents);
    // The same unchanged request keeps its key, so pressing send twice cannot create two enquiries.
    if (!keys.has(fingerprint)) keys.set(fingerprint, crypto.randomUUID());
    const saved = await fetch(INTAKE, {method: 'POST', headers: {'Content-Type': 'application/json', apikey: KEY}, body: JSON.stringify({submission_key: keys.get(fingerprint), ...contents})});
    let receipt = {};
    try { receipt = await saved.json(); } catch { /* handled below */ }
    if (!saved.ok || receipt.saved !== true) throw new Error(receipt.error || 'Your request could not be saved.');
    let notified = false;
    try {
      const response = await fetch(NOTIFY, {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: JSON.stringify({_subject: String(subject).replace(/[\r\n]+/g, ' ').slice(0, 150), _template: 'box', _captcha: 'false', name: contents.name, email: contents.email, relationship: kind, product: contents.product || 'none', message})});
      let data = {};
      try { data = await response.json(); } catch { /* ignore */ }
      notified = response.ok && String(data.success) === 'true';
    } catch { /* the saved note is enough */ }
    return {saved: true, notified};
  }

  const api = {sendEnquiry};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.FISend = api;
})();
