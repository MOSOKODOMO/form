-- Synthetic records only. All inserts and simulated payments are rolled back.
begin;
select set_config('workspace_qa.customer',gen_random_uuid()::text,true),set_config('workspace_qa.other',gen_random_uuid()::text,true),set_config('workspace_qa.supplier',gen_random_uuid()::text,true),set_config('workspace_qa.other_supplier',gen_random_uuid()::text,true),set_config('workspace_qa.admin',gen_random_uuid()::text,true),set_config('workspace_qa.company',gen_random_uuid()::text,true),set_config('workspace_qa.other_company',gen_random_uuid()::text,true),set_config('workspace_qa.product',gen_random_uuid()::text,true),set_config('workspace_qa.other_product',gen_random_uuid()::text,true),set_config('workspace_qa.order',gen_random_uuid()::text,true),set_config('workspace_qa.other_order',gen_random_uuid()::text,true),set_config('workspace_qa.item',gen_random_uuid()::text,true),set_config('workspace_qa.other_item',gen_random_uuid()::text,true),set_config('workspace_qa.warehouse',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 (current_setting('workspace_qa.customer')::uuid,'workspace-qa-customer@example.invalid',now(),'{"role":"client","full_name":"QA Customer"}'),
 (current_setting('workspace_qa.other')::uuid,'workspace-qa-other@example.invalid',now(),'{"role":"admin","full_name":"QA Other"}'),
 (current_setting('workspace_qa.supplier')::uuid,'workspace-qa-supplier@example.invalid',now(),'{"role":"manufacturer","full_name":"QA Supplier","company_name":"QA Company"}'),
 (current_setting('workspace_qa.other_supplier')::uuid,'workspace-qa-other-supplier@example.invalid',now(),'{"role":"manufacturer","full_name":"QA Other Supplier","company_name":"QA Other Company"}'),
 (current_setting('workspace_qa.admin')::uuid,'workspace-qa-admin@example.invalid',now(),'{"role":"client","full_name":"QA Admin"}');
insert into public.fi_team_members(email,role) values('workspace-qa-admin@example.invalid','admin');
insert into public.fi_supplier_profiles(id,legal_name,country) values(current_setting('workspace_qa.company')::uuid,'QA Company','Australia'),(current_setting('workspace_qa.other_company')::uuid,'QA Other Company','Australia');
insert into public.fi_supplier_memberships(supplier_id,email) values(current_setting('workspace_qa.company')::uuid,'workspace-qa-supplier@example.invalid'),(current_setting('workspace_qa.other_company')::uuid,'workspace-qa-other-supplier@example.invalid');
insert into public.fi_shop_products(id,category_slug,title,supplier_id) values(current_setting('workspace_qa.product')::uuid,'door-hardware','QA Handle',current_setting('workspace_qa.company')::uuid),(current_setting('workspace_qa.other_product')::uuid,'door-hardware','QA Other Handle',current_setting('workspace_qa.other_company')::uuid);
insert into public.fi_warehouses(id,name,contact_name,phone,address) values(current_setting('workspace_qa.warehouse')::uuid,'QA Warehouse','QA Receiver','0000000000','{"city":"TEST"}');
insert into public.fi_shop_orders(id,user_id,request_key,customer_email,customer_phone,shipping_address,billing_address,terms_version,status,total_minor) values
 (current_setting('workspace_qa.order')::uuid,current_setting('workspace_qa.customer')::uuid,gen_random_uuid(),'workspace-qa-customer@example.invalid','0000000000','{"line1":"PRIVATE CUSTOMER ADDRESS"}','{}','QA','delivered',1000),
 (current_setting('workspace_qa.other_order')::uuid,current_setting('workspace_qa.other')::uuid,gen_random_uuid(),'workspace-qa-other@example.invalid','0000000000','{"line1":"OTHER PRIVATE ADDRESS"}','{}','QA','paid',5000);
insert into public.fi_shop_order_items(id,order_id,product_id,product_updated_at,title,variant_options,specifications,quantity) values
 (current_setting('workspace_qa.item')::uuid,current_setting('workspace_qa.order')::uuid,current_setting('workspace_qa.product')::uuid,now(),'QA Handle','{}','{}',2),
 (current_setting('workspace_qa.other_item')::uuid,current_setting('workspace_qa.other_order')::uuid,current_setting('workspace_qa.other_product')::uuid,now(),'QA Other Handle','{}','{}',1);
insert into public.fi_shop_payments(order_id,stripe_payment_intent_id,stripe_session_id,amount_received_minor,refunded_minor,currency,livemode) values
 (current_setting('workspace_qa.order')::uuid,'QA-PI-LIVE-'||gen_random_uuid(),'QA-CS-LIVE-'||gen_random_uuid(),1000,100,'AUD',true),
 (current_setting('workspace_qa.other_order')::uuid,'QA-PI-TEST-'||gen_random_uuid(),'QA-CS-TEST-'||gen_random_uuid(),5000,0,'AUD',false);
insert into public.fi_purchase_orders(order_id,order_item_id,warehouse_id,warehouse_snapshot,source_snapshot,quantity,status) values
 (current_setting('workspace_qa.order')::uuid,current_setting('workspace_qa.item')::uuid,current_setting('workspace_qa.warehouse')::uuid,'{"name":"QA Warehouse"}','{"private":"DO NOT EXPOSE"}',2,'ordered'),
 (current_setting('workspace_qa.other_order')::uuid,current_setting('workspace_qa.other_item')::uuid,current_setting('workspace_qa.warehouse')::uuid,'{"name":"QA Warehouse"}','{}',1,'pending_purchase');
insert into public.fi_order_returns(order_id,order_item_id,reason,notes,refund_minor) values(current_setting('workspace_qa.order')::uuid,current_setting('workspace_qa.item')::uuid,'QA issue','INTERNAL RETURN NOTES',100);
select set_config('workspace_qa.base_gross',(select coalesce(sum(amount_received_minor),0)-1000 from public.fi_shop_payments where livemode)::text,true);

-- Customer isolation, even with forged email and role metadata.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('workspace_qa.customer'),'email','workspace-qa-admin@example.invalid','role','authenticated')::text,true);
set local role authenticated;
do $$ declare value jsonb; begin
  value:=public.fi_workspace_context(); if (value->>'admin')::boolean then raise exception 'Forged email escalated admin'; end if;
  value:=public.fi_customer_dashboard();
  if jsonb_array_length(value->'orders')<>1 or value->'orders'->0->>'id'<>current_setting('workspace_qa.order') then raise exception 'Customer order isolation failed'; end if;
  if value::text like '%INTERNAL RETURN NOTES%' or value::text like '%DO NOT EXPOSE%' then raise exception 'Internal details leaked'; end if;
  if (select count(*) from public.fi_purchase_orders)<>0 or (select count(*) from public.fi_order_returns)<>0 then raise exception 'Private raw tables leaked'; end if;
  begin perform public.fi_admin_dashboard();raise exception 'Admin RPC allowed customer';exception when insufficient_privilege then null;end;
  begin update public.fi_team_members set role='admin';raise exception 'Customer could change admin';exception when insufficient_privilege then null;end;
