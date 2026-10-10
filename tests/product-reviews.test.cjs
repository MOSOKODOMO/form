const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
function ui(client) {
  const node=(tag,text='',className='')=>({tag,textContent:text,className,children:[],attributes:{},append(...items){this.children.push(...items);},setAttribute(key,value){this.attributes[key]=value;}});
  const code=read('review-ui.js').replace(/^import[^\n]+\n/gm,'').replace(/^export /gm,'');
  return {node,...vm.runInNewContext(`${code}\n({reviewCard,readReviews,summaryText,emptyReviews})`,{supabase:client,node})};
}
test('review content stays plain text, including malicious customer input',()=>{
  const render=ui({});
  const input='<img src=x onerror=alert(1)>';
  const card=render.reviewCard({rating:1,title:input,body:input,display_name:input,product_title:input,created_at:'2026-10-10',updated_at:'2026-10-10'});
  assert.equal(card.children[1].textContent,input);
  assert.equal(card.children[2].textContent,input);
  assert.match(card.children[3].textContent,/<img/);
  assert.equal(card.children[0].children[0].attributes['aria-label'],'1 out of 5 stars');
  assert.equal(card.children[0].children[1].textContent,'Verified purchase');
  assert.equal(card.children.filter(child=>child.tag==='img').length,0);
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
test('product, order and account pages expose review routes without a comparison pricing page',()=>{
  assert.match(read('product.js'),/reviews\.dataset\.reviewHandle = product\.handle/);
  assert.match(read('product-reviews.js'),/document\.querySelector\('#product'\)/);
  assert.match(read('orders.js'),/realDelivered/);
  assert.match(read('orders.js'),/reviews\.html\?item=/);
  assert.match(read('account.html'),/reviews\.html#write-review/);
  assert.match(read('pricing.html'),/0;url=reviews\.html/);
  assert.doesNotMatch(read('reviews.html'),/price-table|first 10 projects|Free to compare/i);
});
