const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const modulePromise=import('../supabase/functions/_shared/product-import.mjs');
const url='https://www.alibaba.com/product-detail/Fixture-Brass-Lever_1600111111111.html?spm=tracking';
const canonical=url.split('?')[0];
const details={globalData:{product:{productId:1600111111111,subject:'Fixture brass door lever',moq:2,
  productBasicProperties:[{attrName:'Material',attrValue:'Brass'},{attrName:'Model Number',attrValue:'QA-1'}],
  price:{productRangePrices:{dollarPriceRangeLow:12,dollarPriceRangeHigh:18}},
  sku:{skuAttrs:[{name:'Finish',values:[{name:'Satin'},{name:'Polished'}]}]},
  mediaItems:[{type:'image',imageUrl:{big:'https://sc04.alicdn.com/kf/fixture.jpg'}}]},
  seller:{companyName:'Fixture supplier',companyProfileUrl:'https://fixture.en.alibaba.com/company_profile.html'}},nodeMap:{}};
const ld={ '@type':'Product','@id':'1600111111111',name:'Fixture brass door lever',image:['https://sc04.alicdn.com/kf/fixture.jpg'],offers:{'@type':'Offer',price:'12.00',priceCurrency:'USD'},additionalProperty:[{name:'Material',value:'Brass'}]};
function page(data=details,product=ld){return `<html><head><script type="application/ld+json">${JSON.stringify(product)}</script></head><body><h1>Fixture brass door lever</h1><script>window.detailData = ${JSON.stringify(data)};</script></body></html>`;}

test('realistic Alibaba data fills a reviewable draft without turning a variant range into a unit quote',async()=>{
  const {extractProduct}=await modulePromise;
  const result=extractProduct({source_url:url,html:page(),fetched_at:'2026-10-08T01:00:00Z'});
  assert.equal(result.fields.title,'Fixture brass door lever');
  assert.equal(result.fields.supplier_name,'Fixture supplier');
  assert.equal(result.fields.category_slug,'door-hardware');
  assert.equal(result.fields.sku,'QA-1');
  assert.match(result.fields.description,/Material: Brass/);
  assert.equal(result.fields.source_price,'');assert.equal(result.fields.source_currency,'USD');
  assert.equal(result.fields.min_quantity,2);assert.equal(result.fields.supplier_variant,'');
  assert.deepEqual(JSON.parse(result.fields.variant_options),{Finish:['Satin','Polished']});
  assert.equal(result.fields.fx_to_aud,'');assert.equal(result.fields.valid_until,'');
  assert.equal(result.fields.status,'draft');assert.equal(result.fields.reviewed,false);assert.equal(result.fields.image_permission_confirmed,false);
  assert.equal(result.source_url,url);assert.equal(result.canonical_url,canonical);
  assert.equal(result.image_urls.length,1);assert.equal(result.references.length,2);
  assert.ok(result.references.every(r=>r.status==='supplier_stated'));
});

test('JSON-LD fallback handles graphs and entities, keeps unknown values empty, and never treats a brand as the supplier',async()=>{
  const {extractProduct}=await modulePromise;
  const result=extractProduct({source_url:url,html:page({}, {'@graph':[{...ld,name:'Brass &amp; satin knob',brand:{name:'A brand'},offers:{'@type':'Offer',price:'12.50',priceCurrency:'AUD'}}]})});
  assert.equal(result.fields.title,'Brass & satin knob');assert.equal(result.fields.supplier_name,'');
  assert.equal(result.fields.source_price,'12.50');assert.equal(result.fields.min_quantity,'');
  assert.equal(result.fields.source_currency,'AUD');assert.equal(result.fields.fx_to_aud,'');
  assert.ok(result.warnings.some(w=>w.includes('Minimum order')));
});

