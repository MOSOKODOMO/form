import { supabase, node } from './commerce-client.js';

export function reviewCard(review) {
  const card = node('article', null, 'review-card');
  const stars = node('span', '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating), 'review-stars');
  stars.setAttribute('aria-label', `${review.rating} out of 5 stars`);
  const meta = node('div');
  meta.append(stars, node('span', 'Verified purchase', 'review-badge'));
  card.append(meta, node('h3', review.title), node('p', review.body, 'review-body'));
  card.append(node('p', `${review.display_name} · ${new Date(review.created_at).toLocaleDateString('en-AU')} · ${review.product_title}`, 'review-meta'));
  if (review.updated_at !== review.created_at) card.append(node('small', 'Edited by the customer', 'review-meta'));
  return card;
}

export async function readReviews({ product = null, handle = null, rating = null, offset = 0 } = {}) {
  let query = supabase.from('fi_product_reviews').select('id,product_id,product_title,catalogue_handle,display_name,rating,title,body,created_at,updated_at')
    .order('created_at', { ascending: false }).order('id').range(offset, offset + 19);
  if (product) query = query.eq('product_id', product);
  if (handle) query = query.eq('catalogue_handle', handle);
  if (rating) query = query.eq('rating', rating);
  const results = await Promise.all([
    query,
    supabase.rpc('fi_review_summary', { p_product: product, p_handle: handle, p_rating: rating })
  ]);
  for (const result of results) if (result.error) throw result.error;
  return { reviews: results[0].data, summary: results[1].data[0] };
}

export function summaryText(summary) {
  return summary.review_count ? `${Number(summary.average_rating).toFixed(1)} / 5 · ${summary.review_count} verified purchase review${Number(summary.review_count) === 1 ? '' : 's'}` : 'No verified purchase reviews yet.';
}

export function emptyReviews(filtered = false) {
  const box = node('div', null, 'review-empty');
  box.append(node('strong', filtered ? 'No reviews match these filters.' : 'No reviews yet.'), node('p', filtered ? 'Choose another product or rating to see more experiences.' : 'Reviews will appear after real customers receive and review their purchases.'));
  return box;
}
