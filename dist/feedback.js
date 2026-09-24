'use strict';
// Sends the 1-minute feedback form to the team inbox through FormSubmit.
const FEEDBACK_ENDPOINT = 'https://formsubmit.co/ajax/fabricationintelligence@gmail.com';
const feedbackForm = document.querySelector('#feedback-form');
const feedbackStatus = document.querySelector('#feedback-status');

function answer(name) {
  const values = new FormData(feedbackForm).getAll(name).map((value) => String(value).trim()).filter(Boolean);
  return values.join(', ');
}

function setFeedbackStatus(message, tone = '') {
  feedbackStatus.textContent = message;
  feedbackStatus.className = tone;
}

feedbackForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (answer('website')) return;
  const role = answer('role');
  const wouldUse = answer('would_use');
  const email = answer('email');
  if (!role || !wouldUse) {
    setFeedbackStatus('Please answer the two questions marked *.', 'error-text');
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFeedbackStatus('Check the email address, or leave it blank.', 'error-text');
    return;
  }
  const lines = [
    `Role: ${role}`,
    `Tried the request form: ${answer('tried_form') || '—'}`,
    `Ease of sending a request (1–5): ${answer('ease') || '—'}`,
    `Confusing or missing: ${answer('confusing') || '—'}`,
    `Would use on a real project: ${wouldUse}`,
    `Why: ${answer('why') || '—'}`,
    `10% fee after the pilot: ${answer('fee') || '—'}`,
    `Product to source: ${answer('source_next') || '—'}`,
    `Name: ${answer('name') || '—'}`,
    `Email: ${email || '—'}`,
  ];
  const submit = feedbackForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  setFeedbackStatus('Sending…');
  try {
    const response = await fetch(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify({_subject: `FI feedback: ${role} · would use: ${wouldUse}`, _template: 'box', _captcha: 'false', name: answer('name') || 'Anonymous', ...(email ? {email} : {}), message: lines.join('\n')}),
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok || String(data.success) !== 'true') throw new Error(data.message || `HTTP ${response.status}`);
    feedbackForm.hidden = true;
    const thanks = document.querySelector('#feedback-thanks');
    thanks.hidden = false;
    thanks.focus();
  } catch (error) {
    console.error(error);
    setFeedbackStatus('We couldn’t send your feedback. Please try again, or email fabricationintelligence@gmail.com.', 'error-text');
  } finally {
    submit.disabled = false;
  }
});
