const {test}=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto').webcrypto;
const handler=import('../supabase/functions/_shared/enquiry-handler.mjs');
const body={submission_key:'00000000-0000-4000-8000-000000000001',name:'Test Buyer',email:'buyer@example.invalid',relationship:'buyer',message:'A product enquiry.'};
const request=(input=body,headers={})=>new Request('https://example.test',{method:'POST',headers:{origin:'https://fabricationintelligence.com',apikey:'test-key','content-type':'application/json','x-forwarded-for':'192.0.2.1',...headers},body:JSON.stringify(input)});
test('enquiry intake validates origin, API key, roles and sizes before touching the database',async()=>{
  const {handleEnquiry}=await handler;
  for(const [input,headers,status] of [[body,{origin:'https://evil.test'},403],[body,{apikey:''},401],[{...body,relationship:'admin'},{},400],[{...body,relationship:'applicant',position:'ceo'},{},400],[{...body,email:'bad'},{},400],[{...body,message:'x'.repeat(4001)},{},400],[{...body,relationship:'applicant',position:'warehouse-inspector',portfolio:'javascript:alert(1)'},{},400]]) {
    const result=await handleEnquiry(request(input,headers),{client:{rpc:()=>assert.fail('invalid input reached database')},publishableKey:'test-key',cryptoImpl:crypto});assert.equal(result.status,status);
  }
});
test('intake persists only note fields and a daily IP hash, without accepting privilege claims',async()=>{
  const {handleEnquiry}=await handler;let args;
  const response=await handleEnquiry(request({...body,role:'admin',user_id:'someone-else',status:'closed'}),{client:{rpc:async(name,values)=>{assert.equal(name,'fi_capture_enquiry');args=values;return {data:'saved-id'};}},publishableKey:'test-key',cryptoImpl:crypto});
  assert.equal(response.status,200);assert.equal((await response.json()).saved,true);assert.equal(args.p_data.role,undefined);assert.equal(args.p_data.user_id,undefined);assert.equal(args.p_data.status,undefined);assert.equal(args.p_rate_key.length,64);assert.doesNotMatch(JSON.stringify(args),/192\.0\.2\.1/);
});
test('rate limiting and database failures surface useful errors without private diagnostics',async()=>{
  const {handleEnquiry}=await handler;
  for(const [code,status] of [['P0001',429],['XX000',503]]) {
    const response=await handleEnquiry(request(),{client:{rpc:async()=>({error:{code,message:'PRIVATE SQL DETAIL'}})},publishableKey:'test-key',cryptoImpl:crypto});assert.equal(response.status,status);assert.doesNotMatch(await response.text(),/PRIVATE SQL DETAIL/);
  }
});
