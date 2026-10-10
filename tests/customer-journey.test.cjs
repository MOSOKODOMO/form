const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');

test('six steps take a shop order from checkout straight to the customer and on to a review',()=>{
 const html=read('how-it-works.html');
 const titles=[...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map(m=>m[1]);
 assert.deepEqual(titles.slice(0,6),['Choose your product','Pay at checkout','We place your order','Shipped direct to you','We sort any problem','Share your experience']);
 assert.match(html,/FI does not inspect them before delivery/);
 assert.match(html,/supplier’s estimate, not a guarantee/);
 assert.match(html,/real paid order/);
 assert.match(html,/Australian Consumer Law/);
 assert.match(html,/id="fi-verify"/,'the glass guide link still lands on this section');
});
test('store journey has readable responsive layouts and real navigation links',()=>{
 assert.match(read('store.css'),/@media\(max-width:600px\)/);
 assert.match(read('how-it-works.html'),/href="returns.html"/);
 assert.match(read('how-it-works.html'),/href="shop.html"/);
});
