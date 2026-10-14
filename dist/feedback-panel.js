'use strict';
// Feedback wall: a short panel that sends comments to the same team inbox as the 1-minute feedback form,
// and shows only comments a person has approved in data/testimonials.json ("permission": true).
// Nothing on this wall is written by us. With no approved comments, it says so.
(() => {
  const ENDPOINT = 'https://formsubmit.co/ajax/fabricationintelligence@gmail.com';
  const ROLES = ['Homeowner', 'Renovator', 'Builder', 'Plumber or other trade', 'Architect or designer', 'Other'];
  const MAX_COMMENT = 800;
  const MAX_SHOWN_QUOTE = 400;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const filled = (value) => typeof value === 'string' && value.trim() !== '';

  // The same rule as testimonials.js: a real comment, marked with permission, with who said it and in what context.
  function isApproved(entry) {
    return Boolean(entry) && entry.permission === true
      && ['quote', 'name', 'context'].every((key) => filled(entry[key]))
      && entry.quote.trim().length <= MAX_SHOWN_QUOTE;
  }

  // Product pages show comments about that product. The homepage shows the general ones.
  function approvedFor(entries, handle) {
    const list = Array.isArray(entries) ? entries.filter(isApproved) : [];
    return handle ? list.filter((entry) => entry.handle === handle) : list.filter((entry) => !entry.handle);
  }

  function validate({comment, role, email, website}) {
    if (filled(website)) return {ok: false, silent: true};
    if (!filled(comment)) return {ok: false, error: 'Please write a sentence or two first.'};
    if (comment.trim().length > MAX_COMMENT) return {ok: false, error: `Please keep it under ${MAX_COMMENT} characters.`};
    if (!ROLES.includes(role)) return {ok: false, error: 'Please choose which best describes you.'};
    if (filled(email) && !EMAIL.test(email.trim())) return {ok: false, error: 'Check the email address, or leave it blank.'};
    return {ok: true};
  }

  function buildMessage({handle, role, comment, name, email, permission}) {
    const where = handle ? `product ${handle}` : 'home page';
    const lines = [
      `Left on: ${where}`,
      `Role: ${role}`,
      `Comment: ${comment.trim()}`,
      `May we show this comment on the site: ${permission ? 'Yes, with my first name and role' : 'No'}`,
      `Name: ${filled(name) ? name.trim() : 'none'}`,
      `Email: ${filled(email) ? email.trim() : 'none'}`,
    ];
    return {
      _subject: `FI site feedback (${where}): ${role}${permission ? ' · OK to show' : ''}`,
      _template: 'box',
      _captcha: 'false',
      name: filled(name) ? name.trim() : 'Anonymous',
      ...(filled(email) ? {email: email.trim()} : {}),
      message: lines.join('\n'),
    };
  }

  const api = {ENDPOINT, ROLES, MAX_COMMENT, isApproved, approvedFor, validate, buildMessage};
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  const mount = document.querySelector('[data-feedback-panel]');
  if (!mount) return;
  const handle = mount.dataset.context === 'product' ? new URLSearchParams(window.location.search).get('handle') : '';

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  const arrow = (symbol) => {
    const span = el('span', '', symbol);
    span.setAttribute('aria-hidden', 'true');
    return span;
  };

  function field(id, labelText, control) {
    const wrap = el('div', 'fp-field');
    const label = el('label', '', labelText);
    label.htmlFor = id;
    control.id = id;
    wrap.append(label, control);
    return wrap;
  }

  function buildComments(list) {
    const box = el('div', 'fp-comments');
    box.append(el('h3', '', handle ? 'What buyers say about this product' : 'What customers say'));
    const region = el('div', 'fp-list');
    region.setAttribute('aria-live', 'polite');
    if (list.length) {
      for (const entry of list.slice(0, 4)) {
        const figure = el('figure', 'fp-quote');
        figure.append(el('blockquote', '', `“${entry.quote.trim()}”`));
        const caption = el('figcaption');
        caption.append(el('b', '', entry.name.trim()), document.createTextNode(` · ${entry.context.trim()}`));
        figure.append(caption);
        region.append(figure);
      }
    } else {
      region.append(el('p', 'fp-empty', 'No customer comments yet. Real ones show here once the person says we can share them.'));
    }
    box.append(region);
    return box;
  }

  function buildForm() {
    const form = el('form', 'fp-form');
    form.noValidate = true;
    const comment = el('textarea');
    comment.name = 'comment';
    comment.rows = 4;
    comment.maxLength = MAX_COMMENT;
    comment.required = true;
    const role = el('select');
    role.name = 'role';
    role.append(Object.assign(el('option', '', 'Choose one'), {value: ''}));
    for (const name of ROLES) role.append(Object.assign(el('option', '', name), {value: name}));
    const name = el('input');
    name.type = 'text';
    name.name = 'name';
    name.maxLength = 160;
    name.autocomplete = 'name';
    const email = el('input');
    email.type = 'email';
    email.name = 'email';
    email.maxLength = 320;
    email.autocomplete = 'email';
    const permission = el('input');
    permission.type = 'checkbox';
    permission.name = 'permission';
    const permissionLabel = el('label', 'fp-check');
    permissionLabel.append(permission, el('span', '', 'You can show this comment on the site, with my first name and role. I know you’ll check it first.'));
    const trap = el('div', 'fp-trap');
    trap.setAttribute('aria-hidden', 'true');
    const website = el('input');
    website.type = 'text';
    website.name = 'website';
    website.tabIndex = -1;
    website.autocomplete = 'off';
    trap.append(el('label', '', 'Website'), website);

    const submit = el('button', 'button button-primary', 'Send feedback');
    submit.type = 'submit';
    submit.append(document.createTextNode(' '), arrow('→'));
    const status = el('p', 'fp-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    form.append(
      field('fp-comment', handle ? 'What did you think of this product?' : 'What did you think?', comment),
      field('fp-role', 'Which best describes you?', role),
      field('fp-name', 'Your name (optional)', name),
      field('fp-email', 'Email, if you’d like a reply (optional)', email),
      permissionLabel, trap, submit, status,
    );

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = {comment: comment.value, role: role.value, name: name.value, email: email.value, website: website.value, permission: permission.checked, handle};
      const check = validate(values);
      if (!check.ok) {
        if (!check.silent) { status.textContent = check.error; status.className = 'fp-status is-error'; }
        return;
      }
      submit.disabled = true;
      status.className = 'fp-status';
      status.textContent = 'Sending…';
      try {
        const response = await fetch(ENDPOINT, {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: JSON.stringify(buildMessage(values))});
        let data = {};
        try { data = await response.json(); } catch { /* the status code decides */ }
        if (!response.ok || String(data.success) !== 'true') throw new Error(data.message || `HTTP ${response.status}`);
        if (window.fiTrackEvent) window.fiTrackEvent('feedback_submit');
        const thanks = el('div', 'fp-thanks');
        thanks.tabIndex = -1;
        thanks.append(el('h3', '', 'Thank you.'), el('p', '', values.permission
          ? 'Your message went to the team. We’ll check it before showing it, and we may email you first.'
          : 'Your message went to the team. We won’t show it on the site.'));
        form.replaceWith(thanks);
        thanks.focus();
      } catch (error) {
        console.warn(error);
        status.className = 'fp-status is-error';
        status.textContent = 'We couldn’t send that. Please try again, or email fabricationintelligence@gmail.com.';
        submit.disabled = false;
      }
    });
    return form;
  }

  function render(list) {
    const head = el('div', 'fp-head');
    head.append(el('p', 'eyebrow', 'FEEDBACK'));
    head.firstChild.prepend(el('span'));
    const heading = el('h2', '', handle ? 'Tried this product? Tell us.' : 'Tell us what you think.');
    heading.id = 'feedback-heading';
    head.append(
      heading,
      el('p', '', 'Short and honest is fine. We read every message, and we only show a comment if you say we can.'),
    );
    const grid = el('div', 'fp-grid');
    grid.append(buildComments(list), buildForm());
    const more = el('p', 'fp-more');
    const link = el('a', 'text-link', 'Prefer the one-minute form? ');
    link.href = 'feedback.html';
    link.append(arrow('↗'));
    more.append(link);
    mount.replaceChildren(head, grid, more);
    mount.removeAttribute('aria-busy');
  }

  render([]);
  fetch('data/testimonials.json', {cache: 'no-cache'})
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((entries) => {
      const list = approvedFor(entries, handle);
      if (!list.length) return;
      mount.querySelector('.fp-comments').replaceWith(buildComments(list));
    })
    .catch((error) => console.warn('Feedback wall comments did not load:', error));
})();
