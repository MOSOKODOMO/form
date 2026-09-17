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
 const valid={project:'Test',category:'precast',material:'Concrete',quantity:'2',dimensions:'1000 mm',finish:'Smooth',delivery:'2099-06-01',port:'Melbourne'};
 assert.equal(Object.keys(validate(valid)).length,0);
 assert.ok(validate({}).project);
 for(const quantity of ['0','-2','1.5','NaN'])assert.ok(validate({...valid,quantity}).quantity);
 assert.ok(validate({...valid,delivery:'2000-01-01'}).delivery);
 assert.ok(validate({...valid,port:'unlisted'}).port);
});
test('email links address the team and encode the full brief',()=>{
 const ctx=vm.createContext({});
 vm.runInContext(fs.readFileSync('dist/contact.js','utf8'),ctx);
 const href=vm.runInContext('mailtoHref',ctx)('Quote request — Test & Co',"Line 1\nMaterial: 钢材 100%");
 assert.ok(href.startsWith('mailto:s4149874@student.rmit.edu.au?subject='));
 const params=new URLSearchParams(href.split('?')[1]);
 assert.equal(params.get('subject'),'Quote request — Test & Co');
 assert.equal(params.get('body'),"Line 1\nMaterial: 钢材 100%");
});
