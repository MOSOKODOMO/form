'use strict';
// Requests reach the team by email until a form backend exists (see project-planning/README.md).
const FI_CONTACT_EMAIL = 's4149874@student.rmit.edu.au';
function mailtoHref(subject, body) {
  return 'mailto:' + FI_CONTACT_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
}
function renderFooter(text) {
  const footer = document.querySelector('#footer');
  const link = document.createElement('a');
  link.href = 'mailto:' + FI_CONTACT_EMAIL;
  link.textContent = FI_CONTACT_EMAIL;
  footer.replaceChildren(document.createTextNode(text + ' · ' + t('Contact: ', '联系：')), link);
}
function emailLink(label, subject, body, onSend) {
  const link = document.createElement('a');
  link.className = 'primary button-link';
  link.href = mailtoHref(subject, body);
  link.textContent = label;
  if (onSend) link.addEventListener('click', () => setTimeout(onSend, 0));
  return link;
}
