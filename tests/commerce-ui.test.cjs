const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function dom() {
  const nodes=new Map();
  const node=(tag,text='',className='')=>({tag,textContent:text,className,children:[],events:{},attributes:{},value:'',disabled:false,hidden:false,
    append(...items){this.children.push(...items);}, // Native append returns undefined.
    replaceChildren(...items){this.children=items;},
    addEventListener(name,callback){this.events[name]=callback;},
    setAttribute(key,value){this.attributes[key]=value;},
    querySelectorAll(selector){return this.children.flatMap(child=>[child,...child.querySelectorAll(selector)]).filter(child=>selector.split(',').includes(child.tag));},
    reportValidity(){return true;},
    elements:{namedItem(){return null;}},
  });
  const get=selector=>{if(!nodes.has(selector))nodes.set(selector,node('div'));return nodes.get(selector);};
  return {node,get,root:{querySelector:get,createElement:node}};
}

test('saved product cards render with native append behavior and keep team access visible',async()=>{
  const ui=dom(),errors=[];
  const products=[{id:'product-1',title:'Draft handle',status:'draft'}],sources=[{product_id:'product-1',canonical_url:'https://www.alibaba.com/product-detail/Handle_1600111111111.html',source_unit_minor:null}];
  const query={select(){return query;},order(){return query;},limit:async()=>({data:[]})};
  const code=fs.readFileSync(path.join(__dirname,'../dist/commerce-admin.js'),'utf8').replace(/import\s+[\s\S]*?from\s+"[^"\n]+";\s*/g,'');
  await vm.runInNewContext(`(async()=>{${code}})()`,{
    $:ui.get,node:ui.node,supabase:{from:()=>query},setupProductImport:()=>({clear(){}}),session:async()=>({}),invoke:async()=>({team:true}),
    read:async table=>({'fi_shop_categories':[{name:'Hardware',slug:'door-hardware'}],'fi_shop_products':products,'fi_product_sources':sources,'fi_warehouses':[]})[table],
    busy:()=>()=>{},safeLink:(_url,label)=>ui.node('a',label),status:(message,error)=>{if(error)errors.push(message);},URLSearchParams,location:{search:''},
  });
  assert.deepEqual(errors,[]);assert.equal(ui.get('#product-list').children.length,1);
  assert.equal(ui.get('#product-list').querySelectorAll('button')[0].textContent,'Edit');
  assert.match(ui.get('#access-note').textContent,/FI team access confirmed/);
  assert.equal(ui.get('#evidence-products').children[0].value,'product-1');
});

test('a payable order renders its checkout control without losing the card',async()=>{
  const ui=dom(),errors=[];
  const orders=[{id:'order-1',reference:'FI-O-TEST',status:'awaiting_payment',shipping_address:{city:'Test'},total_minor:1000,quote_expires_at:'2099-01-01',fi_shop_order_items:[],fi_order_shipments:[]}];
  const query={select(){return query;},eq(){return query;},order:async()=>({data:orders})};
  const code=fs.readFileSync(path.join(__dirname,'../dist/orders.js'),'utf8').replace(/import\s+[\s\S]*?from\s+"[^"\n]+";\s*/g,'');
  await vm.runInNewContext(`(async()=>{${code}})()`,{$:ui.get,node:ui.node,supabase:{from:()=>query},session:async()=>({user:{id:'user-1'}}),invoke:async()=>({team:false,checkout_enabled:false}),status:(message,error)=>{if(error)errors.push(message);},money:amount=>`$${amount/100}`});
  assert.deepEqual(errors,[]);assert.equal(ui.get('#orders').children.length,1);
  const button=ui.get('#orders').querySelectorAll('button')[0];assert.equal(button.textContent,'Checkout awaiting activation');assert.equal(button.disabled,true);
});

const draft={version:1,fields:{title:'Imported handle',source_url:'https://www.alibaba.com/product-detail/Handle_1600111111111.html',status:'published',image_permission_confirmed:true},warnings:['Check supplier claims.'],image_urls:[],references:[]};
function importerDom(){const ui=dom(),form=ui.get('#link-import-form');form.elements={source_url:ui.node('input'),pasted_text:ui.node('textarea')};form.elements.source_url.value=draft.fields.source_url;form.append(...Object.values(form.elements),ui.node('button'));return {...ui,form};}
const submit={preventDefault(){},submitter:{name:''}};
test('import preview leaves manual edits alone until applying, then uses the matched saved entry as a draft',async()=>{
  const {setupProductImport}=await import('../dist/product-import.js');const ui=importerDom(),applications=[];
  setupProductImport({root:ui.root,request:async()=>structuredClone(draft),apply:(...args)=>applications.push(args),chooseImage(){},findExisting:()=>({id:'saved-product',title:'Previous draft'})});
  await ui.form.events.submit(submit);
  assert.equal(applications.length,0);assert.equal(ui.get('#link-import-result').hidden,false);
  const apply=ui.get('#link-import-result').querySelectorAll('button').find(button=>button.textContent==='Update existing entry in editor');
  apply.events.click();assert.equal(applications[0][1],'saved-product');assert.equal(applications[0][0].status,'draft');assert.equal(applications[0][0].image_permission_confirmed,false);
  assert.equal(apply.disabled,true);assert.equal(ui.form.attributes['aria-busy'],'false');
});

test('clearing a pending import ignores its late response and failures restore the controls',async()=>{
  const {setupProductImport}=await import('../dist/product-import.js');const ui=importerDom();let resolve;
  const importer=setupProductImport({root:ui.root,request:()=>new Promise(done=>{resolve=done;}),apply:()=>assert.fail('unexpected edit'),chooseImage(){}});
  const pending=ui.form.events.submit(submit);assert.equal(ui.form.elements.source_url.disabled,true);
  importer.clear();resolve(structuredClone(draft));await pending;
  assert.equal(ui.get('#link-import-result').hidden,true);assert.equal(ui.form.elements.source_url.disabled,false);
  setupProductImport({root:ui.root,request:async()=>{throw new Error('Supplier blocked this request.');},apply(){},chooseImage(){}});
  await ui.form.events.submit(submit);
  assert.match(ui.get('#link-import-status').textContent,/Supplier blocked/);assert.equal(ui.get('#link-import-fallback').open,true);assert.equal(ui.form.elements.source_url.disabled,false);
});
