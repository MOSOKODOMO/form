const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
function ui(client) {
  const node=(tag,text='',className='')=>({tag,textContent:text,className,children:[],attributes:{},append(...items){this.children.push(...items);},setAttribute(key,value){this.attributes[key]=value;},addEventListener(){},querySelector(selector){for(const child of this.children){if(child.className.split(' ').includes(selector.slice(1)))return child;const found=child.querySelector(selector);if(found)return found;}return null;}});
  const code=read('review-ui.js').replace(/^import[^\n]+\n/gm,'').replace(/^export /gm,'');
  return {node,...vm.runInNewContext(`${code}\n({reviewCard,readReviews,summaryText,emptyReviews})`,{supabase:client,node,fetch:async()=>({ok:true,json:async()=>[]})})};
}
test('review content stays plain text, including malicious customer input',()=>{
  const render=ui({});
  const input='<img src=x onerror=alert(1)>';
  const card=render.reviewCard({rating:1,title:input,body:input,display_name:input,product_title:input,created_at:'2026-10-10',updated_at:'2026-10-10'});
  assert.equal(card.querySelector('.review-content').children[1].textContent,input);
  assert.equal(card.querySelector('.review-body').textContent,input);
  assert.equal(card.querySelector('.review-author-name').textContent,`By ${input}`);
  assert.equal(card.querySelector('.review-stars').attributes['aria-label'],'1 out of 5 stars');
  assert.equal(card.querySelector('.review-badge').textContent,'Verified purchase');
  assert.equal(card.querySelector('.review-product-picture').children[0].src,'assets/products/photo-coming-soon.svg');
});
test('review pagination and summary use the same product, handle and rating filters',async()=>{
  const calls=[];
  const query={select(value){calls.push(['select',value]);return this;},order(){return this;},range(a,b){calls.push(['range',a,b]);return this;},eq(a,b){calls.push(['eq',a,b]);return this;},then(resolve){resolve({data:[{rating:1}]});}};
  const client={from:()=>query,rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:[{review_count:41,average_rating:3.2}]};}};
  const render=ui(client);
  const result=await render.readReviews({product:'uuid',handle:'handle',rating:1,offset:20});
  assert.deepEqual(calls.find(call=>call[0]==='range'),['range',20,39]);
  assert.deepEqual(calls.filter(call=>call[0]==='eq'),[['eq','product_id','uuid'],['eq','catalogue_handle','handle'],['eq','rating',1]]);
  const args=calls.find(call=>call[0]==='rpc')[2];
  assert.equal(args.p_product,'uuid');assert.equal(args.p_handle,'handle');assert.equal(args.p_rating,1);
  assert.equal(render.summaryText(result.summary),'3.2 / 5 · 41 verified purchase reviews');
  assert.equal(render.summaryText({review_count:0,average_rating:null}),'No verified purchase reviews yet.');
});
test('database failures stay failures instead of becoming an empty review result',async()=>{
  const query={select(){return this;},order(){return this;},range(){return this;},then(resolve){resolve({error:new Error('Unavailable')});}};
  await assert.rejects(ui({from:()=>query,rpc:async()=>({data:[{}]})}).readReviews(),/Unavailable/);
});

test('featured reviews rank all ratings before pagination and retain the full review summary',async()=>{
  const calls=[];
  const query={select(){return this;},order(column,options={}){calls.push(['order',column,options.ascending]);return this;},range(a,b){calls.push(['range',a,b]);return this;},eq(){throw new Error('Featured reviews must not exclude low ratings');},then(resolve){resolve({data:[{rating:5},{rating:5},{rating:4}]});}};
  const client={from:()=>query,rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:[{review_count:18,average_rating:3.8}]};}};
  const render=ui(client);
  const result=await render.readReviews({sort:'highest',limit:3});
  assert.deepEqual(calls.filter(call=>call[0]==='order'),[['order','rating',false],['order','created_at',false],['order','id',undefined]]);
  assert.deepEqual(calls.find(call=>call[0]==='range'),['range',0,2]);
  assert.equal(calls.find(call=>call[0]==='rpc')[2].p_rating,null);
  assert.equal(render.summaryText(result.summary),'3.8 / 5 · 18 verified purchase reviews');
});

