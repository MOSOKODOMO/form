import { reviewCard } from '/review-ui.js?v=20261012-featured';
const [{reviews},products]=await Promise.all([fetch('/data/review-preview-samples.json').then(r=>r.json()),fetch('/data/products.json').then(r=>r.json())]);
const home=document.querySelector('#testimonial-list');
function sampleCard(review) {
 const card=reviewCard(review,{products,sample:true});
 card.classList.add('review-preview-card');
 card.querySelector('.review-badge')?.remove();
 card.querySelector('.review-image-label')?.remove();
 const disclosure=document.createElement('small');
 disclosure.className='review-sample-disclosure';
 disclosure.textContent='AI-generated sample review';
 card.append(disclosure);
 return card;
}
if(home){
 const best=[...reviews].sort((a,b)=>b.rating-a.rating||b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id)).slice(0,3);
 home.replaceChildren(...best.map(sampleCard));
 const summary=document.querySelector('#home-review-summary');summary.hidden=false;summary.textContent=`${best.length} featured samples · ${reviews.length} fictional examples`;
 const selection=document.querySelector('#home-review-selection');selection.hidden=false;selection.textContent='Illustrative ratings only, no real customer feedback';
}else{
 const list=document.querySelector('#review-list'),product=document.querySelector('#review-product'),rating=document.querySelector('#review-rating');
 products.filter(p=>reviews.some(r=>r.catalogue_handle===p.handle)).forEach(p=>{const o=document.createElement('option');o.value=p.handle;o.textContent=p.product;product.append(o);});
 function show(){const items=reviews.filter(r=>(!product.value||r.catalogue_handle===product.value)&&(!rating.value||r.rating===Number(rating.value)));list.replaceChildren(...items.map(sampleCard));document.querySelector('#review-summary').textContent='18 AI-generated samples · Not real customer reviews';document.querySelector('#review-status').textContent='Showing '+items.length+' sample cards.';}
 product.onchange=show;rating.onchange=show;show();
}
