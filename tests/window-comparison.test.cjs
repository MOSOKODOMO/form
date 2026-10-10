const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');

test('retired comparison amounts and benchmark tables are absent from public windows and pricing routes',()=>{
 for(const page of ['windows.html','pricing.html','services.html']) assert.doesNotMatch(read(page),/A\$356\.55|A\$742\.50|Stegbar|price-table|quote-card|first 10 projects/i);
 assert.match(read('pricing.html'),/url=reviews.html/);
});
test('fee uses the manufacturer product price and keeps other agreed costs in one AUD total',()=>{
 assert.match(read('services.html'),/10% of the initial product price/);
 assert.match(read('services.html'),/not calculated on freight, duties or tax/);
 assert.match(read('shipping.html'),/One inclusive AUD total/);
});
