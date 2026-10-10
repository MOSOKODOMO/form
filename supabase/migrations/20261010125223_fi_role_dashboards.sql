-- Role-specific workspaces. Existing approved admins remain the only staff accounts.
begin;
create schema if not exists private;

-- An approved supplier is connected explicitly to the products FI sells.
alter table public.fi_shop_products add column supplier_id uuid references public.fi_supplier_profiles(id) on delete restrict;
alter table public.fi_shop_products add column supplier_catalogue_item_id uuid references public.fi_supplier_catalogue_items(id) on delete restrict;
create index fi_shop_products_supplier_idx on public.fi_shop_products(supplier_id);
create index fi_shop_products_supplier_item_idx on public.fi_shop_products(supplier_catalogue_item_id);
alter table public.fi_purchase_orders add column supplier_id uuid references public.fi_supplier_profiles(id) on delete restrict;
create index fi_purchase_orders_supplier_idx on public.fi_purchase_orders(supplier_id,created_at desc);
alter table public.fi_order_returns add column order_item_id uuid references public.fi_shop_order_items(id) on delete restrict;
create index fi_order_returns_item_idx on public.fi_order_returns(order_item_id);

create function private.fi_check_product_supplier() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.supplier_catalogue_item_id is not null and not exists(select 1 from public.fi_supplier_catalogue_items i where i.id=new.supplier_catalogue_item_id and i.supplier_id=new.supplier_id) then
    raise exception 'Catalogue item must belong to the selected supplier';
  end if;
  return new;
end $$;
create trigger fi_check_product_supplier before insert or update of supplier_id,supplier_catalogue_item_id on public.fi_shop_products for each row execute function private.fi_check_product_supplier();

create function private.fi_purchase_supplier_snapshot() returns trigger language plpgsql security invoker set search_path='' as $$
declare assigned uuid;
begin
  select p.supplier_id into assigned from public.fi_shop_order_items i join public.fi_shop_products p on p.id=i.product_id where i.id=new.order_item_id and i.order_id=new.order_id;
  if new.supplier_id is not null and new.supplier_id is distinct from assigned then raise exception 'Purchase supplier must match the product'; end if;
  new.supplier_id := assigned;
  return new;
end $$;
create trigger fi_purchase_supplier_snapshot before insert on public.fi_purchase_orders for each row execute function private.fi_purchase_supplier_snapshot();

create function private.fi_valid_user() returns uuid language sql stable security definer set search_path='' as $$
  select u.id from auth.users u where u.id=(select auth.uid()) and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
$$;
create function private.fi_admin_allowed() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users u join public.fi_team_members m on lower(m.email)=lower(u.email) where u.id=(select auth.uid()) and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and m.role='admin')
$$;
create function private.fi_supplier_ids() returns setof uuid language sql stable security definer set search_path='' as $$
  select m.supplier_id from public.fi_supplier_memberships m join auth.users u on lower(m.email)=lower(u.email) where u.id=(select auth.uid()) and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
$$;

create function private.fi_workspace_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare who uuid := private.fi_valid_user(); result jsonb;
begin
  if who is null then raise exception 'A verified account is required' using errcode='42501'; end if;
  select jsonb_build_object('admin',private.fi_admin_allowed(),'supplier',exists(select 1 from private.fi_supplier_ids()),'supplier_requested',coalesce(p.role='manufacturer',false),'name',p.full_name) into result from public.fi_user_profiles p where p.user_id=who;
  return coalesce(result,jsonb_build_object('admin',private.fi_admin_allowed(),'supplier',exists(select 1 from private.fi_supplier_ids()),'supplier_requested',false,'name',null));
end $$;
create function public.fi_workspace_context() returns jsonb language sql security invoker set search_path='' as $$ select private.fi_workspace_context() $$;

create function private.fi_customer_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare who uuid := private.fi_valid_user(); result jsonb;
begin
  if who is null then raise exception 'A verified account is required' using errcode='42501'; end if;
  select jsonb_build_object('orders',coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'reference',o.reference,'status',o.status,'created_at',o.created_at,'total_minor',o.total_minor,'fulfillment_hold',o.fulfillment_hold,
    'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'title',i.title,'quantity',i.quantity)),'[]') from public.fi_shop_order_items i where i.order_id=o.id),
    'payment',(select jsonb_build_object('status',p.status,'livemode',p.livemode,'amount_received_minor',p.amount_received_minor,'refunded_minor',p.refunded_minor) from public.fi_shop_payments p where p.order_id=o.id),
    'shipments',(select coalesce(jsonb_agg(jsonb_build_object('status',s.status,'carrier',s.carrier,'tracking_number',s.tracking_number,'tracking_url',s.tracking_url,'delivered_at',s.delivered_at)),'[]') from public.fi_order_shipments s where s.order_id=o.id and s.leg='warehouse_to_customer'),
    'returns',(select coalesce(jsonb_agg(jsonb_build_object('status',r.status,'reason',r.reason,'refund_minor',r.refund_minor,'created_at',r.created_at)),'[]') from public.fi_order_returns r where r.order_id=o.id)
  ) order by o.created_at desc),'[]')) into result from public.fi_shop_orders o where o.user_id=who;
  return result;
