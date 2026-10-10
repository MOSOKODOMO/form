'use strict';
// Contact forms on the homepage and contact.html send to the team inbox through FormSubmit, like feedback.js.
(() => {
  const ENDPOINT = 'https://formsubmit.co/ajax/fabricationintelligence@gmail.com';
  const INTAKE = 'https://dszagdjnymxalpwamjyh.supabase.co/functions/v1/fi-enquiry';
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const POSITIONS = {
    'warehouse-inspector': 'Warehouse quality inspector',
    'marketing-content': 'Marketing & content coordinator',
    'supplier-sourcing': 'Supplier sourcing coordinator',
    'customer-support': 'Customer & order support',
  };

  for (const block of document.querySelectorAll('[data-contact-block]')) {
    const form = block.querySelector('form');
    const status = block.querySelector('.contact-form-status');
    const thanks = block.querySelector('.contact-thanks');
    const button = form.querySelector('button[type="submit"]');
    let submissionKey, submittedContents;
    // "Request a quote" links arrive as contact.html?product=<name>; fill in the product for them.
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get('product');
    if (wanted && form.elements.product && !form.elements.product.value) form.elements.product.value = wanted.trim().slice(0, 200);
    const relationshipField = form.elements.namedItem('relationship');
    const applicationFields = form.querySelector('[data-application-fields]');
    const positionField = form.elements.namedItem('position');
    const portfolioField = form.elements.namedItem('portfolio');
    const syncApplication = () => {
      const applying = relationshipField?.value === 'applicant';
      if (applicationFields) applicationFields.hidden = !applying;
      if (positionField) { positionField.disabled = !applying; positionField.required = applying; }
      if (portfolioField) portfolioField.disabled = !applying;
    };
    const requestedRole = params.get('role');
    if (relationshipField && positionField && Object.hasOwn(POSITIONS, requestedRole)) {
      relationshipField.value = 'applicant';
      positionField.value = requestedRole;
    } else if (wanted && relationshipField) relationshipField.value = 'buyer';
    form.addEventListener('change', syncApplication);
    syncApplication();
    const value = (name) => String(new FormData(form).get(name) || '').trim();
    const say = (message, isError = false) => {
      status.textContent = message;
      status.classList.toggle('is-error', isError);
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (button.disabled) return;
      if (value('website')) return; // Only bots fill the hidden field.
      const name = value('name');
      const email = value('email');
      const product = value('product');
      const relationship = value('relationship');
      const message = value('message');
      const applying = relationship === 'applicant';
      const position = applying ? value('position') : '';
      const portfolio = applying ? value('portfolio') : '';
      if (relationshipField && !['buyer', 'supplier', 'applicant'].includes(relationship)) { say('Please choose buyer, supplier or join the team.', true); return; }
      if (!name || !email || !message) { say('Please add your name, email and a message.', true); return; }
      if (!EMAIL.test(email)) { say('Please check your email address.', true); return; }
      if (applying && !Object.hasOwn(POSITIONS, position)) { say('Please choose a position for your application.', true); return; }
      if (portfolio) {
        let link;
        try { link = new URL(portfolio); } catch {}
        if (!link || !['https:', 'http:'].includes(link.protocol)) { say('Please use a full https:// or http:// CV or portfolio link.', true); return; }
      }

      button.disabled = true;
      say('Sending…');
      try {
        const contents={name,email,relationship,product,message,...(applying?{position,portfolio}:{} )};
        const fingerprint=JSON.stringify(contents);
        if(fingerprint!==submittedContents) {submissionKey=crypto.randomUUID(); submittedContents=fingerprint;}
        const saved = await fetch(INTAKE, {
          method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_Dm6trfXjIO0C1r9A71PbNw_Q_PF4OM5'},
          body:JSON.stringify({submission_key:submissionKey,...contents}),
        });
        let receipt={}; try{receipt=await saved.json();}catch{}
        if(!saved.ok || receipt.saved!==true) throw new Error(receipt.error || 'Your note could not be saved.');
        let notified=false;
        try {
          const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {'Content-Type': 'application/json', Accept: 'application/json'},
          body: JSON.stringify({
            _subject: `FI ${applying ? `application for ${POSITIONS[position]}` : relationship === 'supplier' ? 'supplier introduction' : relationship === 'buyer' ? 'buyer enquiry' : 'contact'}: ${name}${product ? ` about ${product}` : ''}`.replace(/[\r\n]+/g, ' ').slice(0, 240),
            _template: 'box',
            _captcha: 'false',
            name,
            email,
            relationship: applying ? 'Team applicant' : relationship === 'supplier' ? 'Supplier' : relationship === 'buyer' ? 'Buyer' : 'General enquiry',
            ...(applying ? {position: POSITIONS[position], portfolio: portfolio || 'Not provided'} : {}),
            product: product || 'none',
            message,
          }),
        });
        let data = {};
        try { data = await response.json(); } catch {}
        if (!response.ok || String(data.success) !== 'true') throw new Error(data.message || `HTTP ${response.status}`);
          notified=true;
        } catch(error) { console.error('FI email notification was not confirmed.'); }
        const delivery=thanks.querySelector('[data-enquiry-delivery]');
        if(delivery) delivery.textContent=notified ? 'Your note is saved and the team has been notified by email.' : 'Your note is saved in the FI team inbox. The email notification could not be confirmed; you do not need to send the note again.';
        window.fiTrackEvent?.('generate_lead', {form_name: window.location.pathname === '/' || window.location.pathname === '/index.html' ? 'contact_home' : 'contact_page'});
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
