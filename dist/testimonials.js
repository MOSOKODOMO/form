'use strict';
// Shows real buyer quotes from data/testimonials.json. Only entries marked "permission": true appear,
// and until there are any, the honest empty state in the page stays as it is.
(() => {
  const isReal = (entry) => Boolean(entry) && entry.permission === true &&
    ['quote', 'name', 'context'].every((key) => typeof entry[key] === 'string' && entry[key].trim());
  if (typeof module === 'object' && module.exports) { module.exports = {isReal}; return; }

  const list = document.querySelector('#testimonial-list');
  if (!list) return;
  fetch('data/testimonials.json', {cache: 'no-cache'})
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((entries) => {
      const quotes = Array.isArray(entries) ? entries.filter(isReal) : [];
      if (!quotes.length) return;
      list.replaceChildren(...quotes.map((entry) => {
        const figure = document.createElement('figure');
        figure.className = 'testimonial';
        const quote = document.createElement('blockquote');
        quote.textContent = `“${entry.quote.trim()}”`;
        const caption = document.createElement('figcaption');
        const name = document.createElement('b');
        name.textContent = entry.name.trim();
        caption.append(name, document.createTextNode(` · ${entry.context.trim()}`));
        figure.append(quote, caption);
        return figure;
      }));
    })
    .catch((error) => console.warn('Testimonials did not load:', error));
})();
