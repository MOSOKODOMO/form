-- Synthetic database fixtures only. No email, checkout or payment-provider calls.
-- All users, simulated payments, deliveries and reviews are rolled back.
begin;
select set_config('review_qa.owner',gen_random_uuid()::text,true);
select set_config('review_qa.other',gen_random_uuid()::text,true);
select set_config('review_qa.product',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values
 (current_setting('review_qa.owner')::uuid,'review-qa-owner@example.invalid','{"role":"client"}'),
 (current_setting('review_qa.other')::uuid,'review-qa-other@example.invalid','{"role":"client"}');
insert into public.fi_shop_products(id,category_slug,title,status,specifications)
 values(current_setting('review_qa.product')::uuid,'door-hardware','Transaction-only review fixture','published','{"catalogue_handle":"review-qa-fixture"}');

do $$ declare oid uuid; iid uuid; n integer; begin
 for n in 1..5 loop
  insert into public.fi_shop_orders(user_id,request_key,status,customer_email,customer_phone,shipping_address,billing_address,terms_version,total_minor)
  values(current_setting('review_qa.owner')::uuid,gen_random_uuid(),'delivered','review-qa-owner@example.invalid','0000000000','{"line1":"Private fixture address"}','{}','QA',1100) returning id into oid;
  insert into public.fi_shop_order_items(order_id,product_id,product_updated_at,title,variant_options,specifications,quantity)
  values(oid,current_setting('review_qa.product')::uuid,now(),'Transaction-only review fixture','{}','{}',1) returning id into iid;
  perform set_config('review_qa.item'||n,iid::text,true);
  if n<>5 then
   insert into public.fi_shop_payments(order_id,stripe_payment_intent_id,stripe_session_id,amount_received_minor,currency,livemode)
   values(oid,'QA-simulated-pi-'||oid,'QA-simulated-cs-'||oid,1100,'AUD',n<>3);
  end if;
  if n<>4 then
   insert into public.fi_order_shipments(order_id,leg,carrier,tracking_number,destination_snapshot,status,delivered_at,created_by)
   values(oid,'warehouse_to_customer','QA fixture','QA fixture','{"line1":"Private fixture address"}','delivered',now(),current_setting('review_qa.owner')::uuid);
  end if;
 end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('review_qa.owner'),'role','authenticated')::text,true);
do $$ declare rid uuid; edited uuid; invalid uuid; n integer; begin
 if (select count(*) from public.fi_reviewable_items())<>2 then raise exception 'Eligibility must exclude test, unpaid and incomplete deliveries'; end if;
 for n in 3..5 loop
  begin
   perform public.fi_submit_product_review(current_setting('review_qa.item'||n)::uuid,'QA buyer',1,'Disappointing','This is a transaction-only negative experience fixture.',true);
   raise exception 'Ineligible order accepted';
  exception when raise_exception then
   if sqlerrm='Ineligible order accepted' then raise; end if;
  end;
 end loop;
 begin
  perform public.fi_submit_product_review(current_setting('review_qa.item1')::uuid,'QA buyer',1,'No consent','This is a transaction-only negative experience fixture.',false);
  raise exception 'Missing publication consent accepted';
 exception when raise_exception then if sqlerrm='Missing publication consent accepted' then raise; end if; end;
 begin
  perform public.fi_submit_product_review(current_setting('review_qa.item1')::uuid,'QA buyer',6,'Bad rating','This is a transaction-only experience fixture.',true);
  raise exception 'Out-of-range rating accepted';
 exception when raise_exception then if sqlerrm='Out-of-range rating accepted' then raise; end if; end;
 rid:=public.fi_submit_product_review(current_setting('review_qa.item1')::uuid,'QA buyer',1,'A negative experience','This is a transaction-only negative experience fixture.',true);
 if not exists(select 1 from public.fi_product_reviews where id=rid and rating=1) then raise exception 'Negative review was not published'; end if;
 edited:=public.fi_submit_product_review(current_setting('review_qa.item1')::uuid,'QA buyer',5,'Updated by the customer','This is a transaction-only updated experience fixture.',true);
 if rid<>edited then raise exception 'Editing created duplicate review'; end if;
 perform set_config('review_qa.review',rid::text,true);
 perform public.fi_submit_product_review(current_setting('review_qa.item2')::uuid,'Second QA name',1,'Another negative experience','This is a second transaction-only negative experience fixture.',true);
 if (select review_count from public.fi_review_summary(current_setting('review_qa.product')::uuid,null,null))<>2 then raise exception 'Review count incorrect'; end if;
 if (select average_rating from public.fi_review_summary(null,'review-qa-fixture',null))<>3.0 then raise exception 'Average rating incorrect'; end if;
 if (select review_count from public.fi_review_summary(null,'review-qa-fixture',1))<>1 then raise exception 'Rating filter incorrect'; end if;
 begin
  insert into public.fi_product_reviews(product_id,product_title,display_name,rating,title,body)
  values(current_setting('review_qa.product')::uuid,'Forged','Fake reviewer',5,'A fabricated review','This review must never be accepted from a direct insert.');
  raise exception 'Direct review insert permitted';
 exception when insufficient_privilege then null; end;
 begin
  update public.fi_product_reviews set rating=5 where id=rid;
  raise exception 'Direct review edit permitted';
 exception when insufficient_privilege then null; end;
 begin
  perform 1 from private.fi_review_purchases;
  raise exception 'Private purchase associations exposed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('review_qa.other'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.fi_reviewable_items()) then raise exception 'Other customer saw review eligibility'; end if;
 begin
  perform public.fi_submit_product_review(current_setting('review_qa.item1')::uuid,'Other buyer',1,'Hijacked review','This is a transaction-only cross-account access fixture.',true);
  raise exception 'Cross-account review accepted';
 exception when raise_exception then if sqlerrm='Cross-account review accepted' then raise; end if; end;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 if (select count(*) from public.fi_product_reviews where product_id=current_setting('review_qa.product')::uuid)<>2 then raise exception 'Anonymous readers cannot see genuine reviews'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='fi_product_reviews' and column_name in ('user_id','order_id','order_item_id','customer_email','shipping_address','payment_id')) then raise exception 'Private identifiers present in public review content'; end if;
 begin
  perform public.fi_reviewable_items(); raise exception 'Anonymous eligibility permitted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.fi_submit_product_review(current_setting('review_qa.item1')::uuid,'Anon',5,'Anon review','This is a transaction-only anonymous fixture.',true);
  raise exception 'Anonymous submission permitted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'Product review eligibility, edits, genuine negative publication and privacy checks passed; all fixtures rolled back.' as result;
