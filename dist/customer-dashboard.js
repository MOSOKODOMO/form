import {$,authorize,rpc,node,money,label,date,stats,empty,link,safeLink,message,setVisible,run} from './workspace-client.js';
async function load() {
  if(!await authorize('customer')) return;
  const {orders}=await rpc('fi_customer_dashboard');
  const paid=orders.filter(order=>order.payment?.livemode);
  stats([['Orders',orders.length],['Items purchased',paid.reduce((n,o)=>n+o.items.reduce((sum,i)=>sum+i.quantity,0),0)],['In progress',orders.filter(o=>!['delivered','cancelled'].includes(o.status)).length],['Net paid (AUD)',money(paid.reduce((n,o)=>n+o.payment.amount_received_minor-o.payment.refunded_minor,0))]]);
  const list=$('#customer-orders'); list.replaceChildren();
  const past=$('#customer-purchases'); past.replaceChildren();
  if(!orders.length) empty('#customer-orders','No orders yet. Your product orders and inspection-to-delivery progress will appear here.');
  let purchases=0;
  for(const order of orders) {
    const card=node('article',null,'workspace-card');
    card.append(node('span',label(order.status),'account-badge'),node('h3',order.reference),node('small',`Requested ${date(order.created_at)}`));
    order.items.forEach(i=>card.append(node('p',`${i.quantity} × ${i.title}`)));
    card.append(node('p',order.total_minor ? `${money(order.total_minor)} inclusive AUD total` : 'Your inclusive quote is awaiting confirmation.'));
    if(order.fulfillment_hold) card.append(node('p','On hold while FI resolves an issue.','workspace-notice'));
    if(order.payment) card.append(node('p',`${order.payment.livemode ? 'Payment' : 'Test payment'}: ${label(order.payment.status)}${order.payment.refunded_minor ? ` · Refunded ${money(order.payment.refunded_minor)}` : ''}`));
    const steps=node('ol',null,'order-progress');
    const stage={awaiting_quote:0,awaiting_payment:1,paid:2,purchasing:2,inbound:2,inspecting:3,ready_to_ship:4,shipped:4,delivered:5}[order.status] ?? -1;
    ['Quote','Payment','To warehouse','Inspection','To you','Delivered'].forEach((text,index)=>{const li=node('li',text,index<stage?'complete':index===stage?'current':''); if(index===stage) li.setAttribute('aria-current','step'); steps.append(li);}); card.append(steps);
    for(const shipment of order.shipments) {
      card.append(node('p',`${shipment.carrier || 'Delivery'} · ${label(shipment.status)}${shipment.tracking_number ? ` · ${shipment.tracking_number}` : ''}`));
      if(shipment.tracking_url) card.append(safeLink(shipment.tracking_url,'Track delivery ↗'));
    }
    for(const item of order.returns) card.append(node('p',`Return: ${label(item.status)}${item.refund_minor!=null ? ` · ${money(item.refund_minor)}` : ''}`));
    card.append(link(`orders.html#${order.id}`,'Open order and payment details ↗')); list.append(card);
    if(order.status==='delivered' && order.payment?.livemode && ['paid','partially_refunded'].includes(order.payment.status) && order.shipments.some(s=>s.status==='delivered' && s.delivered_at)) {
      for(const item of order.items) { const bought=node('article',null,'workspace-card'); bought.append(node('h3',item.title),node('p',`${item.quantity} purchased · ${order.reference}`),link(`reviews.html?item=${encodeURIComponent(item.id)}#write-review`,'Review this purchase ↗')); past.append(bought); purchases++; }
    }
  }
  if(!purchases) empty('#customer-purchases','Your paid, delivered products will appear here, with a link to leave a genuine purchase review.');
  setVisible(true); message('Your order records are up to date.');
}
$('#workspace-refresh').onclick=()=>run(load);
await run(load);
