'use strict';
// Trade application: checks the ABN's check digits as the visitor types, then sends the application to the team.
(() => {
  // Official ABN check: 11 digits; subtract 1 from the first digit; weight the digits; the sum must divide by 89.
  function validAbn(value) {
    const digits = String(value || '').replace(/[\s-]/g, '');
    if (!/^\d{11}$/.test(digits)) return false;
    const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
    const sum = [...digits].reduce((total, digit, index) => total + (Number(digit) - (index === 0 ? 1 : 0)) * weights[index], 0);
    return sum % 89 === 0;
  }
  const formatAbn = (value) => { const d = String(value || '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : String(value || '').trim(); };
  const api = {validAbn, formatAbn};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  const form = document.querySelector('#trade-form');
  if (!form) return;
  const status = document.querySelector('#trade-status');
  const errorNode = document.querySelector('#trade-error');
  const abnInput = form.elements.abn;
  const help = document.querySelector('#abn-help');
  const helpDefault = help.textContent;
  abnInput.addEventListener('input', () => {
    const digits = abnInput.value.replace(/\D/g, '');
    if (digits.length < 11) { help.textContent = helpDefault; abnInput.removeAttribute('aria-invalid'); return; }
    const ok = validAbn(abnInput.value);
    abnInput.setAttribute('aria-invalid', String(!ok));
    help.textContent = ok ? 'This ABN passes the check-digit test. We confirm it on the Australian Business Register next.' : 'This does not look like a valid ABN. Please check the digits.';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const value = (name) => String(data.get(name) || '').trim();
    if (value('website')) return;
    errorNode.hidden = true;
    const fail = (message) => { errorNode.textContent = message; errorNode.hidden = false; };
    if (!value('business') || !value('name') || !value('email')) { fail('Please add your business name, your name and your email.'); return; }
    if (!validAbn(value('abn'))) { fail('Please check your ABN. It must be 11 digits and pass the check-digit test.'); abnInput.focus(); return; }
    const message = [
      'TRADE PRICING APPLICATION',
      `Business: ${value('business')}`,
      `ABN: ${formatAbn(value('abn'))} (passes check digits; not yet confirmed on the ABN Register)`,
      `Trade: ${value('trade')}`,
      `Usually buys: ${value('note') || 'not stated'}`,
    ].join('\n');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = 'Sending…';
    try {
      await window.FISend.sendEnquiry({kind: 'Trade application', subject: `FI trade application: ${value('business')}`, name: value('name'), email: value('email'), product: value('business'), message});
      form.hidden = true;
      const thanks = document.querySelector('#trade-thanks');
      thanks.hidden = false;
      thanks.focus();
      window.fiTrackEvent?.('generate_lead', {form_name: 'contact_page'});
    } catch (error) {
      fail(`${error.message || 'We could not send your application.'} Please try again, or email fabricationintelligence@gmail.com.`);
      status.textContent = '';
    } finally {
      button.disabled = false;
    }
  });
})();
