'use strict';
// Sends the bug report to the team inbox through FormSubmit, like the feedback form.
const BUG_ENDPOINT = 'https://formsubmit.co/ajax/fabricationintelligence@gmail.com';
const bugForm = document.querySelector('#bug-form');
const bugStatus = document.querySelector('#bug-status');
const bugPage = document.querySelector('#bug-page');

// Pre-fill the page from ?page=/shop.html, accepting only a plain site path.
function safePath(value) {
  const path = String(value || '').trim();
  return /^\/[A-Za-z0-9._\-\/]{0,120}$/.test(path) && !path.includes('//') ? path : '';
}
try { bugPage.value = safePath(new URLSearchParams(window.location.search).get('page')); } catch {}

function field(name) {
  return String(new FormData(bugForm).get(name) || '').trim();
}
function setStatus(message, isError = false) {
  bugStatus.textContent = message;
  bugStatus.classList.toggle('error-text', isError);
}
function deviceSummary() {
  const width = window.innerWidth, height = window.innerHeight;
  return `${navigator.userAgent} · viewport ${width}x${height}`;
}

bugForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (field('website')) return;
  const what = field('what'), page = field('page'), email = field('email');
  if (!what || !page) { setStatus('Please fill in the two questions marked *.', true); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setStatus('Check the email address, or leave it blank.', true); return; }
  const lines = [
    `What went wrong: ${what}`,
    `Expected: ${field('expected') || 'not stated'}`,
    `Page: ${page}`,
    `Severity: ${field('severity')}`,
    `Device: ${field('device') === 'yes' ? deviceSummary() : 'not shared'}`,
    `Email: ${email || 'none'}`,
  ];
  const submit = bugForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  setStatus('Sending…');
  try {
    const response = await fetch(BUG_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify({_subject: `FI bug report: ${field('severity')} · ${page}`, _template: 'box', _captcha: 'false', name: 'Bug report', ...(email ? {email} : {}), message: lines.join('\n')}),
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok || String(data.success) !== 'true') throw new Error(data.message || `HTTP ${response.status}`);
    window.fiLog?.('bug_report_submit');
    bugForm.hidden = true;
    const thanks = document.querySelector('#bug-thanks');
    thanks.hidden = false;
    thanks.focus();
  } catch (error) {
    console.error(error);
    setStatus('We could not send your report. Please try again, or email fabricationintelligence@gmail.com.', true);
  } finally {
    submit.disabled = false;
  }
});
