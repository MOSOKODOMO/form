-- Prepared marketplace schema. This file is not applied by the static site.
-- Public reports contain only the human-approved output of FI Verify.

create table public.fi_marketplace_makers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 200),
  website text not null check (website ~* '^https://[^[:space:]]+$' and char_length(website) <= 500),
  country text check (country is null or char_length(trim(country)) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fi_marketplace_reports (
  id uuid primary key,
  maker_id uuid not null references public.fi_marketplace_makers(id) on delete restrict,
  product_type text not null check (char_length(trim(product_type)) between 1 and 120),
  date_checked date not null,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null,
  public_report jsonb not null check (
    jsonb_typeof(public_report) = 'object'
    and public_report->>'status' = 'approved'
    and public_report->>'decision' in ('verified', 'not_verified', 'inconclusive')
    and jsonb_typeof(public_report->'verificationCurrent') = 'boolean'
    and public_report->>'id' = id::text
    and lower(trim(public_report->'maker'->>'productType')) = lower(trim(product_type))
    and jsonb_typeof(public_report->'humanReviewer') = 'object'
    and nullif(public_report->'humanReviewer'->>'id', '') is not null
    and nullif(public_report->'humanReviewer'->>'name', '') is not null
    and jsonb_typeof(public_report->'sources') = 'array'
  ),
  created_at timestamptz not null default now(),
  unique (id, maker_id)
);

create table public.fi_marketplace_products (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.fi_marketplace_makers(id) on delete restrict,
  report_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 200),
  product_url text check (product_url is null or (product_url ~* '^https://[^[:space:]]+$' and char_length(product_url) <= 1000)),
  category text check (category is null or char_length(trim(category)) <= 120),
  material text check (material is null or char_length(trim(material)) <= 200),
  finishes text[] not null default '{}',
  sizes text[] not null default '{}',
  price_usd text check (price_usd is null or char_length(price_usd) <= 120),
  moq text check (moq is null or char_length(moq) <= 120),
  photo_url text check (photo_url is null or char_length(photo_url) <= 1000),
  photo_permission_status text not null default 'Pending'
    check (photo_permission_status in ('Pending', 'Approved', 'Denied')),
  story_en text check (story_en is null or char_length(story_en) <= 5000),
  story_zh text check (story_zh is null or char_length(story_zh) <= 5000),
  confirmed_delivery_time text check (confirmed_delivery_time is null or char_length(confirmed_delivery_time) <= 200),
  delivery_time_confirmed boolean not null default false,
  stripe_payment_link text check (stripe_payment_link is null or stripe_payment_link ~* '^https://(checkout\.stripe\.com|buy\.stripe\.com)/[^[:space:]]+$'),
  checkout_ready boolean not null default false,
  origin_town text check (origin_town is null or char_length(origin_town) <= 160),
  origin_craft text check (origin_craft is null or char_length(origin_craft) <= 300),
  origin_materials text check (origin_materials is null or char_length(origin_materials) <= 300),
  distance_to_melbourne_km numeric(9,1) check (distance_to_melbourne_km is null or distance_to_melbourne_km >= 0),
  status text not null default 'Draft'
    check (status in ('Draft', 'In review', 'Approved', 'Live', 'Rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (report_id, maker_id)
    references public.fi_marketplace_reports(id, maker_id) on delete restrict,
  check (status not in ('Approved', 'Live') or (
    report_id is not null and category is not null and char_length(trim(category)) > 0
    and photo_permission_status = 'Approved' and photo_url is not null and char_length(trim(photo_url)) > 0
  )),
  check (not delivery_time_confirmed or (confirmed_delivery_time is not null and char_length(trim(confirmed_delivery_time)) > 0)),
  check (not checkout_ready or (
    status in ('Approved', 'Live') and stripe_payment_link is not null
  ))
);

-- Feedback storage is private. The current form still sends email; public database
-- inserts stay closed until a validated, rate-limited server endpoint exists.
create table public.fi_user_feedback (
  id uuid primary key default gen_random_uuid(),
  role text not null check (char_length(trim(role)) between 1 and 100),
  would_use text not null check (char_length(trim(would_use)) between 1 and 100),
  proof text check (proof is null or char_length(proof) <= 100),
  concern text check (concern is null or char_length(concern) <= 2000),
  source_next text check (source_next is null or char_length(source_next) <= 1000),
  name text check (name is null or char_length(name) <= 160),
  email text check (email is null or (char_length(email) <= 320 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  created_at timestamptz not null default now()
);

create index fi_marketplace_reports_maker_checked_idx
  on public.fi_marketplace_reports (maker_id, date_checked desc);
create index fi_marketplace_products_maker_idx
  on public.fi_marketplace_products (maker_id);
create index fi_marketplace_products_report_idx
  on public.fi_marketplace_products (report_id) where report_id is not null;
create index fi_marketplace_products_public_idx
  on public.fi_marketplace_products (maker_id, status)
  where status in ('Approved', 'Live') and photo_permission_status = 'Approved';
create index fi_user_feedback_created_idx on public.fi_user_feedback (created_at desc);

-- Recheck proof expiry at read time. The exported verificationCurrent flag alone
-- can become stale after a certificate or lab accreditation expires.
create schema if not exists fi_private;
revoke all on schema fi_private from public;
grant usage on schema fi_private to anon, authenticated;

create function fi_private.marketplace_report_has_current_proof(report_payload jsonb)
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(report_payload->'certificates') = 'array'
        then report_payload->'certificates' else '[]'::jsonb end
    ) as item(proof)
    where item.proof->>'status' = 'Verified'
      and item.proof->'registerCheck'->>'result' = 'found'
      and nullif(item.proof->'humanVerification'->'reviewer'->>'id', '') is not null
      and item.proof->>'expiryDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and item.proof->>'expiryDate' >= pg_catalog.to_char(current_date, 'YYYY-MM-DD')
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(report_payload->'testReports') = 'array'
        then report_payload->'testReports' else '[]'::jsonb end
    ) as item(proof)
    where item.proof->>'status' = 'Verified'
      and item.proof->'accreditationCheck'->>'result' = 'found'
      and nullif(item.proof->'humanVerification'->'reviewer'->>'id', '') is not null
      and (
        item.proof->>'accreditationExpiryDate' is null
        or (
          item.proof->>'accreditationExpiryDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          and item.proof->>'accreditationExpiryDate' >= pg_catalog.to_char(current_date, 'YYYY-MM-DD')
        )
      )
  );
$$;
revoke all on function fi_private.marketplace_report_has_current_proof(jsonb) from public;
grant execute on function fi_private.marketplace_report_has_current_proof(jsonb) to anon, authenticated;

alter table public.fi_marketplace_makers enable row level security;
alter table public.fi_marketplace_reports enable row level security;
alter table public.fi_marketplace_products enable row level security;
alter table public.fi_user_feedback enable row level security;

revoke all on public.fi_marketplace_makers, public.fi_marketplace_reports,
  public.fi_marketplace_products, public.fi_user_feedback from anon, authenticated;
grant select on public.fi_marketplace_makers, public.fi_marketplace_reports,
  public.fi_marketplace_products to anon, authenticated;
grant insert, update, delete on public.fi_marketplace_makers,
  public.fi_marketplace_products to authenticated;
grant insert on public.fi_marketplace_reports to authenticated;
grant insert (role, would_use, proof, concern, source_next, name, email)
  on public.fi_user_feedback to authenticated;
grant select on public.fi_user_feedback to authenticated;

create policy "Public can read makers with an approved report"
  on public.fi_marketplace_makers for select to anon, authenticated
  using (exists (
    select 1 from public.fi_marketplace_reports report
    where report.maker_id = fi_marketplace_makers.id
      and report.public_report->>'decision' = 'verified'
      and report.public_report->>'verificationCurrent' = 'true'
      and fi_private.marketplace_report_has_current_proof(report.public_report)
  ));

create policy "FI team manages marketplace makers"
  on public.fi_marketplace_makers for all to authenticated
  using (exists (
    select 1 from public.fi_team_members member
    where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))
  ))
  with check (exists (
    select 1 from public.fi_team_members member
    where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))
  ));

