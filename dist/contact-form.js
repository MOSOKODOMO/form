'use strict';
// Contact forms on the homepage and contact.html send to the team inbox through FormSubmit, like feedback.js.
(() => {
  const ENDPOINT = 'https://formsubmit.co/ajax/fabricationintelligence@gmail.com';
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const block of document.querySelectorAll('[data-contact-block]')) {
    const form = block.querySelector('form');
    const status = block.querySelector('.contact-form-status');
    const thanks = block.querySelector('.contact-thanks');
    const button = form.querySelector('button[type="submit"]');
    const value = (name) => String(new FormData(form).get(name) || '').trim();
    const say = (message, isError = false) => {
      status.textContent = message;
      status.classList.toggle('is-error', isError);
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (value('website')) return; // Only bots fill the hidden field.
      const name = value('name');
      const email = value('email');
      const product = value('product');
      const message = value('message');
      if (!name || !email || !message) { say('Please add your name, email and a message.', true); return; }
      if (!EMAIL.test(email)) { say('Please check your email address.', true); return; }

      button.disabled = true;
      say('Sending…');
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {'Content-Type': 'application/json', Accept: 'application/json'},
          body: JSON.stringify({
            _subject: `FI contact: ${name}${product ? ` about ${product}` : ''}`,
            _template: 'box',
            _captcha: 'false',
            name,
            email,
            product: product || 'none',
            message,
          }),
        });
        let data = {};
        try { data = await response.json(); } catch {}
        if (!response.ok || String(data.success) !== 'true') throw new Error(data.message || `HTTP ${response.status}`);
        form.hidden = true;
        thanks.hidden = false;
        thanks.focus();
      } catch (error) {
        console.error(error);
        say('We couldn’t send your message. Please try again, or email fabricationintelligence@gmail.com.', true);
      } finally {
        button.disabled = false;
      }
    });
  }
})();