end $$;
reset role;

-- Supplier A sees only its products / shipments / cases, never buyer data or supplier B.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('workspace_qa.supplier'),'email','workspace-qa-supplier@example.invalid','role','authenticated')::text,true);
set local role authenticated;
do $$ declare value jsonb; begin
  value:=public.fi_supplier_dashboard();
  if jsonb_array_length(value->'purchases')<>1 or jsonb_array_length(value->'shop_products')<>1 or jsonb_array_length(value->'returns')<>1 then raise exception 'Supplier assignment isolation failed'; end if;
  if value::text like '%PRIVATE CUSTOMER%' or value::text like '%stripe_%' or value::text like '%DO NOT EXPOSE%' or value::text like '%INTERNAL RETURN NOTES%' or value::text like '%QA Other Handle%' then raise exception 'Supplier received private or other-supplier data'; end if;
  if (select count(*) from public.fi_shop_orders)<>0 then raise exception 'Supplier could read customer order table'; end if;
end $$;
reset role;

-- Admin totals exclude test payments and include recorded live refunds.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('workspace_qa.admin'),'email','workspace-qa-admin@example.invalid','role','authenticated')::text,true);
set local role authenticated;
do $$ declare value jsonb; begin
  value:=public.fi_admin_dashboard();
  if (value->'sales'->>'gross_minor')::bigint<>current_setting('workspace_qa.base_gross')::bigint+1000 then raise exception 'Test payment included in sales'; end if;
  if not (public.fi_workspace_context()->>'admin')::boolean then raise exception 'Approved admin denied'; end if;
end $$;
reset role;

-- Stored enquiries are idempotent, rate limited and inaccessible to public visitors.
select set_config('workspace_qa.enquiry_key',gen_random_uuid()::text,true);
select public.fi_capture_enquiry(current_setting('workspace_qa.enquiry_key')::uuid,'workspace-qa-rate', '{"relationship":"buyer","name":"QA","email":"qa@example.invalid","message":"QA NOTE"}');
select public.fi_capture_enquiry(current_setting('workspace_qa.enquiry_key')::uuid,'workspace-qa-rate', '{"relationship":"buyer","name":"QA","email":"qa@example.invalid","message":"QA NOTE"}');
do $$ begin
  if (select count(*) from public.fi_enquiries where submission_key=current_setting('workspace_qa.enquiry_key')::uuid)<>1 then raise exception 'Enquiry duplicated'; end if;
  if (select attempts from private.fi_enquiry_limits where rate_key='workspace-qa-rate')<>1 then raise exception 'Retry consumed rate limit'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform public.fi_admin_dashboard(); raise exception 'Anonymous admin RPC allowed';exception when insufficient_privilege then null;end;
  begin perform public.fi_customer_dashboard(); raise exception 'Anonymous customer RPC allowed';exception when insufficient_privilege then null;end;
  begin perform public.fi_supplier_dashboard(); raise exception 'Anonymous supplier RPC allowed';exception when insufficient_privilege then null;end;
  begin perform public.fi_capture_enquiry(gen_random_uuid(),'evil','{}'); raise exception 'Public intake SQL allowed';exception when insufficient_privilege then null;end;
  begin perform count(*) from public.fi_enquiries; raise exception 'Public enquiry read allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
