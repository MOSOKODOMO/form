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
    `Maker evidence helps purchase decision: ${wouldUse}`,
    `Proof that matters most: ${answer('proof') || 'none'}`,
    `Remaining concern: ${answer('concern') || 'none'}`,
    `Product to check: ${answer('source_next') || 'none'}`,
    `Name: ${answer('name') || 'none'}`,
    `Email: ${email || 'none'}`,
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
    window.fiTrackEvent?.('feedback_submit');
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