end $$;
create function public.fi_customer_dashboard() returns jsonb language sql security invoker set search_path='' as $$ select private.fi_customer_dashboard() $$;

create function private.fi_supplier_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare who uuid := private.fi_valid_user(); ids uuid[]; result jsonb;
begin
  if who is null then raise exception 'A verified account is required' using errcode='42501'; end if;
  select coalesce(array_agg(id),'{}') into ids from private.fi_supplier_ids() id;
  if cardinality(ids)=0 then return jsonb_build_object('approved',false,'products','[]'::jsonb,'shop_products','[]'::jsonb,'purchases','[]'::jsonb,'returns','[]'::jsonb); end if;
  select jsonb_build_object('approved',true,
    'products',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'title',i.product_name,'status',coalesce(r.status,i.supplier_submission_state),'submission_state',i.supplier_submission_state,'created_at',i.created_at,'review_note',r.review_note) order by i.created_at desc),'[]') from public.fi_supplier_catalogue_items i left join public.fi_supplier_catalogue_reviews r on r.catalogue_item_id=i.id where i.supplier_id=any(ids)),
    'shop_products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'status',p.status,'catalogue_item_id',p.supplier_catalogue_item_id)),'[]') from public.fi_shop_products p where p.supplier_id=any(ids)),
    'purchases',(select coalesce(jsonb_agg(jsonb_build_object('id',po.id,'reference',o.reference,'title',i.title,'quantity',po.quantity,'status',po.status,'created_at',po.created_at,'purchased_at',po.purchased_at,'received_at',po.received_at,'warehouse',po.warehouse_snapshot,'inspection',(select jsonb_build_object('result',q.result,'quantity_checked',q.quantity_checked,'quantity_passed',q.quantity_passed) from public.fi_inspections q where q.purchase_order_id=po.id order by q.created_at desc limit 1)) order by po.created_at desc),'[]') from public.fi_purchase_orders po join public.fi_shop_order_items i on i.id=po.order_item_id join public.fi_shop_orders o on o.id=po.order_id where po.supplier_id=any(ids)),
    'returns',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'reference',o.reference,'title',i.title,'status',r.status,'refund_minor',r.refund_minor,'created_at',r.created_at)),'[]') from public.fi_order_returns r join public.fi_purchase_orders po on po.order_id=r.order_id and po.order_item_id=r.order_item_id join public.fi_shop_order_items i on i.id=po.order_item_id join public.fi_shop_orders o on o.id=r.order_id where po.supplier_id=any(ids))
  ) into result;
  return result;
end $$;
create function public.fi_supplier_dashboard() returns jsonb language sql security invoker set search_path='' as $$ select private.fi_supplier_dashboard() $$;