test('mismatched product IDs, login pages and empty pages produce actionable failures',async()=>{
  const {extractProduct}=await modulePromise;
  for(const html of [page({...details,globalData:{...details.globalData,product:{...details.globalData.product,productId:1600222222222}}}),page({}, {...ld,'@id':'1600222222222'}),'<title>Security verification</title><p>Slide to verify</p>','<html></html>'])assert.throws(()=>extractProduct({source_url:url,html}),e=>e.status===422);
});

test('pasted supplier text needs an explicit title and never silently fetches another page',async()=>{
  const {extractProduct}=await modulePromise;
  const result=extractProduct({source_url:url,pasted_text:'Product title: Brass door lever\nSupplier: Fixture supplier\nMaterial: Brass\nModel Number: B-1\nMOq: 4 pieces\nLead time: Quantity (pieces)'});
  assert.equal(result.method,'pasted_text');assert.equal(result.fields.title,'Brass door lever');assert.equal(result.fields.min_quantity,4);
  assert.equal(JSON.parse(result.fields.specifications)['Lead time'],undefined);
  assert.equal(result.image_urls.length,0);assert.equal(result.fields.source_price,'');
  assert.throws(()=>extractProduct({source_url:url,pasted_text:'Unidentified copied content without a product name.'}),e=>e.status===422);
});

test('page scripts, unsafe images and prototype keys cannot become executable input or trusted claims',async()=>{
  const {extractProduct,safeSupplierImage}=await modulePromise;
  const malicious=JSON.parse(JSON.stringify(details));
  malicious.globalData.product.productBasicProperties.push({attrName:'__proto__',attrValue:'polluted'},{attrName:'constructor',attrValue:'bad'});
  malicious.globalData.product.mediaItems.push({type:'image',imageUrl:{big:'https://127.0.0.1/private.jpg'}});
  const result=extractProduct({source_url:url,html:page(malicious)+`<script>globalThis.importerPwned=true</script>`});
  assert.equal(globalThis.importerPwned,undefined);assert.equal({}.polluted,undefined);
  assert.equal(Object.hasOwn(JSON.parse(result.fields.specifications),'__proto__'),false);
  assert.equal(result.image_urls.length,1);
  for(const image of ['javascript:alert(1)','https://sc04.alicdn.com.evil.test/a.jpg','https://sc04.alicdn.com@127.0.0.1/a.jpg','https://sc04.alicdn.com:8080/a.jpg','https://sc04.alicdn.com/a.svg'])assert.equal(safeSupplierImage(image),null);
});

test('robots rules use the importing agent, longest paths and allow ties',async()=>{
  const {robotsAllow}=await modulePromise;
  assert.equal(robotsAllow('User-agent: *\nDisallow: /\nAllow: /product-detail/','/product-detail/a.html'),true);
  assert.equal(robotsAllow('User-agent: *\nDisallow: /product-detail/','/product-detail/a.html'),false);
  assert.equal(robotsAllow('User-agent: *\nDisallow: /*.html$','/product-detail/a.html'),false);
  assert.equal(robotsAllow('User-agent: *\nAllow: /\nUser-agent: FabricationIntelligenceImporter\nDisallow: /','/product-detail/a.html'),false);
  assert.equal(robotsAllow('User-agent: *\nDisallow: /x\nAllow: /x','/x'),true);
});

test('import uses only allowed supplier destinations and never follows private or login redirects',async()=>{
  const {importSupplierLink}=await modulePromise;
  for(const destination of ['http://127.0.0.1','https://127.0.0.1/','https://www.alibaba.com.evil.test/x','https://user:secret@www.alibaba.com/product-detail/a_1600111111111.html']){
    await assert.rejects(importSupplierLink(destination,{fetchImpl:()=>assert.fail('unsafe URL fetched')}));
  }
  for(const location of ['http://169.254.169.254/latest/meta-data','https://login.alibaba.com/','https://www.alibaba.com/product-detail/Other_1600222222222.html']){
    const calls=[];
    await assert.rejects(importSupplierLink(url,{fetchImpl:async (target,options)=>{
      calls.push(target);assert.equal(options.redirect,'manual');
      return target.endsWith('robots.txt') ? new Response('User-agent: *\nAllow: /') : new Response(null,{status:302,headers:{location}});
    }}));assert.equal(calls.length,2);
  }
});

