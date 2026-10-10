const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');

test('six steps take products through the warehouse before customer delivery and review',()=>{
 const html=read('how-it-works.html');
 const titles=[...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map(m=>m[1]);
 assert.deepEqual(titles.slice(0,6),['Choose your product','Confirm one AUD total','Manufacturer to warehouse','Inspect before dispatch','Deliver to you','Share your experience']);
 assert.match(html,/Failed items stay on hold/);
 assert.match(html,/passes inspection/);
 assert.match(html,/real paid order/);
 assert.match(html,/Australian Consumer Law/);
});
test('store journey has readable responsive layouts and real navigation links',()=>{
 assert.match(read('store.css'),/@media\(max-width:600px\)/);
 assert.match(read('how-it-works.html'),/href="returns.html"/);
 assert.match(read('how-it-works.html'),/href="shop.html"/);
});
