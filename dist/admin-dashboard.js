import {$,supabase,authorize,rpc,node,money,label,date,stats,table,empty,link,message,setVisible,run} from './workspace-client.js';
let data,website=[];
async function load() {
  if(!await authorize('admin')) return;
  const [records,response]=await Promise.all([rpc('fi_admin_dashboard'),fetch('data/products.json')]);
  if(!response.ok) throw new Error('The website catalogue could not be loaded. Please try again.');
  data=records; website=(await response.json()).filter(p=>!p.sample);
  stats([['Live paid orders',data.sales.paid_orders],['Gross sales (AUD)',money(data.sales.gross_minor)],['Recorded refunds (AUD)',money(data.sales.refund_minor)],['Net sales (AUD)',money(data.sales.net_minor)],['Service fees before refunds',money(data.sales.service_fee_minor)],['Open orders',data.orders.filter(o=>!['delivered','cancelled'].includes(o.status)).length],['Website products',website.length],['New enquiries',data.enquiries.filter(e=>e.status==='new').length+data.earlier_enquiries.filter(e=>e.status==='new').length]]);
  table('#admin-monthly',['Month of payment','Paid orders','Gross sales','Refunds against those orders'],data.monthly_sales.map(m=>[m.month_key,m.orders,money(m.gross_minor),money(m.refund_minor)]));
  table('#admin-categories',['Category','Units purchased'],data.categories.map(c=>[label(c.category_slug),c.units]));
  renderProducts(); renderEnquiries();
  table('#admin-orders',['Order','Status','Inclusive AUD total','Requested','Action'],data.orders.map(o=>[o.reference,label(o.status),o.total_minor==null?'Awaiting quote':money(o.total_minor),date(o.created_at),link(`commerce-admin.html#${o.id}`,'Manage order ↗')]));
  table('#admin-returns',['Case','Status','Recorded refund (AUD)','Action'],data.returns.map(r=>[r.id.slice(0,8),label(r.status),r.refund_minor==null?'Not recorded':money(r.refund_minor),link(`commerce-admin.html#${r.order_id}`,'Open order ↗')]));
  setVisible(true); message('Admin records are up to date. Test payments are excluded from sales totals.');
}
function renderProducts() {
  const filter=$('#admin-product-status').value;
  const matches=status=>filter==='all'||status===filter;
  table('#admin-products',['Product','Status','Source unit price','Action'],data.products.filter(p=>matches(p.status)).map(p=>[p.title,label(p.status),p.source_unit_minor==null ? 'Needs confirmation' : `${p.source_currency || ''} ${(p.source_unit_minor/100).toFixed(2)}`,link(`commerce-admin.html?product=${encodeURIComponent(p.id)}#catalogue`,'Edit product / pricing ↗')]));
  table('#admin-supplier-products',['Supplier product','Supplier','Review status','Action'],data.supplier_products.map(p=>[p.title,p.supplier,label(p.status),link('supplier-portal.html','Review supplier submission ↗')]));
  table('#admin-website-products',['Website product','Status','Displayed AUD price','Action'],website.map(p=>[p.product,label(p.status),p.price_aud==null?'Quote required':money(Math.round(p.price_aud*100)),link(`commerce-admin.html?import_handle=${encodeURIComponent(p.handle)}#catalogue`,'Open in product editor ↗')]));
}
function renderEnquiries() {
  const list=$('#admin-enquiries'); list.replaceChildren();
  const filter=$('#admin-enquiry-type').value;
  for(const enquiry of data.enquiries.filter(e=>filter==='all'||e.relationship===filter)) {
    const card=node('article',null,'workspace-card');
    card.append(node('span',`${label(enquiry.relationship)} · ${date(enquiry.created_at)}`,'workspace-meta'),node('h3',enquiry.name),node('p',enquiry.email));
    if(enquiry.position) card.append(node('p',`Application: ${label(enquiry.position)}`));
    if(enquiry.product) card.append(node('p',`Product / company: ${enquiry.product}`));
    card.append(node('p',enquiry.message,'enquiry-message'));
    if(enquiry.portfolio) {try {const u=new URL(enquiry.portfolio); if(['https:','http:'].includes(u.protocol)) {const a=link(u.href,'Open CV / portfolio ↗');a.target='_blank';a.rel='noopener noreferrer';card.append(a);}} catch{}}
    const field=node('label','Enquiry status'),select=node('select');
    ['new','in_progress','replied','closed'].forEach(status=>{const option=node('option',label(status));option.value=status;option.selected=status===enquiry.status;select.append(option);});field.append(select);
    const save=node('button','Save status','button account-secondary'),result=node('p',null,'account-status');save.type='button';
    save.onclick=async()=>{save.disabled=true;try{if(!await authorize('admin'))return;const {error}=await supabase.from('fi_enquiries').update({status:select.value,updated_at:new Date().toISOString()}).eq('id',enquiry.id).select('id').single();if(error)throw error;result.textContent='Status saved.';}catch(error){result.textContent=error.message || 'Status could not be saved.';}finally{save.disabled=false;}};
    card.append(field,save,result);list.append(card);
  }
  if(!list.children.length) empty('#admin-enquiries','No new form enquiries in this category yet.');
  table('#admin-earlier-enquiries',['Reference','Name','Email','Enquiry','Status'],data.earlier_enquiries.map(e=>[e.reference,e.name,e.email,e.message,label(e.status)]));
}
$('#workspace-refresh').onclick=()=>run(load);
$('#admin-product-status').onchange=renderProducts;
$('#admin-enquiry-type').onchange=renderEnquiries;
await run(load);
