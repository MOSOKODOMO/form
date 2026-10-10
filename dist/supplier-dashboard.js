import {$,authorize,rpc,money,label,date,stats,empty,table,message,setVisible,run} from './workspace-client.js';
async function load() {
  if(!await authorize('supplier')) return;
  const data=await rpc('fi_supplier_dashboard');
  $('#supplier-pending').hidden=data.approved;
  $('#supplier-approved').hidden=!data.approved;
  const unlinked=data.shop_products.filter(p=>!p.catalogue_item_id);
  stats([['Products posted',data.products.length+unlinked.length],['Published products',data.shop_products.filter(p=>p.status==='published').length],['Pending warehouse delivery',data.purchases.filter(p=>['pending_purchase','ordered','exception'].includes(p.status)).length],['Return / refund cases',data.returns.length]]);
  table('#supplier-products',['Product','Review status','Website status'],[
    ...data.products.map(p=>[p.title,label(p.status),label(data.shop_products.find(s=>s.catalogue_item_id===p.id)?.status || 'Not published')]),
    ...unlinked.map(p=>[p.title,'Managed by FI',label(p.status)]),
  ]);
  table('#supplier-deliveries',['Product / reference','Quantity','Fulfilment','Inspection','Warehouse'],data.purchases.map(p=>[`${p.title} · ${p.reference}`,p.quantity,label(p.status),p.inspection ? `${label(p.inspection.result)} · ${p.inspection.quantity_passed}/${p.inspection.quantity_checked} passed` : 'Awaiting inspection',p.warehouse?.name || 'FI receiving warehouse']));
  table('#supplier-returns',['Product / reference','Status','Recorded refund (AUD)','Opened'],data.returns.map(r=>[`${r.title} · ${r.reference}`,label(r.status),r.refund_minor==null ? 'Not recorded' : money(r.refund_minor),date(r.created_at)]));
  if(!data.approved) {empty('#supplier-products','Your supplier workspace will open after FI connects your approved company.');}
  setVisible(true); message(data.approved ? 'Your supplier records are up to date.' : 'Your supplier account is awaiting company connection.');
}
$('#workspace-refresh').onclick=()=>run(load);
await run(load);