test('polite import respects denial, bounds response bytes, handles timeouts and extracts allowed pages',async()=>{
  const {importSupplierLink,readLimitedText}=await modulePromise;
  let pages=0;
  await assert.rejects(importSupplierLink(url,{fetchImpl:async()=>{pages++;return new Response('User-agent: *\nDisallow: /');}}));assert.equal(pages,1);
  await assert.rejects(readLimitedText(new Response('123456'),5),e=>e.status===413);
  await assert.rejects(importSupplierLink(url,{fetchImpl:async()=>{throw new Error('network timeout with private diagnostic');}}),e=>e.status===502 && !e.message.includes('private diagnostic'));
  const calls=[];
  const draft=await importSupplierLink(url,{fetchImpl:async target=>{calls.push(target);return target.endsWith('robots.txt')?new Response('User-agent: *\nAllow: /'):new Response(page(),{headers:{'content-type':'text/html'}});}});
  assert.deepEqual(calls,['https://www.alibaba.com/robots.txt',canonical]);assert.equal(draft.fields.title,'Fixture brass door lever');
});

function client({user=true,team=true,count=0,dbError=false}={}){
  const writes=[];
  return {writes,auth:{getUser:async()=>({data:{user:user?{id:'00000000-0000-4000-8000-000000000001',email:'admin@example.test',email_confirmed_at:'2026-10-01'}:null}})},from(table){
    const chain={select(){return chain;},eq(){return chain;},gte(){return Promise.resolve({count,error:dbError?{message:'private db detail'}:null});},maybeSingle:async()=>({data:team?{role:'admin'}:null}),insert:async values=>{writes.push({table,values});return {error:null};}};return chain;
  }};
}
const request=(body={source_url:url},headers={})=>new Request('https://example.test/import',{method:'POST',headers:{origin:'https://fabricationintelligence.com',authorization:'Bearer test-token','content-type':'application/json',...headers},body:JSON.stringify(body)});
test('endpoint authorizes verified FI members and enforces throttle before any supplier fetch',async()=>{
  const {handleProductImport}=await import('../supabase/functions/_shared/product-import-handler.mjs');
  for(const [options,headers,expected] of [[{}, {authorization:''},401],[{user:false},{},401],[{team:false},{},403],[{count:8},{},429],[{dbError:true},{},503],[{}, {origin:'https://evil.test'},403]]){
    const db=client(options),response=await handleProductImport(request(undefined,headers),{client:db,fetchImpl:()=>assert.fail('unauthorized supplier fetch')});
    assert.equal(response.status,expected);assert.equal(db.writes.length,0);assert.doesNotMatch(await response.text(),/private db detail/);
  }
});

test('authorized pasted import writes an audit only, without publishing, saving products or fetching',async()=>{
  const {handleProductImport}=await import('../supabase/functions/_shared/product-import-handler.mjs');const db=client();
  const response=await handleProductImport(request({source_url:url,pasted_text:'Product title: Brass handle\nMaterial: Brass\nSupplier: Test company'}),{client:db,fetchImpl:()=>assert.fail('pasted data must not fetch')});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await response.json()).fields.status,'draft');assert.equal(db.writes.length,1);assert.equal(db.writes[0].table,'fi_commerce_audit');assert.equal(db.writes[0].values.details.method,'pasted_text');
});

test('UI draft mapping cannot import a record ID, publication approval or photo permission',async()=>{
  const {importedFields}=await import('../dist/product-import.js');
  const fields=importedFields({version:1,fields:{title:'Test',source_url:url,id:'existing-id',status:'published',reviewed:true,image_permission_confirmed:true}});
  assert.equal(fields.id,undefined);assert.equal(fields.status,'draft');assert.equal(fields.reviewed,false);assert.equal(fields.image_permission_confirmed,false);
});
