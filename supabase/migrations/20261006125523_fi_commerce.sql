-- FI retail / warehouse-inspection workflow. Additive; existing RFQs are untouched.
-- Money is integer cents. Customer data and supplier procurement data are separate.
begin;

create table public.fi_shop_categories (
  slug text primary key check (slug ~ '^[a-z][a-z0-9-]{1,79}$'),
  name text not null, sort_order integer not null default 0
);
insert into public.fi_shop_categories (slug,name,sort_order) values
 ('door-hardware','Door hardware',10),('windows','Windows',20),('doors','Doors',30),
 ('stairs','Stairs',40),('glass','Glass',50),('other','Other building products',60);

create table public.fi_shop_products (
  id uuid primary key default gen_random_uuid(),
  category_slug text not null references public.fi_shop_categories(slug),
  title text not null check (length(title) between 1 and 200),
  description text not null default '', description_zh text not null default '',
  sku text, variant_options jsonb not null default '{}'::jsonb,
  specifications jsonb not null default '{}'::jsonb,
  image_url text check (image_url is null or image_url ~ '^https://'),
  image_kind text not null default 'supplier' check (image_kind in ('supplier','photograph','illustration')),
  image_permission_confirmed boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status <> 'published' or image_url is null or image_permission_confirmed)
);
create index fi_shop_products_category_idx on public.fi_shop_products(category_slug,status);
create index fi_shop_products_creator_idx on public.fi_shop_products(created_by);

create table public.fi_product_sources (
  product_id uuid primary key references public.fi_shop_products(id) on delete restrict,
  original_url text not null check (length(original_url) <= 4000 and original_url ~ '^https://'),
  canonical_url text not null check (canonical_url ~ '^https://'),
  platform text not null default 'alibaba', supplier_name text, supplier_product_id text,
  supplier_variant text, source_currency text check (source_currency ~ '^[A-Z]{3}$'),
  source_unit_minor bigint check (source_unit_minor between 1 and 100000000),
  fx_to_aud numeric(18,8) check (fx_to_aud > 0), fx_checked_at timestamptz,
  min_quantity integer not null default 1 check (min_quantity > 0),
  available_quantity integer check (available_quantity >= 0),
  checked_at timestamptz, valid_until timestamptz,
  procurement_method text not null default 'manual' check (procurement_method in ('manual','supplier_api')),
  adapter_key text, verification_status text not null default 'unverified'
    check (verification_status in ('unverified','supplier_stated','document_supported','fi_reviewed')),
  notes text not null default '', created_at timestamptz not null default now()
);
create index fi_product_sources_url_idx on public.fi_product_sources(canonical_url);

create table public.fi_product_evidence (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.fi_shop_products(id) on delete cascade,
  field_name text not null, claimed_value text not null,
  source_url text check (source_url is null or source_url ~ '^https://'),
  excerpt text, document_path text,
  evidence_status text not null default 'supplier_stated'
    check (evidence_status in ('supplier_stated','document_supported','needs_confirmation','conflicting')),
  checked_at timestamptz not null default now(), reviewed_by uuid references auth.users(id) on delete set null
);
create index fi_product_evidence_product_idx on public.fi_product_evidence(product_id);
create index fi_product_evidence_reviewer_idx on public.fi_product_evidence(reviewed_by);

create table public.fi_warehouses (
  id uuid primary key default gen_random_uuid(), name text not null,
  contact_name text not null, phone text not null, email text,
  address jsonb not null check (jsonb_typeof(address)='object'),
  receiving_instructions text not null default '', active boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now(),
  check (not active or (coalesce(address->>'line1','') <> '' and coalesce(address->>'city','') <> ''
    and coalesce(address->>'country','') ~ '^[A-Z]{2}$' and length(phone) >= 5 and length(contact_name) > 0))
);
create index fi_warehouses_editor_idx on public.fi_warehouses(updated_by);

create table public.fi_commerce_settings (
  id boolean primary key default true check(id),
  pricing_mode text check(pricing_mode in ('costs_included','absorb_costs')),
  updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now()
);
insert into public.fi_commerce_settings(id) values(true);
create index fi_commerce_settings_editor_idx on public.fi_commerce_settings(updated_by);

