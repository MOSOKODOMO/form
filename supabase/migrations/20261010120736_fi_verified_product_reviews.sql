-- Reviews have a public content record and a separate, private purchase association.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.fi_product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.fi_shop_products(id) on delete restrict,
  product_title text not null,
  catalogue_handle text check (catalogue_handle is null or catalogue_handle ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  display_name text not null check (length(btrim(display_name)) between 2 and 80),
  rating smallint not null check (rating between 1 and 5),
  title text not null check (length(btrim(title)) between 3 and 120),
  body text not null check (length(btrim(body)) between 20 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fi_product_reviews_product_date_idx on public.fi_product_reviews(product_id,created_at desc);
create index fi_product_reviews_handle_idx on public.fi_product_reviews(catalogue_handle) where catalogue_handle is not null;
alter table public.fi_product_reviews enable row level security;
revoke all on public.fi_product_reviews from public, anon, authenticated;
grant select on public.fi_product_reviews to anon, authenticated;
grant all on public.fi_product_reviews to service_role;
create policy "Read genuine customer review content" on public.fi_product_reviews for select to anon,authenticated using(true);

create table private.fi_review_purchases (
  review_id uuid primary key references public.fi_product_reviews(id) on delete cascade,
  order_item_id uuid not null unique references public.fi_shop_order_items(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict
);
create index fi_review_purchases_user_idx on private.fi_review_purchases(user_id);
alter table private.fi_review_purchases enable row level security;
revoke all on private.fi_review_purchases from public,anon,authenticated;
grant usage on schema private to service_role;
grant all on private.fi_review_purchases to service_role;

create function public.fi_reviewable_items()
returns table(order_item_id uuid,product_id uuid,product_title text,review_id uuid,display_name text,rating smallint,title text,body text)
language sql stable security definer set search_path='' as $$
 select i.id,i.product_id,i.title,r.id,r.display_name,r.rating,r.title,r.body
 from public.fi_shop_order_items i
 join public.fi_shop_orders o on o.id=i.order_id
 join public.fi_shop_payments pay on pay.order_id=o.id and pay.livemode=true
 join public.fi_order_shipments ship on ship.order_id=o.id and ship.leg='warehouse_to_customer'
   and ship.status='delivered' and ship.delivered_at is not null
 left join private.fi_review_purchases rp on rp.order_item_id=i.id and rp.user_id=(select auth.uid())
 left join public.fi_product_reviews r on r.id=rp.review_id
 where o.user_id=(select auth.uid()) and o.status='delivered'
 order by o.created_at desc,i.title;
$$;
revoke all on function public.fi_reviewable_items() from public,anon,authenticated;
grant execute on function public.fi_reviewable_items() to authenticated;

create function public.fi_submit_product_review(p_order_item uuid,p_display_name text,p_rating integer,p_title text,p_body text,p_public_consent boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare buyer uuid := auth.uid(); item record; rid uuid;
begin
 if buyer is null then raise exception 'Sign in to review your purchase.'; end if;
 if p_public_consent is distinct from true then raise exception 'Confirm that your review and display name may be published.'; end if;
 select i.product_id,i.title,p.specifications->>'catalogue_handle' as handle into item
 from public.fi_shop_order_items i
 join public.fi_shop_orders o on o.id=i.order_id
 join public.fi_shop_products p on p.id=i.product_id
 join public.fi_shop_payments pay on pay.order_id=o.id and pay.livemode=true
 join public.fi_order_shipments ship on ship.order_id=o.id and ship.leg='warehouse_to_customer'
   and ship.status='delivered' and ship.delivered_at is not null
 where i.id=p_order_item and o.user_id=buyer and o.status='delivered';
 if not found then raise exception 'Reviews require your own delivered, paid purchase. Test orders are not eligible.'; end if;
 if p_rating is null or p_rating not between 1 and 5 or p_display_name is null or p_title is null or p_body is null then
   raise exception 'Complete your display name, rating, title and review.';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_item::text,0));
 select rp.review_id into rid from private.fi_review_purchases rp where rp.order_item_id=p_order_item and rp.user_id=buyer;
 if rid is null then
  insert into public.fi_product_reviews(product_id,product_title,catalogue_handle,display_name,rating,title,body)
  values(item.product_id,item.title,case when item.handle ~ '^[a-z0-9][a-z0-9-]{0,119}$' then item.handle else null end,
    btrim(p_display_name),p_rating,btrim(p_title),btrim(p_body)) returning id into rid;
  insert into private.fi_review_purchases(review_id,order_item_id,user_id) values(rid,p_order_item,buyer);
 else
  update public.fi_product_reviews set display_name=btrim(p_display_name),rating=p_rating,title=btrim(p_title),body=btrim(p_body),updated_at=now() where id=rid;
 end if;
 return rid;
end;
$$;
revoke all on function public.fi_submit_product_review(uuid,text,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function public.fi_submit_product_review(uuid,text,integer,text,text,boolean) to authenticated;
create function public.fi_review_summary(p_product uuid default null,p_handle text default null,p_rating integer default null)
returns table(review_count bigint,average_rating numeric)
language sql stable security invoker set search_path='' as $$
 select count(*),round(avg(r.rating),1) from public.fi_product_reviews r
 where (p_product is null or r.product_id=p_product) and (p_handle is null or r.catalogue_handle=p_handle)
   and (p_rating is null or r.rating=p_rating);
$$;
create function public.fi_review_products()
returns table(product_id uuid,product_title text)
language sql stable security invoker set search_path='' as $$
 select r.product_id,min(r.product_title) from public.fi_product_reviews r group by r.product_id order by min(r.product_title);
$$;
revoke all on function public.fi_review_summary(uuid,text,integer), public.fi_review_products() from public,anon,authenticated;
grant execute on function public.fi_review_summary(uuid,text,integer), public.fi_review_products() to anon,authenticated;
comment on table public.fi_product_reviews is 'Genuine delivered FI purchases only. Contains no account, order, payment or delivery identifiers. All ratings are published equally.';
notify pgrst,'reload schema';
commit;
