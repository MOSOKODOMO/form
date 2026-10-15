const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const FI = require('../dist/catalogue.js');
const products = require('../dist/data/products.json');
const source = fs.readFileSync(path.join(__dirname, '../dist/shop.js'), 'utf8');

async function shop(query = '') {
  const element = (extra = {}) => ({value:'', textContent:'', hidden:false, disabled:false, children:[], events:{}, attrs:{}, dataset:{},
    addEventListener(k,fn){this.events[k]=fn;}, setAttribute(k,v){this.attrs[k]=v;}, removeAttribute(k){delete this.attrs[k];},
    append(...nodes){this.children.push(...nodes);}, replaceChildren(...nodes){this.children=nodes;}, focus(){}, ...extra});
  const category = element({options:['all',...FI.CATEGORY_IDS].map(value=>element({value}))});
  const finish = element({options:['all',...FI.FINISH_IDS].map(value=>element({value}))});
  const rooms = ['all',...FI.ROOM_IDS].map(room => element({dataset:{room},querySelector:()=>element()}));
  const selectors = {'#shop-category':category, '#shop-finish':finish};
  for (const key of ['#product-grid','#shop-status','#sample-banner','#shop-search','#shop-sort','#shop-reset','.shop-products-heading h2','.shop-products-heading p']) selectors[key]=element();
  const document = {querySelector:s=>selectors[s], querySelectorAll:()=>rooms, createElement:()=>element(), dispatchEvent(){}};
  const window = {location:new URL('https://example.com/shop.html'+query), events:{}, FICatalogue:{...FI,loadProducts:async()=>products}, FIProductCard:{card:p=>p},
    addEventListener(k,fn){this.events[k]=fn;}, history:{}};
  for(const method of ['pushState','replaceState']) window.history[method]=(_state,_title,url)=>{window.location=new URL(url);};
  vm.runInNewContext(source,{document,window,URL,URLSearchParams,Event,console});
  await new Promise(resolve=>setImmediate(resolve));
  return {category,finish,rooms,window,selectors, change(select,value){select.value=value;select.events.change();}, grid:()=>selectors['#product-grid'].children};
}

test('room, hardware type and finish combine without losing the selected room', async()=>{
  const s=await shop();
  s.rooms.find(b=>b.dataset.room==='kitchen').events.click();
  s.change(s.category,'handles');
  s.change(s.finish,'black');
  const expected=FI.filterByFinish(FI.filterByCategory(FI.filterByRoom(FI.listedProducts(products),'kitchen'),'handles'),'black');
  assert.ok(expected.length>0);
  assert.deepEqual(s.grid().map(p=>p.handle).sort(),expected.map(p=>p.handle).sort());
  assert.deepEqual(Object.fromEntries(s.window.location.searchParams),{room:'kitchen',category:'handles',finish:'black'});
  assert.equal(s.category.value,'handles');
  assert.equal(s.finish.value,'black');
  assert.ok(s.category.options.find(o=>o.value==='bathroom').hidden);
  s.change(s.finish,'all');
  assert.equal(s.category.value,'handles');
  assert.deepEqual(Object.fromEntries(s.window.location.searchParams),{room:'kitchen',category:'handles'});
  s.rooms.find(b=>b.dataset.room==='bathroom').events.click();
  assert.equal(s.category.value,'all');
  assert.equal(s.finish.value,'all');
  assert.ok(s.grid().every(p=>p.category==='bathroom'));
  assert.equal(s.category.options.find(o=>o.value==='bathroom').hidden,false);
});

test('shared URLs, browser back, search, sort and clear keep dropdown state in sync', async()=>{
  const s=await shop('?room=kitchen&category=knobs&finish=brass');
  assert.equal(s.category.value,'knobs');
  assert.equal(s.finish.value,'brass');
  assert.ok(s.grid().every(p=>p.category==='knobs' && FI.finishesOf(p).includes('brass')));
  s.selectors['#shop-search'].value='ribbed';s.selectors['#shop-search'].events.input();
  assert.ok(s.grid().length>0 && s.grid().every(p=>/ribbed/i.test(p.product)));
  s.selectors['#shop-sort'].value='name';s.selectors['#shop-sort'].events.change();
  assert.equal(s.window.location.search.includes('sort=name'),true);
  s.window.location=new URL('https://example.com/shop.html?room=entry&finish=silver');s.window.events.popstate();
  assert.equal(s.category.value,'all');assert.equal(s.finish.value,'silver');
  assert.ok(s.grid().every(p=>p.category==='doors'));
  s.selectors['#shop-reset'].events.click();
  assert.equal(s.window.location.search,'');assert.equal(s.category.value,'all');assert.equal(s.finish.value,'all');
  assert.equal(s.grid().length,FI.listedProducts(products).length);
});

test('empty filtered results retain selected values and can be cleared',async()=>{
  const s=await shop('?room=kitchen&category=handles&finish=black&q=nonexistent-zzzz');
  assert.equal(s.category.value,'handles');assert.equal(s.finish.value,'black');
  assert.equal(s.grid()[0].className,'shop-empty');
  assert.match(s.selectors['#shop-status'].textContent,/^0 products/);
  assert.equal(s.category.options.find(o=>o.value==='handles').hidden,false);
  s.selectors['#shop-reset'].events.click();
  assert.ok(s.grid().length>1);
});
