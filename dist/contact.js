'use strict';
// Requests are emailed to the team through FormSubmit until the site has its own backend (see project-planning/README.md).
const FI_CONTACT_EMAIL = 's4149874@student.rmit.edu.au';
const FI_FORM_ENDPOINT = 'https://formsubmit.co/ajax/' + FI_CONTACT_EMAIL;
async function sendRequest({subject, name, replyTo, text}) {
  const response = await fetch(FI_FORM_ENDPOINT, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Accept: 'application/json'},
    body: JSON.stringify({_subject: subject, _template: 'box', _captcha: 'false', name, email: replyTo, message: text})
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok || String(data.success) !== 'true') throw new Error(data.message || 'HTTP ' + response.status);
  return data;
}
function renderFooter(text) {
  const footer = document.querySelector('#footer');
  const link = document.createElement('a');
  link.href = 'mailto:' + FI_CONTACT_EMAIL;
  link.textContent = FI_CONTACT_EMAIL;
  footer.replaceChildren(document.createTextNode(text + ' · ' + t('Contact: ', '联系：')), link);
}
function copyButton(text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = t('Copy request', '复制需求');
  button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); button.textContent = t('Copied', '已复制'); }
    catch { button.textContent = t('Copy failed. Select and copy the details above.', '复制失败，请手动选择并复制上方信息。'); }
  });
  return button;
}
function sendFailure(text, detail) {
  const box = document.createElement('div');
  box.className = 'error send-failure';
  box.setAttribute('role', 'alert');
  const heading = document.createElement('strong');
  heading.textContent = t('We couldn’t send your request.', '需求发送失败。');
  const help = document.createElement('p');
  const link = document.createElement('a');
  link.href = 'mailto:' + FI_CONTACT_EMAIL;
  link.textContent = FI_CONTACT_EMAIL;
  help.append(document.createTextNode(t('Please try again, or copy your request and email it to ', '请重试，或复制需求并发送邮件至 ')), link, document.createTextNode('.'));
  const reason = document.createElement('small');
  reason.textContent = detail;
  box.append(heading, help, copyButton(text), reason);
  return box;
}
function sendButton(label, getPayload, onSuccess) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'primary';
  button.textContent = label;
  button.addEventListener('click', async () => {
    const payload = getPayload(), actions = button.parentElement;
    actions.parentElement.querySelector('.send-failure')?.remove();
    button.disabled = true;
    button.textContent = t('Sending…', '发送中…');
    try {
      await sendRequest(payload);
      onSuccess();
    } catch (error) {
      button.disabled = false;
      button.textContent = label;
      const failure = sendFailure(payload.text, error.message);
      actions.before(failure);
      failure.tabIndex = -1;
      failure.focus();
    }
  });
  return button;
}