create table public.fi_shop_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('FI-O-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  user_id uuid not null references auth.users(id) on delete restrict,
  request_key uuid not null, currency text not null default 'AUD' check (currency='AUD'),
  status text not null default 'awaiting_quote' check (status in
    ('awaiting_quote','awaiting_payment','paid','purchasing','inbound','inspecting','ready_to_ship','shipped','delivered','on_hold','cancelled')),
  customer_email text not null, customer_phone text not null,
  shipping_address jsonb not null check (jsonb_typeof(shipping_address)='object'),
  billing_address jsonb not null check (jsonb_typeof(billing_address)='object'),
  delivery_notes text not null default '', terms_version text not null, terms_accepted_at timestamptz not null default now(),
  total_minor bigint check (total_minor between 1 and 100000000),
  quote_expires_at timestamptz, quote_approved_by uuid references auth.users(id) on delete set null,
  quote_approved_at timestamptz, paid_at timestamptz,
  fulfillment_hold boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id, request_key)
);
create index fi_shop_orders_user_idx on public.fi_shop_orders(user_id,created_at desc);
create index fi_shop_orders_queue_idx on public.fi_shop_orders(status,created_at);
create index fi_shop_orders_approver_idx on public.fi_shop_orders(quote_approved_by);

create table public.fi_shop_order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.fi_shop_orders(id) on delete restrict,
  product_id uuid not null references public.fi_shop_products(id) on delete restrict,
  product_updated_at timestamptz not null,
  title text not null, sku text, variant_options jsonb not null, specifications jsonb not null,
  quantity integer not null check (quantity between 1 and 10000),
  unique(order_id,product_id)
);
create index fi_shop_order_items_product_idx on public.fi_shop_order_items(product_id);

