import { node } from './commerce-client.js';
import { readReviews, reviewCard, emptyReviews, summaryText } from './review-ui.js';
async function show(section) {
  const handle = section.dataset.reviewHandle;
  const heading = node('h2', 'Customer reviews');
  const link = node('a', 'Read reviews or review your purchase ↗', 'text-link');
  link.href = `reviews.html?handle=${encodeURIComponent(handle)}#write-review`;
  section.replaceChildren(heading, node('p', 'Loading reviews…'));
  try {
    const { reviews, summary } = await readReviews({ handle });
    section.replaceChildren(heading, node('p', summaryText(summary)));
    if (!reviews.length) section.append(emptyReviews());
    else reviews.slice(0,3).forEach((review) => section.append(reviewCard(review)));
  } catch { section.replaceChildren(heading, node('p', 'Reviews are temporarily unavailable.')); }
  section.append(link);
}
const root = document.querySelector('#product');
if (root) {
  const observe = new MutationObserver(() => {
    const section = root.querySelector('[data-review-handle]');
    if (section) { observe.disconnect(); show(section); }
  });
  observe.observe(root, { childList: true, subtree: true });
  const existing = root.querySelector('[data-review-handle]');
  if (existing) { observe.disconnect(); show(existing); }
}
