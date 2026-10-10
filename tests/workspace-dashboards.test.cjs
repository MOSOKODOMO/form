const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
function dom(){const nodes=new Map();const node=(tag,text='',className='')=>({tag,textContent:text,className,children:[],events:{},hidden:true,value:'all',append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},addEventListener(name,callback){this.events[name]=callback;},setAttribute(name,value){this[name]=value;}});const get=selector=>{if(!nodes.has(selector))nodes.set(selector,node('div'));return nodes.get(selector);};return {node,get,nodes,document:{querySelector:get,createElement:node}};}
const strip=source=>source.replace(/import\s+[\s\S]*?from\s+['"][^'"\n]+['"];\s*/g,'').replace(/export\s*\{[^}]+\};?/g,'').replace(/export\s+/g,'');
async function core({user={id:'customer'},authError=null,access={admin:false,supplier:false,supplier_requested:false},rpcError=null}={}) {
  const ui=dom(),redirects=[],calls=[];let authCallback;
  const supabase={auth:{getUser:async()=>({data:{user},error:authError}),signOut:async()=>({}),onAuthStateChange(fn){authCallback=fn;}},rpc:async name=>{calls.push(name);return {data:access,error:rpcError};}};
  const funcs=await vm.runInNewContext(`(async()=>{${strip(read('workspace-client.js'))};return {authorize,dashboardPath,run,message,setVisible,stats};})()`,{supabase,document:ui.document,node:ui.node,location:{replace:url=>redirects.push(url)},isAuthSessionMissingError:error=>error?.missing,});
  return {...ui,...funcs,redirects,calls,authCallback};
}
test('routing prioritises approved admin and supplier access, with no public admin sign-up',async()=>{
  const app=await core();
  assert.equal(app.dashboardPath({admin:true,supplier:true}),'admin.html');
  assert.equal(app.dashboardPath({supplier:true}),'supplier.html');
  assert.equal(app.dashboardPath({supplier_requested:true}),'supplier.html');
  assert.equal(app.dashboardPath({user_metadata:{role:'admin'}}),'customer.html');
  assert.match(read('auth.js'),/next\) \|\| 'dashboard.html'|get\('next'\) \|\| 'dashboard.html'/);
  assert.doesNotMatch(read('auth.html'),/href="admin.html"|value="admin"/);
});
test('signed-out and denied accounts never open private dashboard content',async()=>{
  const out=await core({user:null,authError:{missing:true}});
  await out.run(()=>out.authorize('customer'));assert.deepEqual(out.redirects,['auth.html?next=customer.html']);assert.equal(out.calls.length,0);assert.equal(out.get('#workspace').hidden,true);
  const denied=await core();await denied.run(()=>denied.authorize('admin'));assert.equal(denied.get('#workspace').hidden,true);assert.match(denied.get('#workspace-status').textContent,/restricted/);
  const network=await core({authError:{message:'offline'}});await network.run(()=>network.authorize('supplier'));assert.equal(network.calls.length,0);assert.equal(network.redirects.length,0);assert.match(network.get('#workspace-status').textContent,/could not verify/);
  const failed=await core({rpcError:{message:'Permissions unavailable'}});await failed.run(()=>failed.authorize('admin'));assert.equal(failed.get('#workspace').hidden,true);assert.match(failed.get('#workspace-status').textContent,/Permissions unavailable/);
  const revoked=await core();revoked.get('#workspace').hidden=false;revoked.authCallback('SIGNED_OUT');assert.equal(revoked.get('#workspace').hidden,true);
});
async function page(name,data,{denied=false,fetchError=false}={}) {
  const ui=dom(),errors=[],stats=[];let visible=false,reads=0;
  await vm.runInNewContext(`(async()=>{${strip(read(name))}})()`,{
    $:ui.get,node:ui.node,supabase:{},authorize:async()=>{if(denied)throw new Error('Denied');return {user:{id:'user'}};},
    rpc:async()=>{reads++;return data;},stats:values=>stats.push(values),
    money:n=>`$${(n/100).toFixed(2)}`,label:v=>String(v||'Not recorded').replaceAll('_',' '),date:()=> '10/10/2026',
    link:(_url,label)=>ui.node('a',label),safeLink:(_url,label)=>ui.node('a',label),
    table:(target,headers,rows)=>ui.get(target).rows=rows,empty:(target,text)=>ui.get(target).replaceChildren(ui.node('p',text)),
    message:(value,error)=>{if(error)errors.push(value);},setVisible:value=>visible=value,
    run:async fn=>{try{await fn();}catch(error){visible=false;errors.push(error.message);}},
    fetch:async()=>({ok:!fetchError,json:async()=>[]}),URL,
  });return {...ui,errors,stats,get visible(){return visible;},reads};
}
test('customer purchase reviews require a real delivered order, not test payments or status alone',async()=>{
  const order={id:'one',reference:'FI-ONE',status:'delivered',created_at:'2026-10-10',total_minor:1000,items:[{id:'item',title:'<img src=x onerror=alert(1)>',quantity:2}],payment:{livemode:true,status:'paid',amount_received_minor:1000,refunded_minor:100},shipments:[{status:'delivered',delivered_at:'2026-10-10'}],returns:[]};
  const app=await page('customer-dashboard.js',{orders:[order,{...order,id:'two',payment:{...order.payment,livemode:false}},{...order,id:'three',shipments:[]}]});
  assert.equal(app.visible,true);assert.equal(app.get('#customer-purchases').children.length,1);assert.equal(app.get('#customer-purchases').children[0].children[0].textContent,'<img src=x onerror=alert(1)>');
  assert.equal(app.stats[0].find(([label])=>label==='Net paid (AUD)')[1],'$18.00');
  assert.doesNotMatch(read('customer-dashboard.js'),/innerHTML/);
});
test('unapproved suppliers see an onboarding state with no supplier tools or invented orders',async()=>{
  const app=await page('supplier-dashboard.js',{approved:false,products:[],shop_products:[],purchases:[],returns:[]});
  assert.equal(app.get('#supplier-pending').hidden,false);assert.equal(app.get('#supplier-approved').hidden,true);assert.equal(app.visible,true);assert.equal(app.stats[0][0][1],0);
});
test('supplier product counts deduplicate a connected website listing and show warehouse statuses',async()=>{
  const app=await page('supplier-dashboard.js',{approved:true,products:[{id:'item',title:'Handle',status:'approved'}],shop_products:[{id:'product',title:'Handle',status:'published',catalogue_item_id:'item'}],purchases:[{id:'po',title:'Handle',reference:'FI-1',quantity:2,status:'ordered',warehouse:{name:'Warehouse'},inspection:null}],returns:[]});
  assert.equal(app.stats[0][0][1],1);assert.equal(app.stats[0][2][1],1);assert.match(app.get('#supplier-deliveries').rows[0][2],/ordered/);
});
test('admin denial happens before reading records, and loading errors do not become zero sales',async()=>{
  const denied=await page('admin-dashboard.js',{}, {denied:true});assert.equal(denied.reads,0);assert.equal(denied.visible,false);
  const failed=await page('admin-dashboard.js',{}, {fetchError:true});assert.equal(failed.visible,false);assert.equal(failed.stats.length,0);assert.match(failed.errors[0],/catalogue/);
});
