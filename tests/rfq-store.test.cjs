const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync('dist/rfq-store.js','utf8');
function boot(storage){const ctx=vm.createContext({localStorage:storage,crypto:webcrypto});vm.runInContext(source,ctx);return vm.runInContext('RFQStore',ctx);}
function storage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};}
test('requests survive a new session, keep independent references, and edit without duplication',()=>{
 const disk=storage(),store=boot(disk),first=store.save({project:'A',quantity:'2',drawing:'A.pdf'}),second=store.save({project:'B'});
 assert.notEqual(first.id,second.id);
 const reloaded=boot(disk);assert.equal(reloaded.read().length,2);assert.equal(reloaded.read().find(r=>r.id===first.id).brief.drawing,'A.pdf');
 const edited=reloaded.save({project:'A',quantity:'3'},first.id);assert.equal(edited.id,first.id);assert.equal(edited.createdAt,first.createdAt);assert.equal(reloaded.read().length,2);assert.equal(reloaded.read().find(r=>r.id===first.id).brief.quantity,'3');
 assert.throws(()=>reloaded.save({},'missing'));
});
test('corrupt storage is preserved and write failures are surfaced',()=>{
 const disk=storage();disk.setItem('fi.rfqs.v1','corrupt');const store=boot(disk);assert.throws(()=>store.save({project:'A'}));assert.equal(disk.getItem('fi.rfqs.v1'),'corrupt');
 const full=boot({getItem:()=>null,setItem:()=>{throw Error('quota');}});assert.throws(()=>full.save({project:'A'}),/quota/);
});
test('brief validation rejects missing fields, fractional quantities, past dates and unknown ports',()=>{
 const ctx=vm.createContext({t:en=>en,Date,URLSearchParams,location:{search:'?view=catalogue'}});
 vm.runInContext(fs.readFileSync('dist/rfq.js','utf8'),ctx);
 const validate=vm.runInContext('rfqValidate',ctx);
 const valid={contactName:'Alex',email:'alex@example.com',project:'Test',category:'precast',material:'Concrete',quantity:'2',dimensions:'1000 mm',finish:'Smooth',delivery:'2099-06-01',port:'Melbourne'};
 assert.equal(Object.keys(validate(valid)).length,0);
 assert.ok(validate({}).project);
 assert.ok(validate({}).email);
 for(const email of ['alex','alex@','alex@example','a b@example.com'])assert.ok(validate({...valid,email}).email);
 for(const quantity of ['0','-2','1.5','NaN'])assert.ok(validate({...valid,quantity}).quantity);
 assert.ok(validate({...valid,delivery:'2000-01-01'}).delivery);
 assert.ok(validate({...valid,port:'unlisted'}).port);
});
function bootContact(fetch){const ctx=vm.createContext({fetch,JSON,String,Error});vm.runInContext(fs.readFileSync('dist/contact.js','utf8'),ctx);return vm.runInContext('sendRequest',ctx);}
test('requests are posted to the team inbox with reply-to and the full brief',async()=>{
 let call;
 const send=bootContact(async(url,options)=>{call={url,options};return {ok:true,json:async()=>({success:'true'})};});
 await send({subject:'Quote request — Test & Co',name:'Alex',replyTo:'alex@example.com',text:"Line 1\nMaterial: 钢材 100%"});
 assert.equal(call.url,'https://formsubmit.co/ajax/s4149874@student.rmit.edu.au');
 assert.equal(call.options.method,'POST');
 const body=JSON.parse(call.options.body);
 assert.equal(body._subject,'Quote request — Test & Co');
 assert.equal(body.email,'alex@example.com');
 assert.equal(body.message,"Line 1\nMaterial: 钢材 100%");
});
test('failed or unconfirmed sends are reported, not treated as sent',async()=>{
 await assert.rejects(bootContact(async()=>({ok:true,json:async()=>({success:'false',message:'This form needs Activation.'})}))({text:'x'}),/Activation/);
 await assert.rejects(bootContact(async()=>({ok:false,status:500,json:async()=>{throw Error('no json');}}))({text:'x'}),/HTTP 500/);
 await assert.rejects(bootContact(async()=>{throw TypeError('Failed to fetch');})({text:'x'}),/Failed to fetch/);
});
