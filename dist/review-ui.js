import { supabase, node } from './commerce-client.js';

export function reviewCard(review, { products = [], sample = false } = {}) {
  const card = node('article', null, 'review-card review-product-row');
  const product = products.find((item) => item.handle === review.catalogue_handle);
  const productLink = product ? `product.html?handle=${encodeURIComponent(product.handle)}` : null;
  const picture = node(productLink ? 'a' : 'div', null, 'review-product-picture');
  if (productLink) { picture.href = productLink; picture.setAttribute('aria-label', `View ${review.product_title}`); }
  const image = node('img');
  const photo = product?.photo_url || '';
  image.src = /^(?:assets\/products\/[^\s]+|https:\/\/[^\s]+)$/.test(photo) ? photo : 'assets/products/photo-coming-soon.svg';
  image.alt = review.product_title;
  image.width = 160; image.height = 160; image.loading = 'lazy'; image.decoding = 'async';
  image.addEventListener('error', () => { image.src = 'assets/products/photo-coming-soon.svg'; }, { once: true });
  picture.append(image);
  if (product?.photo_is_render || product?.photo_is_reference) picture.append(node('span', 'AI render', 'review-image-label'));
  const content = node('div', null, 'review-content');
  const productName = node(productLink ? 'a' : 'p', review.product_title, 'review-product-name');
  if (productLink) productName.href = productLink;
  content.append(productName, node('h3', review.title), node('p', review.body, 'review-body'));
  const author = node('div', null, 'review-author');
  author.append(node('p', `By ${review.display_name}`, 'review-author-name'));
  const stars = node('span', '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating), 'review-stars');
  stars.setAttribute('aria-label', `${review.rating} out of 5 stars`);
  author.append(stars, node('span', sample ? 'Fictional sample' : 'Verified purchase', 'review-badge'));
  author.append(node('p', new Date(review.created_at).toLocaleDateString('en-AU'), 'review-meta'));
  if (review.updated_at !== review.created_at) author.append(node('small', 'Edited by the customer', 'review-meta'));
  card.append(picture, content, author);
  return card;
}

let catalogue;
async function reviewProducts() {
  catalogue ||= fetch('data/products.json').then((response) => {
    if (!response.ok) throw new Error('Product images unavailable');
    return response.json();
  }).catch(() => []);
  return catalogue;
}

export async function readReviews({ product = null, handle = null, rating = null, offset = 0, limit = 20, sort = 'newest' } = {}) {
  let query = supabase.from('fi_product_reviews').select('id,product_id,product_title,catalogue_handle,display_name,rating,title,body,created_at,updated_at');
  if (sort === 'highest') query = query.order('rating', { ascending: false });
  query = query.order('created_at', { ascending: false }).order('id').range(offset, offset + limit - 1);
  if (product) query = query.eq('product_id', product);
  if (handle) query = query.eq('catalogue_handle', handle);
  if (rating) query = query.eq('rating', rating);
  const results = await Promise.all([
    query,
    supabase.rpc('fi_review_summary', { p_product: product, p_handle: handle, p_rating: rating })
  ]);
  for (const result of results) if (result.error) throw result.error;
  const products = results[0].data.length ? await reviewProducts() : [];
  return { reviews: results[0].data, summary: results[1].data[0], products };
}

export function summaryText(summary) {
  return summary.review_count ? `${Number(summary.average_rating).toFixed(1)} / 5 · ${summary.review_count} verified purchase review${Number(summary.review_count) === 1 ? '' : 's'}` : 'No verified purchase reviews yet.';
}

export function emptyReviews(filtered = false) {
  const box = node('div', null, 'review-empty');
  box.append(node('strong', filtered ? 'No reviews match these filters.' : 'No reviews yet.'), node('p', filtered ? 'Choose another product or rating to see more experiences.' : 'Reviews will appear after real customers receive and review their purchases.'));
  return box;
}
