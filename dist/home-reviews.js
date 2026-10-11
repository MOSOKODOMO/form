import { node } from './commerce-client.js';
import { readReviews, reviewCard, summaryText } from './review-ui.js?v=20261012-featured';

export async function loadHomeReviews(section) {
  const list = section.querySelector('#testimonial-list');
  const summary = section.querySelector('#home-review-summary');
  const selection = section.querySelector('#home-review-selection');
  const status = node('p', 'Loading customer reviews…', 'home-review-status');
  status.setAttribute('role', 'status');
  list.replaceChildren(status);
  summary.hidden = true;
  selection.hidden = true;
  try {
    // Rank the entire public review set before taking three. The summary includes every rating.
    const result = await readReviews({ sort: 'highest', limit: 3 });
    list.replaceChildren();
    if (!result.reviews.length) {
      const empty = node('div', null, 'home-review-empty');
      empty.append(node('h3', 'Be the first to share your experience.'), node('p', 'Received your FI order? Your review can help someone find the right piece for their home.'));
      list.append(empty);
      return;
    }
    summary.textContent = summaryText(result.summary);
    summary.hidden = false;
    selection.hidden = false;
    result.reviews.forEach((review) => {
      const card = reviewCard(review, { products: result.products });
      const link = node('a', 'Read product reviews ↗', 'text-link home-review-link');
      link.href = `reviews.html?product=${encodeURIComponent(review.product_id)}`;
      card.querySelector('.review-content').append(link);
      list.append(card);
    });
  } catch {
    const error = node('p', 'Customer reviews are temporarily unavailable. Please try again later.', 'home-review-status');
    error.setAttribute('role', 'status');
    list.replaceChildren(error);
  }
}

const section = document.querySelector('#testimonials');
if (section) loadHomeReviews(section);