-- Internal costs are never exposed in a customer's order API.
create table public.fi_order_costs (
  order_id uuid primary key references public.fi_shop_orders(id) on delete restrict,
  source_subtotal_minor bigint not null check (source_subtotal_minor >= 0),
  markup_bps integer not null default 1000 check (markup_bps=1000),
  markup_minor bigint not null check (markup_minor >= 0),
  inbound_shipping_minor bigint not null default 0 check (inbound_shipping_minor >= 0),
  inspection_minor bigint not null default 0 check (inspection_minor >= 0),
  outbound_shipping_minor bigint not null default 0 check (outbound_shipping_minor >= 0),
  duties_minor bigint not null default 0 check (duties_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  payment_cost_minor bigint not null default 0 check (payment_cost_minor >= 0),
  pricing_mode text not null check (pricing_mode in ('costs_included','absorb_costs')),
  tax_note text not null, delivery_scope text not null, supplier_snapshot jsonb not null,
  approved_by uuid not null references auth.users(id) on delete restrict, approved_at timestamptz not null default now()
);
create index fi_order_costs_approver_idx on public.fi_order_costs(approved_by);

create table public.fi_checkout_attempts (
  order_id uuid primary key references public.fi_shop_orders(id) on delete restrict,
  idempotency_key uuid not null unique default gen_random_uuid(),
  stripe_session_id text unique, checkout_url text, stripe_payment_intent_id text unique,
  stripe_customer_id text, amount_minor bigint not null, currency text not null check(currency='AUD'),
  livemode boolean not null, request_payload jsonb not null,
  status text not null default 'creating' check(status in ('creating','open','paid','failed','expired')),
  created_at timestamptz not null default now(), expires_at timestamptz
);

create table public.fi_shop_payments (
  order_id uuid primary key references public.fi_shop_orders(id) on delete restrict,
  stripe_payment_intent_id text not null unique, stripe_session_id text not null unique,
  stripe_customer_id text, amount_received_minor bigint not null check (amount_received_minor > 0),
  refunded_minor bigint not null default 0 check (refunded_minor >= 0 and refunded_minor <= amount_received_minor),
  currency text not null check(currency='AUD'), livemode boolean not null,
  status text not null default 'paid' check(status in ('paid','partially_refunded','refunded','disputed')),
  receipt_url text, billing_details jsonb, payment_method_type text,
  paid_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.fi_payment_events (
  event_id text primary key, event_type text not null, order_id uuid references public.fi_shop_orders(id) on delete restrict,
  object_id text not null, livemode boolean not null, provider_created_at timestamptz not null,
  processed_at timestamptz not null default now()
);
create index fi_payment_events_order_idx on public.fi_payment_events(order_id);

create table public.fi_purchase_orders (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.fi_shop_orders(id) on delete restrict,
  order_item_id uuid not null unique references public.fi_shop_order_items(id) on delete restrict,
  warehouse_id uuid not null references public.fi_warehouses(id) on delete restrict,
  warehouse_snapshot jsonb not null, source_snapshot jsonb not null,
  quantity integer not null check(quantity > 0),
  status text not null default 'pending_purchase' check(status in ('pending_purchase','ordered','received','cancelled','exception')),
  external_order_id text, supplier_invoice_path text, actual_cost_minor bigint check(actual_cost_minor >= 0),
  actual_currency text check(actual_currency ~ '^[A-Z]{3}$'),
  purchased_at timestamptz, received_at timestamptz,
  automation_state text not null default 'manual_required' check(automation_state in ('manual_required','adapter_ready','failed','completed')),
  created_at timestamptz not null default now()
);
create index fi_purchase_orders_order_idx on public.fi_purchase_orders(order_id);
create index fi_purchase_orders_warehouse_idx on public.fi_purchase_orders(warehouse_id);

create table public.fi_inspections (
  id uuid primary key default gen_random_uuid(), purchase_order_id uuid not null references public.fi_purchase_orders(id) on delete restrict,
  inspector_user_id uuid not null references auth.users(id) on delete restrict,
  quantity_checked integer not null check(quantity_checked > 0), quantity_passed integer not null check(quantity_passed >= 0),
  result text not null check(result in ('pass','fail')), checklist jsonb not null,
  evidence_paths jsonb not null default '[]', notes text not null default '', created_at timestamptz not null default now(),
  check(quantity_passed <= quantity_checked), check(result <> 'pass' or quantity_checked=quantity_passed)
);
create index fi_inspections_purchase_idx on public.fi_inspections(purchase_order_id,created_at desc);
create index fi_inspections_inspector_idx on public.fi_inspections(inspector_user_id);

create table public.fi_order_shipments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.fi_shop_orders(id) on delete restrict,
  purchase_order_id uuid references public.fi_purchase_orders(id) on delete restrict,
  leg text not null check(leg in ('supplier_to_warehouse','warehouse_to_customer')),
  carrier text not null, tracking_number text not null, tracking_url text check(tracking_url is null or tracking_url ~ '^https://'),
  destination_snapshot jsonb not null, status text not null default 'shipped' check(status in ('shipped','delivered','exception','returned')),
  shipped_at timestamptz not null default now(), delivered_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  check(leg <> 'supplier_to_warehouse' or purchase_order_id is not null)
);
create index fi_order_shipments_order_idx on public.fi_order_shipments(order_id);
create index fi_order_shipments_purchase_idx on public.fi_order_shipments(purchase_order_id);
create index fi_order_shipments_creator_idx on public.fi_order_shipments(created_by);
create unique index fi_one_outbound_shipment on public.fi_order_shipments(order_id) where leg='warehouse_to_customer';

create table public.fi_order_returns (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.fi_shop_orders(id) on delete restrict,
  reason text not null, status text not null default 'requested' check(status in ('requested','approved','received','resolved','rejected')),
  stripe_refund_id text unique, refund_minor bigint check(refund_minor >= 0),
  notes text not null default '', created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create index fi_order_returns_order_idx on public.fi_order_returns(order_id);
create index fi_order_returns_creator_idx on public.fi_order_returns(created_by);
create table public.fi_commerce_audit (
  id uuid primary key default gen_random_uuid(), actor_user_id uuid references auth.users(id) on delete set null,
  action text not null, entity_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index fi_commerce_audit_actor_idx on public.fi_commerce_audit(actor_user_id);
create index fi_commerce_audit_entity_idx on public.fi_commerce_audit(entity_id,created_at desc);

-- All mutations go through authenticated Edge handlers / service-role-only RPCs.
-- The authenticated role gets SELECT only, with row ownership or FI team membership.
do $$ declare t text; begin
  foreach t in array array['fi_shop_categories','fi_shop_products','fi_product_sources','fi_product_evidence','fi_warehouses',
    'fi_shop_orders','fi_shop_order_items','fi_order_costs','fi_checkout_attempts','fi_shop_payments','fi_payment_events',
    'fi_purchase_orders','fi_inspections','fi_order_shipments','fi_order_returns','fi_commerce_audit','fi_commerce_settings'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy "FI team reads" on public.%I for select to authenticated using
      (exists (select 1 from public.fi_team_members m where lower(m.email)=lower((select auth.jwt())->>''email'')))',t);
  end loop;
end $$;
grant select on public.fi_shop_categories, public.fi_shop_products to anon;
create policy "Public categories" on public.fi_shop_categories for select to anon,authenticated using(true);
create policy "Published products" on public.fi_shop_products for select to anon,authenticated using(status='published');
create policy "Owner orders" on public.fi_shop_orders for select to authenticated using(user_id=(select auth.uid()));
create policy "Owner order items" on public.fi_shop_order_items for select to authenticated
  using(exists(select 1 from public.fi_shop_orders o where o.id=order_id and o.user_id=(select auth.uid())));
create policy "Owner payments" on public.fi_shop_payments for select to authenticated
  using(exists(select 1 from public.fi_shop_orders o where o.id=order_id and o.user_id=(select auth.uid())));
create policy "Owner outbound shipment" on public.fi_order_shipments for select to authenticated
  using(leg='warehouse_to_customer' and exists(select 1 from public.fi_shop_orders o where o.id=order_id and o.user_id=(select auth.uid())));
-- Internal return notes, inspection evidence and supplier invoices stay team-only.

create function public.fi_commerce_create_order(p_user uuid,p_request uuid,p_email text,p_phone text,p_shipping jsonb,p_billing jsonb,p_notes text,p_items jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare oid uuid; item jsonb; prod public.fi_shop_products; src public.fi_product_sources; q integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  select id into oid from public.fi_shop_orders where user_id=p_user and request_key=p_request;
  if oid is not null then return oid; end if;
  if (select count(*) from public.fi_shop_orders where user_id=p_user and created_at > now()-interval '1 hour') >= 20 then raise exception 'Too many order requests. Please contact FI.'; end if;
  if jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Invalid basket'; end if;
  insert into public.fi_shop_orders(user_id,request_key,customer_email,customer_phone,shipping_address,billing_address,delivery_notes,terms_version)
    values(p_user,p_request,p_email,p_phone,p_shipping,p_billing,p_notes,'2026-10-06') returning id into oid;
  for item in select * from jsonb_array_elements(p_items) loop
    q := (item->>'quantity')::integer;
    select * into strict prod from public.fi_shop_products where id=(item->>'product_id')::uuid and status='published';
    select * into strict src from public.fi_product_sources where product_id=prod.id;
    if q < src.min_quantity or (src.available_quantity is not null and q > src.available_quantity) then raise exception 'Quantity unavailable'; end if;
    insert into public.fi_shop_order_items(order_id,product_id,product_updated_at,title,sku,variant_options,specifications,quantity)
      values(oid,prod.id,prod.updated_at,prod.title,prod.sku,prod.variant_options,prod.specifications,q);
  end loop;
  return oid;
end $$;

create function public.fi_commerce_approve_quote(p_order uuid,p_actor uuid,p_costs jsonb,p_mode text,p_tax_note text,p_scope text)
returns bigint language plpgsql security invoker set search_path='' as $$
declare o public.fi_shop_orders; base bigint; markup bigint; total bigint; snapshots jsonb; expiry timestamptz;
begin
  select * into strict o from public.fi_shop_orders where id=p_order for update;
  if o.status <> 'awaiting_quote' or exists(select 1 from public.fi_checkout_attempts where order_id=p_order) then raise exception 'Quote is locked'; end if;
  if exists(select 1 from public.fi_shop_order_items i join public.fi_shop_products p on p.id=i.product_id
    where i.order_id=p_order and (i.product_updated_at <> p.updated_at or p.status <> 'published')) then raise exception 'Product changed since the request. Confirm a new request with the customer.'; end if;
  if exists(select 1 from public.fi_shop_order_items i join public.fi_product_sources s on s.product_id=i.product_id where i.order_id=p_order
    and (s.source_unit_minor is null or s.fx_to_aud is null or s.checked_at is null or s.valid_until is null or s.valid_until <= now()+interval '31 minutes'
      or s.verification_status <> 'fi_reviewed' or i.quantity < s.min_quantity or (s.available_quantity is not null and i.quantity > s.available_quantity)))
    then raise exception 'Verify source price, currency, variant, availability and quote validity first'; end if;
  select sum(round(s.source_unit_minor*s.fx_to_aud)::bigint*i.quantity),
    jsonb_agg(jsonb_build_object('order_item_id',i.id,'quantity',i.quantity,'source',to_jsonb(s))),
    least(min(s.valid_until),now()+interval '24 hours') into base,snapshots,expiry
    from public.fi_shop_order_items i join public.fi_product_sources s on s.product_id=i.product_id where i.order_id=p_order;
  markup := round(base*0.10)::bigint;
  total := base+markup;
  if p_mode='costs_included' then
    total := total+(p_costs->>'inbound_shipping_minor')::bigint+(p_costs->>'inspection_minor')::bigint+
      (p_costs->>'outbound_shipping_minor')::bigint+(p_costs->>'duties_minor')::bigint+
      (p_costs->>'tax_minor')::bigint+(p_costs->>'payment_cost_minor')::bigint;
  elsif p_mode <> 'absorb_costs' then raise exception 'Invalid pricing mode'; end if;
  insert into public.fi_order_costs(order_id,source_subtotal_minor,markup_minor,inbound_shipping_minor,inspection_minor,outbound_shipping_minor,duties_minor,tax_minor,payment_cost_minor,pricing_mode,tax_note,delivery_scope,supplier_snapshot,approved_by)
    values(p_order,base,markup,(p_costs->>'inbound_shipping_minor')::bigint,(p_costs->>'inspection_minor')::bigint,
      (p_costs->>'outbound_shipping_minor')::bigint,(p_costs->>'duties_minor')::bigint,(p_costs->>'tax_minor')::bigint,
      (p_costs->>'payment_cost_minor')::bigint,p_mode,p_tax_note,p_scope,snapshots,p_actor);
  update public.fi_shop_orders set total_minor=total,status='awaiting_payment',quote_expires_at=expiry,
    quote_approved_by=p_actor,quote_approved_at=now(),updated_at=now() where id=p_order;
  insert into public.fi_commerce_audit(actor_user_id,action,entity_id,details) values(p_actor,'quote_approved',p_order,jsonb_build_object('total_minor',total,'pricing_mode',p_mode));
  return total;
end $$;

create function public.fi_commerce_reserve_checkout(p_order uuid,p_user uuid,p_live boolean,p_payload jsonb)
returns public.fi_checkout_attempts language plpgsql security invoker set search_path='' as $$
declare o public.fi_shop_orders; a public.fi_checkout_attempts;
begin
  select * into strict o from public.fi_shop_orders where id=p_order and user_id=p_user for update;
  if o.status <> 'awaiting_payment' or o.fulfillment_hold or o.quote_expires_at < now()+interval '31 minutes' then raise exception 'Order is not ready for checkout'; end if;
  insert into public.fi_checkout_attempts(order_id,amount_minor,currency,livemode,request_payload,expires_at)
    values(o.id,o.total_minor,o.currency,p_live,p_payload,least(o.quote_expires_at,now()+interval '60 minutes')) on conflict(order_id) do nothing;
  select * into strict a from public.fi_checkout_attempts where order_id=p_order;
  if a.livemode <> p_live then raise exception 'Payment environment changed'; end if;
  return a;
end $$;

create function public.fi_commerce_record_payment(p_event jsonb,p_session jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.fi_checkout_attempts; o public.fi_shop_orders; oid uuid;
begin
  oid := (p_session->'metadata'->>'fi_order_id')::uuid;
  select * into strict o from public.fi_shop_orders where id=oid for update;
  if exists(select 1 from public.fi_payment_events where event_id=p_event->>'id') then return; end if;
  select * into strict a from public.fi_checkout_attempts where order_id=oid;
  -- Recover when Stripe succeeded but the HTTP caller lost the database response.
  if a.stripe_session_id is null and p_session->'metadata'->>'fi_attempt_key'=a.idempotency_key::text
    and a.amount_minor=(p_session->>'amount_total')::bigint and a.livemode=(p_session->>'livemode')::boolean
    and p_session->>'client_reference_id'=oid::text and p_session->>'currency'='aud' then
    update public.fi_checkout_attempts set stripe_session_id=p_session->>'id' where order_id=oid returning * into a;
  end if;
  if a.stripe_session_id is distinct from p_session->>'id' or a.amount_minor <> (p_session->>'amount_total')::bigint
    or lower(a.currency) <> p_session->>'currency' or a.livemode <> (p_session->>'livemode')::boolean
    or p_session->>'client_reference_id' <> oid::text then raise exception 'Payment does not match reserved checkout'; end if;
  if p_session->>'payment_status'='paid' then
    insert into public.fi_shop_payments(order_id,stripe_payment_intent_id,stripe_session_id,stripe_customer_id,amount_received_minor,currency,livemode,billing_details)
      values(oid,p_session->>'payment_intent',p_session->>'id',p_session->>'customer',a.amount_minor,a.currency,a.livemode,p_session->'customer_details') on conflict(order_id) do nothing;
    update public.fi_checkout_attempts set status='paid',stripe_payment_intent_id=p_session->>'payment_intent',stripe_customer_id=p_session->>'customer' where order_id=oid;
    update public.fi_shop_orders set paid_at=coalesce(paid_at,now()), status=case when status='awaiting_payment' then 'paid' else status end,updated_at=now() where id=oid;
  elsif p_event->>'type'='checkout.session.async_payment_failed' then
    update public.fi_checkout_attempts set status='failed' where order_id=oid and status <> 'paid';
  elsif p_event->>'type'='checkout.session.expired' then
    update public.fi_checkout_attempts set status='expired' where order_id=oid and status <> 'paid';
  end if;
  insert into public.fi_payment_events(event_id,event_type,order_id,object_id,livemode,provider_created_at)
    values(p_event->>'id',p_event->>'type',oid,p_session->>'id',(p_event->>'livemode')::boolean,to_timestamp((p_event->>'created')::double precision));
end $$;

create function public.fi_commerce_prepare_purchase(p_order uuid,p_warehouse uuid,p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare o public.fi_shop_orders; w public.fi_warehouses; snap jsonb;
begin
  select * into strict o from public.fi_shop_orders where id=p_order for update;
  if o.status not in ('paid','purchasing') or o.fulfillment_hold or not exists(select 1 from public.fi_shop_payments where order_id=p_order and status='paid' and livemode)
    then
    -- Test payments must never release physical procurement.
    raise exception 'A live confirmed payment without a hold is required for purchasing';
  end if;
  select * into strict w from public.fi_warehouses where id=p_warehouse and active;
  for snap in select * from jsonb_array_elements((select supplier_snapshot from public.fi_order_costs where order_id=p_order)) loop
    if (snap->'source'->>'valid_until')::timestamptz <= now() then raise exception 'Supplier quote expired; reconcile before buying'; end if;
    insert into public.fi_purchase_orders(order_id,order_item_id,warehouse_id,warehouse_snapshot,source_snapshot,quantity)
      values(p_order,(snap->>'order_item_id')::uuid,w.id,to_jsonb(w),snap->'source',(snap->>'quantity')::integer)
      on conflict(order_item_id) do nothing;
  end loop;
  update public.fi_shop_orders set status='purchasing',updated_at=now() where id=p_order;
  insert into public.fi_commerce_audit(actor_user_id,action,entity_id) values(p_actor,'purchase_prepared',p_order);
end $$;

create function public.fi_commerce_inspect(p_purchase uuid,p_actor uuid,p_checked integer,p_passed integer,p_checklist jsonb,p_notes text,p_evidence jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare po public.fi_purchase_orders; outcome text;
begin
  select * into strict po from public.fi_purchase_orders where id=p_purchase;
  perform 1 from public.fi_shop_orders where id=po.order_id for update;
  if po.status <> 'received' or exists(select 1 from public.fi_order_shipments where order_id=po.order_id and leg='warehouse_to_customer') then raise exception 'Inspection requires warehouse receipt before dispatch'; end if;
  if p_checked <> po.quantity or p_passed > p_checked or p_passed < 0 then raise exception 'Inspect every ordered unit'; end if;
  outcome := case when p_passed=p_checked and p_checklist @> '{"correct_variant":true,"dimensions":true,"finish":true,"function":true,"packaging":true}'::jsonb then 'pass' else 'fail' end;
  insert into public.fi_inspections(purchase_order_id,inspector_user_id,quantity_checked,quantity_passed,result,checklist,notes,evidence_paths)
    values(po.id,p_actor,p_checked,p_passed,outcome,p_checklist,p_notes,p_evidence);
  update public.fi_shop_orders set status='inspecting',updated_at=now() where id=po.order_id;
end $$;

create function public.fi_commerce_dispatch(p_order uuid,p_actor uuid,p_carrier text,p_tracking text,p_url text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare o public.fi_shop_orders; sid uuid;
begin
  select * into strict o from public.fi_shop_orders where id=p_order for update;
  if o.fulfillment_hold or o.status not in ('inspecting','ready_to_ship') or not exists(select 1 from public.fi_shop_payments where order_id=p_order and status='paid' and livemode) then raise exception 'Payment or fulfillment hold blocks dispatch'; end if;
  if exists(select 1 from public.fi_shop_order_items i left join public.fi_purchase_orders p on p.order_item_id=i.id
    left join lateral (select result,quantity_passed from public.fi_inspections where purchase_order_id=p.id order by created_at desc,id desc limit 1) x on true
    where i.order_id=p_order and (p.id is null or p.status <> 'received' or x.result is distinct from 'pass' or x.quantity_passed is distinct from i.quantity)) then raise exception 'Every order item must pass full inspection before dispatch'; end if;
  insert into public.fi_order_shipments(order_id,leg,carrier,tracking_number,tracking_url,destination_snapshot,created_by)
    values(p_order,'warehouse_to_customer',p_carrier,p_tracking,p_url,o.shipping_address,p_actor) returning id into sid;
  update public.fi_shop_orders set status='shipped',updated_at=now() where id=p_order;
  insert into public.fi_commerce_audit(actor_user_id,action,entity_id,details) values(p_actor,'dispatched',p_order,jsonb_build_object('shipment_id',sid));
  return sid;
end $$;

create function public.fi_commerce_save_product(p_product jsonb,p_source jsonb,p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare p public.fi_shop_products; s public.fi_product_sources;
begin
  p := jsonb_populate_record(null::public.fi_shop_products,p_product);
  s := jsonb_populate_record(null::public.fi_product_sources,p_source);
  insert into public.fi_shop_products(id,category_slug,title,description,description_zh,sku,variant_options,specifications,image_url,image_permission_confirmed,status,created_by)
    values(p.id,p.category_slug,p.title,p.description,p.description_zh,p.sku,p.variant_options,p.specifications,p.image_url,p.image_permission_confirmed,p.status,p_actor)
    on conflict(id) do update set category_slug=excluded.category_slug,title=excluded.title,description=excluded.description,description_zh=excluded.description_zh,
      sku=excluded.sku,variant_options=excluded.variant_options,specifications=excluded.specifications,image_url=excluded.image_url,
      image_permission_confirmed=excluded.image_permission_confirmed,status=excluded.status,updated_at=now();
  insert into public.fi_product_sources(product_id,original_url,canonical_url,platform,supplier_product_id,supplier_name,supplier_variant,source_currency,source_unit_minor,fx_to_aud,fx_checked_at,min_quantity,checked_at,valid_until,verification_status)
    values(p.id,s.original_url,s.canonical_url,s.platform,s.supplier_product_id,s.supplier_name,s.supplier_variant,s.source_currency,s.source_unit_minor,s.fx_to_aud,s.fx_checked_at,s.min_quantity,s.checked_at,s.valid_until,s.verification_status)
    on conflict(product_id) do update set original_url=excluded.original_url,canonical_url=excluded.canonical_url,supplier_product_id=excluded.supplier_product_id,
      supplier_name=excluded.supplier_name,supplier_variant=excluded.supplier_variant,source_currency=excluded.source_currency,source_unit_minor=excluded.source_unit_minor,
      fx_to_aud=excluded.fx_to_aud,fx_checked_at=excluded.fx_checked_at,min_quantity=excluded.min_quantity,checked_at=excluded.checked_at,valid_until=excluded.valid_until,verification_status=excluded.verification_status;
  insert into public.fi_commerce_audit(actor_user_id,action,entity_id) values(p_actor,'product_saved',p.id);
end $$;

create function public.fi_commerce_update_purchase(p_purchase uuid,p_actor uuid,p_action text,p_details jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare p public.fi_purchase_orders; o public.fi_shop_orders;
begin
  select * into strict p from public.fi_purchase_orders where id=p_purchase;
  select * into strict o from public.fi_shop_orders where id=p.order_id for update;
  if o.fulfillment_hold or not exists(select 1 from public.fi_shop_payments where order_id=o.id and status='paid' and livemode) then raise exception 'Payment hold'; end if;
  if p_action='ordered' and p.status='pending_purchase' then
    if length(coalesce(p_details->>'external_order_id',''))=0 then raise exception 'Supplier order reference is required'; end if;
    update public.fi_purchase_orders set status='ordered',external_order_id=p_details->>'external_order_id',purchased_at=now() where id=p.id;
    update public.fi_shop_orders set status='purchasing',updated_at=now() where id=o.id;
  elsif p_action='inbound' and p.status='ordered' then
    if length(coalesce(p_details->>'carrier',''))=0 or length(coalesce(p_details->>'tracking_number',''))=0 then raise exception 'Tracking is required'; end if;
    insert into public.fi_order_shipments(order_id,purchase_order_id,leg,carrier,tracking_number,tracking_url,destination_snapshot,created_by)
      values(o.id,p.id,'supplier_to_warehouse',p_details->>'carrier',p_details->>'tracking_number',p_details->>'tracking_url',p.warehouse_snapshot,p_actor);
    update public.fi_shop_orders set status='inbound',updated_at=now() where id=o.id;
  elsif p_action='received' and p.status='ordered' then
    update public.fi_purchase_orders set status='received',received_at=now() where id=p.id;
    update public.fi_order_shipments set status='delivered',delivered_at=now() where purchase_order_id=p.id and leg='supplier_to_warehouse';
    update public.fi_shop_orders set status='inspecting',updated_at=now() where id=o.id;
  else raise exception 'Invalid purchase transition'; end if;
  insert into public.fi_commerce_audit(actor_user_id,action,entity_id,details) values(p_actor,'purchase_'||p_action,p.id,p_details);
end $$;

create function public.fi_commerce_deliver(p_order uuid,p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.fi_shop_orders where id=p_order and status='shipped' for update;
  if not found then raise exception 'Order has not shipped'; end if;
  update public.fi_order_shipments set status='delivered',delivered_at=now() where order_id=p_order and leg='warehouse_to_customer';
  update public.fi_shop_orders set status='delivered',updated_at=now() where id=p_order;
  insert into public.fi_commerce_audit(actor_user_id,action,entity_id) values(p_actor,'delivered',p_order);
end $$;

create function public.fi_commerce_payment_adjustment(p_event jsonb,p_intent text,p_refunded bigint,p_disputed boolean)
returns void language plpgsql security invoker set search_path='' as $$
declare p public.fi_shop_payments;
begin
  select * into strict p from public.fi_shop_payments where stripe_payment_intent_id=p_intent;
  perform 1 from public.fi_shop_orders where id=p.order_id for update;
  if exists(select 1 from public.fi_payment_events where event_id=p_event->>'id') then return; end if;
  if p.livemode <> (p_event->>'livemode')::boolean or p_refunded > p.amount_received_minor then raise exception 'Adjustment mismatch'; end if;
  update public.fi_shop_payments set refunded_minor=greatest(refunded_minor,p_refunded),
    status=case when p_disputed or status='disputed' then 'disputed' when greatest(refunded_minor,p_refunded)=amount_received_minor then 'refunded'
      when greatest(refunded_minor,p_refunded)>0 then 'partially_refunded' else status end,updated_at=now() where order_id=p.order_id;
  -- Holds are deliberately not auto-cleared by late events. FI must reconcile first.
  if p_refunded > 0 or p_disputed then update public.fi_shop_orders set fulfillment_hold=true,updated_at=now() where id=p.order_id; end if;
  insert into public.fi_payment_events(event_id,event_type,order_id,object_id,livemode,provider_created_at)
    values(p_event->>'id',p_event->>'type',p.order_id,p_intent,p.livemode,to_timestamp((p_event->>'created')::double precision));
end $$;

-- RPCs are internal operations, never customer-callable or SECURITY DEFINER.
do $$ declare r record; begin
  for r in select oid::regprocedure as sig from pg_proc where pronamespace='public'::regnamespace and proname like 'fi_commerce_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',r.sig);
    execute format('grant execute on function %s to service_role',r.sig);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('fi-commerce-evidence','fi-commerce-evidence',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do nothing;
create policy "FI commerce evidence team access" on storage.objects for all to authenticated
 using(bucket_id='fi-commerce-evidence' and exists(select 1 from public.fi_team_members m where lower(m.email)=lower((select auth.jwt())->>'email')))
 with check(bucket_id='fi-commerce-evidence' and exists(select 1 from public.fi_team_members m where lower(m.email)=lower((select auth.jwt())->>'email')));

comment on table public.fi_shop_payments is 'Verified provider payment ledger. Never store card numbers, CVCs or customer bank credentials.';
comment on table public.fi_purchase_orders is 'One purchase instruction per order item. Supplier adapter is intentionally not enabled by a URL alone.';

-- The user's example is an unverified private draft, never a fabricated sellable item.
do $$ declare pid uuid; begin
  insert into public.fi_shop_products(category_slug,title,description)
    values('door-hardware','Dooroom knurled interior door lever — verify supplier details','Source link saved. Material, dimensions, variant, price and image rights still need verification.') returning id into pid;
  insert into public.fi_product_sources(product_id,original_url,canonical_url,supplier_product_id)
    values(pid,'https://www.alibaba.com/product-detail/Dooroom-Knurled-Brass-Interior-Door-Lever_1600673981943.html?spm=a2700.prosearch.normal_offer.d_image.61c067afO3jo6j&priceId=a49c8109870f478caa38883392183333',
      'https://www.alibaba.com/product-detail/Dooroom-Knurled-Brass-Interior-Door-Lever_1600673981943.html','1600673981943');
  insert into public.fi_commerce_audit(action,entity_id) values('user_example_source_saved',pid);
end $$;
commit;