function homeReviews(readReviews) {
  const render=ui({});
  const elements={};
  for (const selector of ['#testimonial-list','#home-review-summary','#home-review-selection']) {
    const element=render.node('div');
    element.replaceChildren=function(...items){this.children=items;};
    elements[selector]=element;
  }
  const section={querySelector:selector=>elements[selector]};
  const code=read('home-reviews.js').replace(/^import[^\n]+\n/gm,'').replace(/^export /gm,'');
  const load=vm.runInNewContext(`${code}\nloadHomeReviews`,{document:{querySelector:()=>null},readReviews,node:render.node,reviewCard:render.reviewCard,summaryText:render.summaryText});
  return {elements,load:()=>load(section)};
}

test('homepage renders genuine reviews with the full summary and links to all ratings',async()=>{
  const review={rating:4,title:'Customer title',body:'Customer feedback',display_name:'Customer',product_title:'Handle',product_id:'product-id',created_at:'2026-10-10',updated_at:'2026-10-10'};
  const view=homeReviews(async()=>({reviews:[review],summary:{review_count:18,average_rating:3.8}}));
  await view.load();
  assert.equal(view.elements['#testimonial-list'].children.length,1);
  assert.equal(view.elements['#testimonial-list'].children[0].querySelector('.home-review-link').href,'reviews.html?product=product-id');
  assert.equal(view.elements['#home-review-summary'].textContent,'3.8 / 5 · 18 verified purchase reviews');
  assert.equal(view.elements['#home-review-selection'].hidden,false);
});

test('homepage does not fabricate review cards or ratings when empty or unavailable',async()=>{
  for (const fail of [false,true]) {
    const view=homeReviews(async()=>{if(fail)throw new Error('Unavailable');return {reviews:[],summary:{review_count:0,average_rating:null}};});
    await view.load();
    const children=view.elements['#testimonial-list'].children;
    assert.equal(children.some(child=>child.className.includes('review-card')),false);
    assert.equal(view.elements['#home-review-summary'].hidden,true);
    assert.equal(view.elements['#home-review-selection'].hidden,true);
    if(fail)assert.match(children[0].textContent,/temporarily unavailable/);
    else assert.match(children[0].children[0].textContent,/first to share/);
  }
});

test('review rows associate the catalogue image and label sample feedback honestly',()=>{
  const render=ui({});
  const review={rating:5,title:'Sample',body:'Fictional layout copy',display_name:'Sample customer',product_title:'Brass handle',catalogue_handle:'brass-handle',created_at:'2026-10-12',updated_at:'2026-10-12'};
  const card=render.reviewCard(review,{products:[{handle:'brass-handle',photo_url:'assets/products/brass.webp',photo_is_render:true}],sample:true});
  assert.equal(card.querySelector('.review-product-picture').href,'product.html?handle=brass-handle');
  assert.equal(card.querySelector('.review-product-picture').children[0].src,'assets/products/brass.webp');
  assert.equal(card.querySelector('.review-image-label').textContent,'AI render');
  assert.equal(card.querySelector('.review-badge').textContent,'Fictional sample');
  const unsafe=render.reviewCard(review,{products:[{handle:'brass-handle',photo_url:'javascript:alert(1)'}]});
  assert.equal(unsafe.querySelector('.review-product-picture').children[0].src,'assets/products/photo-coming-soon.svg');
});
test('product, order and account pages expose review routes without a comparison pricing page',()=>{
  assert.match(read('product.js'),/reviews\.dataset\.reviewHandle = product\.handle/);
  assert.match(read('product-reviews.js'),/document\.querySelector\('#product'\)/);
  assert.match(read('orders.js'),/realDelivered/);
  assert.match(read('orders.js'),/reviews\.html\?item=/);
  assert.match(read('account.html'),/reviews\.html#write-review/);
  assert.match(read('pricing.html'),/0;url=reviews\.html/);
  assert.doesNotMatch(read('reviews.html'),/price-table|first 10 projects|Free to compare/i);
});