create table public.fi_enquiries (
  id uuid primary key default gen_random_uuid(), submission_key uuid not null unique,
  relationship text not null check(relationship in ('buyer','supplier','applicant')),
  name text not null check(length(trim(name)) between 1 and 120),
  email text not null check(length(email) between 3 and 200 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  product text not null default '' check(length(product)<=200),
  message text not null check(length(trim(message)) between 1 and 4000),
  position text check(position in ('warehouse-inspector','marketing-content','supplier-sourcing','customer-support')),
  portfolio text check(portfolio is null or (length(portfolio)<=500 and portfolio ~ '^https?://')),
  status text not null default 'new' check(status in ('new','in_progress','replied','closed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((relationship='applicant' and position is not null) or (relationship<>'applicant' and position is null and portfolio is null))
);
create index fi_enquiries_queue_idx on public.fi_enquiries(status,created_at desc);
alter table public.fi_enquiries enable row level security;
revoke all on public.fi_enquiries from public,anon,authenticated;
grant select on public.fi_enquiries to authenticated;
grant update(status,updated_at) on public.fi_enquiries to authenticated;
grant all on public.fi_enquiries to service_role;
create policy "Approved admins read enquiries" on public.fi_enquiries for select to authenticated using((select private.fi_admin_allowed()));
create policy "Approved admins update enquiry status" on public.fi_enquiries for update to authenticated using((select private.fi_admin_allowed())) with check((select private.fi_admin_allowed()));
create table private.fi_enquiry_limits (rate_key text primary key,attempts integer not null,expires_at timestamptz not null);
create index fi_enquiry_limits_expiry_idx on private.fi_enquiry_limits(expires_at);
alter table private.fi_enquiry_limits enable row level security;
revoke all on private.fi_enquiry_limits from public,anon,authenticated;
grant all on private.fi_enquiry_limits to service_role;

create function public.fi_capture_enquiry(p_key uuid,p_rate_key text,p_data jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare saved uuid; allowed text;
begin
  select id into saved from public.fi_enquiries where submission_key=p_key;
  if saved is not null then return saved; end if;
  delete from private.fi_enquiry_limits where expires_at<now();
  insert into private.fi_enquiry_limits(rate_key,attempts,expires_at) values(p_rate_key,1,now()+interval '25 hours')
    on conflict(rate_key) do update set attempts=private.fi_enquiry_limits.attempts+1 where private.fi_enquiry_limits.attempts<10 returning rate_key into allowed;
  if allowed is null then raise exception 'Too many enquiries. Please try again later or email FI.' using errcode='P0001'; end if;
  insert into public.fi_enquiries(submission_key,relationship,name,email,product,message,position,portfolio)
    values(p_key,p_data->>'relationship',p_data->>'name',p_data->>'email',coalesce(p_data->>'product',''),p_data->>'message',p_data->>'position',p_data->>'portfolio')
    on conflict(submission_key) do nothing returning id into saved;
  if saved is null then select id into saved from public.fi_enquiries where submission_key=p_key; end if;
  return saved;
end $$;
revoke all on function public.fi_capture_enquiry(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.fi_capture_enquiry(uuid,text,jsonb) to service_role;

create function private.fi_admin_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.fi_admin_allowed() then raise exception 'Admin access required' using errcode='42501'; end if;
  select jsonb_build_object(
    'sales',jsonb_build_object('paid_orders',(select count(*) from public.fi_shop_payments where livemode),'gross_minor',(select coalesce(sum(amount_received_minor),0) from public.fi_shop_payments where livemode),'refund_minor',(select coalesce(sum(refunded_minor),0) from public.fi_shop_payments where livemode),'net_minor',(select coalesce(sum(amount_received_minor-refunded_minor),0) from public.fi_shop_payments where livemode),'service_fee_minor',(select coalesce(sum(c.markup_minor),0) from public.fi_order_costs c join public.fi_shop_payments p on p.order_id=c.order_id where p.livemode)),
    'monthly_sales',(select coalesce(jsonb_agg(to_jsonb(m) order by m.month_key),'[]') from (select to_char(paid_at at time zone 'Australia/Sydney','YYYY-MM') as month_key,count(*) as orders,sum(amount_received_minor) gross_minor,sum(refunded_minor) refund_minor from public.fi_shop_payments where livemode and paid_at>=date_trunc('month',now())-interval '11 months' group by 1) m),
    'categories',(select coalesce(jsonb_agg(to_jsonb(c) order by c.units desc),'[]') from (select pr.category_slug,sum(i.quantity) units from public.fi_shop_order_items i join public.fi_shop_products pr on pr.id=i.product_id join public.fi_shop_payments p on p.order_id=i.order_id where p.livemode group by pr.category_slug) c),
    'products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'status',p.status,'category',p.category_slug,'supplier_id',p.supplier_id,'source_currency',s.source_currency,'source_unit_minor',s.source_unit_minor,'fx_to_aud',s.fx_to_aud) order by p.created_at desc),'[]') from public.fi_shop_products p left join public.fi_product_sources s on s.product_id=p.id),
    'supplier_products',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'title',i.product_name,'supplier',s.legal_name,'status',coalesce(r.status,i.supplier_submission_state)) order by i.created_at desc),'[]') from public.fi_supplier_catalogue_items i join public.fi_supplier_profiles s on s.id=i.supplier_id left join public.fi_supplier_catalogue_reviews r on r.catalogue_item_id=i.id),
    'suppliers',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.legal_name)),'[]') from public.fi_supplier_profiles s),
    'orders',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'reference',o.reference,'status',o.status,'created_at',o.created_at,'total_minor',o.total_minor,'fulfillment_hold',o.fulfillment_hold) order by o.created_at desc),'[]') from public.fi_shop_orders o),
    'enquiries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]') from public.fi_enquiries e),
    'earlier_enquiries',(select coalesce(jsonb_agg(jsonb_build_object('reference',q.reference,'name',q.requester_name,'email',q.requester_email,'message',q.project_name,'status',q.status,'created_at',q.created_at) order by q.created_at desc),'[]') from public.fi_quote_requests q),
    'returns',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'order_id',r.order_id,'status',r.status,'refund_minor',r.refund_minor,'created_at',r.created_at)),'[]') from public.fi_order_returns r)
  ) into result;
  return result;
end $$;
create function public.fi_admin_dashboard() returns jsonb language sql security invoker set search_path='' as $$ select private.fi_admin_dashboard() $$;

