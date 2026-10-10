import { supabase, node, session } from './commerce-client.js';
import { readReviews, reviewCard, emptyReviews, summaryText } from './review-ui.js';
const $ = (selector) => document.querySelector(selector);
const product = $('#review-product'), rating = $('#review-rating'), list = $('#review-list'), more = $('#review-more');
const params = new URLSearchParams(location.search);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const handle = /^[a-z0-9][a-z0-9-]{0,119}$/.test(params.get('handle') || '') ? params.get('handle') : null;
let offset = 0, generation = 0, items = [];
function message(selector, value, error = false) { $(selector).textContent = value; $(selector).classList.toggle('review-error', error); }

async function load(reset = true) {
  const request = ++generation;
  if (reset) { offset = 0; list.replaceChildren(); }
  more.hidden = true;
  message('#review-status', 'Loading reviews…');
  try {
    const { reviews, summary } = await readReviews({ product: product.value || null, handle, rating: rating.value ? Number(rating.value) : null, offset });
    if (request !== generation) return;
    $('#review-summary').textContent = summaryText(summary);
    if (!summary.review_count) list.append(emptyReviews(Boolean(product.value || rating.value || handle)));
    else reviews.forEach((review) => list.append(reviewCard(review)));
    offset += reviews.length;
    more.hidden = offset >= Number(summary.review_count);
    message('#review-status', summary.review_count ? `Showing ${offset} of ${summary.review_count} reviews.` : '');
  } catch {
    if (request !== generation) return;
    $('#review-summary').textContent = 'Review summary unavailable.';
    message('#review-status', 'Reviews could not load. Please refresh or try again later.', true);
  }
}
product.onchange = () => load(); rating.onchange = () => load(); more.onclick = () => load(false);

async function account() {
  const current = await session();
  const form = $('#review-form');
  $('#review-account-actions').replaceChildren();
  if (!current) {
    form.hidden = true;
    message('#review-account-status', 'Sign in to review a product you have received.');
    const login = node('a', 'Sign in to review ↗', 'button button-primary');
    login.href = 'auth.html?next=reviews.html'; $('#review-account-actions').append(login); return;
  }
  const { data, error } = await supabase.rpc('fi_reviewable_items');
  if (error) throw error;
  items = data;
  if (!items.length) {
    form.hidden = true;
    message('#review-account-status', 'You have no delivered purchases eligible for review yet. Reviews open after a real paid order is recorded as delivered; test orders are excluded.');
    const orders = node('a', 'View My orders ↗', 'text-link'); orders.href = 'orders.html'; $('#review-account-actions').append(orders); return;
  }
  form.elements.order_item.replaceChildren();
  const requested = params.get('item');
  items.forEach((item) => {
    const option = node('option', `${item.product_title}${item.review_id ? ' · Edit your review' : ''}`);
    option.value = item.order_item_id;
    form.elements.order_item.append(option);
  });
  if (uuid.test(requested || '') && items.some((item) => item.order_item_id === requested)) form.elements.order_item.value = requested;
  function fill() {
    const item = items.find((item) => item.order_item_id === form.elements.order_item.value);
    for (const name of ['display_name', 'rating', 'title', 'body']) form.elements[name].value = item[name] || '';
    form.elements.public_consent.checked = false;
    form.querySelector('button').textContent = item.review_id ? 'Update your review ↗' : 'Publish review ↗';
  }
  form.elements.order_item.onchange = fill; fill();
  form.hidden = false;
  message('#review-account-status', 'Your chosen display name and review will be public. Your account, payment and delivery details stay private.');
}
$('#review-form').onsubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = form.querySelector('button'); button.disabled = true;
  message('#review-save-status', 'Publishing your review…');
  try {
    const values = new FormData(form);
    const { error } = await supabase.rpc('fi_submit_product_review', {
      p_order_item: values.get('order_item'), p_display_name: values.get('display_name'),
      p_rating: Number(values.get('rating')), p_title: values.get('title'), p_body: values.get('body'), p_public_consent: values.get('public_consent') === 'on'
    });
    if (error) throw error;
    const refresh = await Promise.allSettled([account(), load()]);
    if (refresh[0].status === 'rejected')
      message('#review-account-status', 'Your review was saved, but account details could not refresh. Reload this page to edit it.', true);
    message('#review-save-status', 'Your review is published. Thank you for sharing your experience.');
  } catch (error) { message('#review-save-status', error.message || 'Your review could not be saved. Please try again.', true); }
  finally { button.disabled = false; }
};

try {
  const { data, error } = await supabase.rpc('fi_review_products');
  if (error) throw error;
  data.forEach((row) => { const option = node('option', row.product_title); option.value = row.product_id; product.append(option); });
  if (uuid.test(params.get('product') || '') && data.some((row) => row.product_id === params.get('product'))) product.value = params.get('product');
} catch { message('#review-status', 'Product filters are temporarily unavailable.', true); }
await Promise.all([load(), account().catch(() => message('#review-account-status', 'We could not check review eligibility. Please refresh and sign in again.', true))]);
