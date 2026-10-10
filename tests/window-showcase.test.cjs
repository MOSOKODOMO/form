const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');

test('windows is a future category with collection and educational routes',()=>{
 const html=read('windows.html');
 assert.match(html,/Under consideration/);
 assert.match(html,/href="glass-guide.html"/);
 assert.match(html,/href="shop.html"/);
 assert.doesNotMatch(html,/window-comparison\.js|window-showcase\.js|<form|href="stage2.html#request"/);
});