-- Every cross-scope reader authenticates in its private implementation; no caller-supplied user ID.
do $$ declare fn text; begin
  foreach fn in array array['fi_valid_user','fi_admin_allowed','fi_supplier_ids','fi_workspace_context','fi_customer_dashboard','fi_supplier_dashboard','fi_admin_dashboard'] loop
    execute format('revoke all on function private.%I() from public,anon,authenticated',fn);
    execute format('grant execute on function private.%I() to authenticated',fn);
  end loop;
  foreach fn in array array['fi_workspace_context','fi_customer_dashboard','fi_supplier_dashboard','fi_admin_dashboard'] loop
    execute format('revoke all on function public.%I() from public,anon,authenticated',fn);
    execute format('grant execute on function public.%I() to authenticated',fn);
  end loop;
end $$;
grant usage on schema private to authenticated,service_role;
revoke all on function private.fi_check_product_supplier(),private.fi_purchase_supplier_snapshot() from public,anon,authenticated;
alter policy "FI team members can read their own membership" on public.fi_team_members using((select private.fi_admin_allowed()) and lower(email)=lower((select auth.jwt())->>'email'));

-- Customer and supplier return summaries use filtered RPCs. Internal notes remain admin-only.

create function public.fi_commerce_record_item_return(p_order uuid,p_actor uuid,p_item uuid,p_reason text) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.fi_shop_order_items where id=p_item and order_id=p_order;
  if not found then raise exception 'Return item does not belong to the order'; end if;
  perform 1 from public.fi_shop_orders where id=p_order for update;
  insert into public.fi_order_returns(order_id,order_item_id,reason,created_by) values(p_order,p_item,p_reason,p_actor);
  update public.fi_shop_orders set fulfillment_hold=true,updated_at=now() where id=p_order;
  insert into public.fi_commerce_audit(actor_user_id,action,entity_id) values(p_actor,'return_requested',p_order);
end $$;
revoke all on function public.fi_commerce_record_item_return(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fi_commerce_record_item_return(uuid,uuid,uuid,text) to service_role;
create or replace function public.fi_commerce_save_product(p_product jsonb,p_source jsonb,p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare p public.fi_shop_products; s public.fi_product_sources;
begin
  p := jsonb_populate_record(null::public.fi_shop_products,p_product);
  s := jsonb_populate_record(null::public.fi_product_sources,p_source);
  insert into public.fi_shop_products(id,category_slug,title,description,description_zh,sku,variant_options,specifications,image_url,image_permission_confirmed,status,created_by,supplier_id,supplier_catalogue_item_id)
    values(p.id,p.category_slug,p.title,p.description,p.description_zh,p.sku,p.variant_options,p.specifications,p.image_url,p.image_permission_confirmed,p.status,p_actor,p.supplier_id,p.supplier_catalogue_item_id)
    on conflict(id) do update set category_slug=excluded.category_slug,title=excluded.title,description=excluded.description,description_zh=excluded.description_zh,
      sku=excluded.sku,variant_options=excluded.variant_options,specifications=excluded.specifications,image_url=excluded.image_url,
      image_permission_confirmed=excluded.image_permission_confirmed,status=excluded.status,updated_at=now(),supplier_id=case when p_product ? 'supplier_id' then excluded.supplier_id else public.fi_shop_products.supplier_id end,supplier_catalogue_item_id=case when p_product ? 'supplier_catalogue_item_id' then excluded.supplier_catalogue_item_id else public.fi_shop_products.supplier_catalogue_item_id end;
  insert into public.fi_product_sources(product_id,original_url,canonical_url,platform,supplier_product_id,supplier_name,supplier_variant,source_currency,source_unit_minor,fx_to_aud,fx_checked_at,min_quantity,checked_at,valid_until,verification_status)
    values(p.id,s.original_url,s.canonical_url,s.platform,s.supplier_product_id,s.supplier_name,s.supplier_variant,s.source_currency,s.source_unit_minor,s.fx_to_aud,s.fx_checked_at,s.min_quantity,s.checked_at,s.valid_until,s.verification_status)
    on conflict(product_id) do update set original_url=excluded.original_url,canonical_url=excluded.canonical_url,supplier_product_id=excluded.supplier_product_id,
      supplier_name=excluded.supplier_name,supplier_variant=excluded.supplier_variant,source_currency=excluded.source_currency,source_unit_minor=excluded.source_unit_minor,
      fx_to_aud=excluded.fx_to_aud,fx_checked_at=excluded.fx_checked_at,min_quantity=excluded.min_quantity,checked_at=excluded.checked_at,valid_until=excluded.valid_until,verification_status=excluded.verification_status;
  insert into public.fi_commerce_audit(actor_user_id,action,entity_id) values(p_actor,'product_saved',p.id);
end $$;


commit;
