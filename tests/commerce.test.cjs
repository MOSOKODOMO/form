const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../supabase/functions/_shared/commerce.mjs');
const zeroCosts = {inbound_shipping_minor:0,inspection_minor:0,outbound_shipping_minor:0,duties_minor:0,tax_minor:0,payment_cost_minor:0};
test('10% source markup and inclusive vs absorbed costs use cents',async()=>{
  const {calculatePrice}=await modulePromise;
  assert.deepEqual(calculatePrice(1000,1,1,{...zeroCosts,outbound_shipping_minor:400},'costs_included'),{source:1000,markup:100,total:1500,contribution:100});
  assert.deepEqual(calculatePrice(1000,1,1,{...zeroCosts,outbound_shipping_minor:400},'absorb_costs'),{source:1000,markup:100,total:1100,contribution:-300});
  assert.equal(calculatePrice(1000,1.5,2,zeroCosts,'costs_included').total,3300);
  assert.throws(()=>calculatePrice(1000,1,1,{...zeroCosts,tax_minor:-1},'costs_included'));
  assert.throws(()=>calculatePrice(1000,1,1,zeroCosts,'unknown'));
});
test('source URL preserves original but removes Alibaba tracking; rejects unsafe destinations',async()=>{
  const {sourceLink}=await modulePromise;
  const raw='https://www.alibaba.com/product-detail/Handle_1600673981943.html?spm=tracking&priceId=abc';
  const link=sourceLink(raw);
  assert.equal(link.original_url,raw);assert.equal(link.canonical_url,'https://www.alibaba.com/product-detail/Handle_1600673981943.html');
  assert.equal(link.supplier_product_id,'1600673981943');
  for(const url of ['http://www.alibaba.com/product-detail/A_12.html','https://www.alibaba.com.evil.example/product-detail/A_12.html','https://localhost/test','https://user:pass@www.alibaba.com/product-detail/A_12.html','https://www.alibaba.com:444/product-detail/A_12.html'])assert.throws(()=>sourceLink(url));
});
test('addresses and baskets reject incomplete, duplicate and invalid records',async()=>{
  const {address,basket}=await modulePromise;
  const sample={name:'QA',line1:'1 Test Street',line2:'',city:'Sydney',state:'NSW',postal_code:'2000',country:'AU'};
  assert.deepEqual(address(sample),sample);assert.throws(()=>address({...sample,country:'Australia'}));assert.throws(()=>address({...sample,line1:''}));
  const item={product_id:'12345678-1234-4234-8234-123456789abc',quantity:1};
  assert.deepEqual(basket([item]),[item]);assert.throws(()=>basket([item,item]));assert.throws(()=>basket([{...item,quantity:-1}]));assert.throws(()=>basket([{...item,quantity:1.2}]));
});
test('checkout sends only approved AUD total, with locked delivery address and no extra charges',async()=>{
  const {checkoutPayload}=await modulePromise;
  const order={id:'order-1',user_id:'user-1',reference:'FI-QA',customer_email:'qa@example.invalid',total_minor:1500};
  const payload=checkoutPayload(order,'https://fabricationintelligence.com');
  assert.equal(payload.line_items[0].price_data.unit_amount,1500);assert.equal(payload.line_items[0].price_data.currency,'aud');
  assert.equal(payload.metadata.fi_user_id,'user-1');assert.equal(payload.shipping_address_collection,undefined);assert.equal(payload.payment_method_types,undefined);
  assert.equal(payload.automatic_tax,undefined);assert.equal(payload.adaptive_pricing.enabled,false);
  assert.throws(()=>checkoutPayload({...order,total_minor:0},'https://fabricationintelligence.com'));
});
test('provider session must match the saved order, amount, currency and payment environment',async()=>{
  const {assertCheckoutMatch}=await modulePromise;
  const attempt={stripe_session_id:'cs_test_qa',amount_minor:1500,order_id:'order-1',livemode:false};
  const session={id:'cs_test_qa',amount_total:1500,currency:'aud',livemode:false,client_reference_id:'order-1',metadata:{fi_order_id:'order-1'}};
  assert.doesNotThrow(()=>assertCheckoutMatch(attempt,session,false));
  for(const change of [{amount_total:1100},{currency:'usd'},{livemode:true},{id:'cs_other'},{client_reference_id:'other'},{metadata:{fi_order_id:'other'}}])assert.throws(()=>assertCheckoutMatch(attempt,{...session,...change},false));
});