create policy "Public can read approved FI reports"
  on public.fi_marketplace_reports for select to anon, authenticated
  using (approved_by is not null and approved_at is not null
    and public_report->>'status' = 'approved');

create policy "FI humans can insert approved FI reports"
  on public.fi_marketplace_reports for insert to authenticated
  with check (
    approved_by = (select auth.uid())
    and exists (
      select 1 from public.fi_team_members member
      where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))
    )
  );

create policy "Public can read approved products with photo permission"
  on public.fi_marketplace_products for select to anon, authenticated
  using (
    status in ('Approved', 'Live')
    and photo_permission_status = 'Approved'
    and nullif(trim(photo_url), '') is not null
    and exists (
      select 1 from public.fi_marketplace_reports report
      where report.id = fi_marketplace_products.report_id
        and report.maker_id = fi_marketplace_products.maker_id
        and report.public_report->>'status' = 'approved'
        and report.public_report->>'decision' = 'verified'
        and report.public_report->>'verificationCurrent' = 'true'
        and fi_private.marketplace_report_has_current_proof(report.public_report)
        and lower(trim(report.product_type)) = lower(trim(fi_marketplace_products.category))
    )
  );

create policy "FI team manages marketplace products"
  on public.fi_marketplace_products for all to authenticated
  using (exists (
    select 1 from public.fi_team_members member
    where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))
  ))
  with check (exists (
    select 1 from public.fi_team_members member
    where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))
  ));

create policy "FI team can insert structured FI feedback"
  on public.fi_user_feedback for insert to authenticated
  with check (exists (
    select 1 from public.fi_team_members member
    where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))
  ));

create policy "FI team can read feedback"
  on public.fi_user_feedback for select to authenticated
  using (exists (
    select 1 from public.fi_team_members member
    where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))
  ));
