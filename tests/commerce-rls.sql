-- Hosted database integration checks. Synthetic fixtures, no provider requests.
-- Every fixture and simulated payment is rolled back at the end.
begin;
select set_config('fi_qa.owner',gen_random_uuid()::text,true);
select set_config('fi_qa.other',gen_random_uuid()::text,true);
select set_config('fi_qa.product',gen_random_uuid()::text,true);
select set_config('fi_qa.warehouse',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values
 (current_setting('fi_qa.owner')::uuid,'commerce-qa-owner@example.invalid','{"role":"client"}'),
 (current_setting('fi_qa.other')::uuid,'commerce-qa-other@example.invalid','{"role":"client"}');
insert into public.fi_shop_products(id,category_slug,title,status) values(current_setting('fi_qa.product')::uuid,'door-hardware','QA fixture','published');
insert into public.fi_product_sources(product_id,original_url,canonical_url,source_currency,source_unit_minor,fx_to_aud,checked_at,valid_until,verification_status)
 values(current_setting('fi_qa.product')::uuid,'https://www.alibaba.com/product-detail/QA_123.html','https://www.alibaba.com/product-detail/QA_123.html','AUD',1000,1,now(),now()+interval '1 day','fi_reviewed');
insert into public.fi_warehouses(id,name,contact_name,phone,address,active) values(current_setting('fi_qa.warehouse')::uuid,'QA warehouse','QA','0000000000','{"name":"QA","line1":"1 Test St","city":"Sydney","state":"NSW","postal_code":"2000","country":"AU"}',true);
do $$ declare oid uuid; repeated uuid; key uuid := gen_random_uuid(); payload jsonb; total bigint; blocked boolean:=false; begin
  payload:=jsonb_build_array(jsonb_build_object('product_id',current_setting('fi_qa.product'),'quantity',1));
  oid:=public.fi_commerce_create_order(current_setting('fi_qa.owner')::uuid,key,'commerce-qa-owner@example.invalid','0000000000','{"name":"QA","line1":"2 Test St","city":"Sydney","state":"NSW","postal_code":"2000","country":"AU"}','{}','',payload);
  repeated:=public.fi_commerce_create_order(current_setting('fi_qa.owner')::uuid,key,'commerce-qa-owner@example.invalid','0000000000','{}','{}','',payload);
  if oid<>repeated then raise exception 'Duplicate order request created a second order'; end if;
  perform set_config('fi_qa.order',oid::text,true);
  total:=public.fi_commerce_approve_quote(oid,current_setting('fi_qa.owner')::uuid,'{"inbound_shipping_minor":100,"inspection_minor":100,"outbound_shipping_minor":200,"duties_minor":0,"tax_minor":0,"payment_cost_minor":0}','costs_included','Synthetic tax fixture only','QA delivery');
  if total<>1500 then raise exception 'Inclusive quote should be 1500 cents, got %',total; end if;
  begin perform public.fi_commerce_approve_quote(oid,current_setting('fi_qa.owner')::uuid,'{}','costs_included','QA','QA'); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Approved quote was mutable'; end if;
  blocked:=false;
  begin perform public.fi_commerce_prepare_purchase(oid,current_setting('fi_qa.warehouse')::uuid,current_setting('fi_qa.owner')::uuid); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Unpaid order released to purchasing'; end if;
end $$;

-- Customer isolation is enforced by database permissions, not just the UI.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fi_qa.owner'),'role','authenticated','email','commerce-qa-owner@example.invalid')::text,true);
do $$ begin
  if (select count(*) from public.fi_shop_orders where id=current_setting('fi_qa.order')::uuid)<>1 then raise exception 'Owner cannot read order'; end if;
  if exists(select 1 from public.fi_product_sources) then raise exception 'Customer can read private sources'; end if;
  if exists(select 1 from public.fi_order_costs) then raise exception 'Customer can read internal costs'; end if;
  if exists(select 1 from public.fi_warehouses) then raise exception 'Customer can read warehouse contacts'; end if;
  begin update public.fi_shop_orders set total_minor=1 where id=current_setting('fi_qa.order')::uuid; raise exception 'Customer changed price'; exception when insufficient_privilege then null; end;
  begin perform public.fi_commerce_dispatch(current_setting('fi_qa.order')::uuid,current_setting('fi_qa.owner')::uuid,'QA','QA',null); raise exception 'Customer called internal RPC'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fi_qa.other'),'role','authenticated','email','commerce-qa-other@example.invalid')::text,true);
do $$ begin
  if exists(select 1 from public.fi_shop_orders where id=current_setting('fi_qa.order')::uuid) then raise exception 'Cross-account order leak'; end if;
  if exists(select 1 from public.fi_shop_order_items where order_id=current_setting('fi_qa.order')::uuid) then raise exception 'Cross-account items leak'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  if exists(select 1 from public.fi_shop_products where status <> 'published') then raise exception 'Draft product is public'; end if;
  begin perform 1 from public.fi_shop_orders; raise exception 'Anonymous orders readable'; exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ declare oid uuid:=current_setting('fi_qa.order')::uuid; actor uuid:=current_setting('fi_qa.owner')::uuid;
  a public.fi_checkout_attempts; e jsonb; s jsonb; blocked boolean:=false; po uuid; sid uuid;
begin
  a:=public.fi_commerce_reserve_checkout(oid,actor,false,'{}');
  e:=jsonb_build_object('id','evt_fi_qa_unpaid','type','checkout.session.completed','created',extract(epoch from now())::bigint,'livemode',false);
  s:=jsonb_build_object('id','cs_fi_qa','metadata',jsonb_build_object('fi_order_id',oid,'fi_attempt_key',a.idempotency_key),
    'client_reference_id',oid,'amount_total',1500,'currency','aud','livemode',false,'payment_status','unpaid','payment_intent','pi_fi_qa');
  perform public.fi_commerce_record_payment(e,s);
  if exists(select 1 from public.fi_shop_payments where order_id=oid) then raise exception 'Unpaid checkout counted as paid'; end if;
  begin perform public.fi_commerce_record_payment(e||'{"id":"evt_fi_qa_tamper"}',s||'{"amount_total":100,"payment_status":"paid"}'); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Wrong payment amount accepted'; end if;
  e:=e||'{"id":"evt_fi_qa_paid","type":"checkout.session.async_payment_succeeded"}'; s:=s||'{"payment_status":"paid"}';
  perform public.fi_commerce_record_payment(e,s); perform public.fi_commerce_record_payment(e,s);
  if (select count(*) from public.fi_shop_payments where order_id=oid)<>1 then raise exception 'Payment replay duplicated ledger'; end if;
  perform public.fi_commerce_record_payment(e||'{"id":"evt_fi_qa_late","type":"checkout.session.async_payment_failed"}',s||'{"payment_status":"unpaid"}');
  if (select status from public.fi_checkout_attempts where order_id=oid)<>'paid' then raise exception 'Late failure undid success'; end if;
  blocked:=false;
  begin perform public.fi_commerce_prepare_purchase(oid,current_setting('fi_qa.warehouse')::uuid,actor); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Test payment released physical procurement'; end if;
  -- Simulated live ledger within this rollback-only test, no money movement.
  update public.fi_shop_payments set livemode=true where order_id=oid;
  perform public.fi_commerce_prepare_purchase(oid,current_setting('fi_qa.warehouse')::uuid,actor);
  perform public.fi_commerce_prepare_purchase(oid,current_setting('fi_qa.warehouse')::uuid,actor);
  if (select count(*) from public.fi_purchase_orders where order_id=oid)<>1 then raise exception 'Duplicate procurement'; end if;
  select id into po from public.fi_purchase_orders where order_id=oid;
  perform public.fi_commerce_update_purchase(po,actor,'ordered','{"external_order_id":"QA-NO-REAL-PURCHASE"}');
  perform public.fi_commerce_update_purchase(po,actor,'received','{}');
  blocked:=false;
  begin perform public.fi_commerce_dispatch(oid,actor,'QA','QA',null); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Dispatch without inspection'; end if;
  perform public.fi_commerce_inspect(po,actor,1,0,'{}','QA defect','[]');
  blocked:=false;
  begin perform public.fi_commerce_dispatch(oid,actor,'QA','QA',null); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Failed inspection released shipment'; end if;
  perform public.fi_commerce_inspect(po,actor,1,1,'{"correct_variant":true,"dimensions":true,"finish":true,"function":true,"packaging":true}','Replacement inspected','[]');
  -- Give later inspection a later timestamp even though now() is transaction-stable.
  update public.fi_inspections set created_at=now()-interval '1 second' where purchase_order_id=po and result='fail';
  perform public.fi_commerce_payment_adjustment(jsonb_build_object('id','evt_fi_qa_refund','type','charge.refunded','livemode',true,'created',extract(epoch from now())::bigint),'pi_fi_qa',100,false);
  blocked:=false;
  begin perform public.fi_commerce_dispatch(oid,actor,'QA','QA',null); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Refunded order shipped'; end if;
  update public.fi_shop_orders set fulfillment_hold=false where id=oid;
  update public.fi_shop_payments set refunded_minor=0,status='paid' where order_id=oid;
  sid:=public.fi_commerce_dispatch(oid,actor,'QA carrier','QA-NO-REAL-SHIPMENT',null);
  if sid is null or (select status from public.fi_shop_orders where id=oid)<>'shipped' then raise exception 'Inspected order failed to dispatch'; end if;
  if (select destination_snapshot->>'line1' from public.fi_order_shipments where id=sid)<>'2 Test St' then raise exception 'Outbound address is incorrect'; end if;
  perform public.fi_commerce_deliver(oid,actor);
end $$;
rollback;
select 'PASS: inclusive pricing, idempotency, quote lock, owner isolation, private suppliers, unpaid/test payment gates, webhook replay, stale-event handling, warehouse receipt, inspection gate, refund hold, shipment destination and delivery; all fixtures rolled back' as result;
