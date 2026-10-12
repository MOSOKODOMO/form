const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');

test('all orders pass through FI warehouse inspection before onward delivery',()=>{
 const html=read('how-it-works.html');
 const titles=[...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map(m=>m[1]);
 assert.deepEqual(titles.slice(0,4),['Order from FI','Sourced globally','Inspected by us','Delivered with care']);
 assert.match(html,/send your order to our warehouse/);
 assert.match(html,/inspect your products/);
 assert.match(html,/resolve it before sending your order/);
 assert.match(html,/Concept imagery · AI-generated/);
 assert.doesNotMatch(html,/ship(?:s|ped)? direct|does not inspect|optional inspection|100% defect-free/i);
 assert.match(read('shipping.html'),/inspect and pack your order before forwarding/);
 assert.doesNotMatch(read('index.html'),/No warehouse stop|supplier ships straight to you/);
 assert.match(html,/id="fi-verify"/,'the glass guide link still lands on this section');
});
test('store journey has readable responsive layouts and real navigation links',()=>{
 assert.match(read('store.css'),/@media\(max-width:600px\)/);
 assert.match(read('how-it-works.html'),/href="returns.html"/);
 assert.match(read('how-it-works.html'),/href="shop.html"/);
});
