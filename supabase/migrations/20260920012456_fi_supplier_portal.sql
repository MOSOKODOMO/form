-- Fabrication Intelligence Stage 3: private supplier onboarding and catalogue review.
--
-- Create an Auth user for each supplier in Supabase Dashboard before sending their
-- magic link. Add their email to fi_supplier_memberships; the portal intentionally
-- has no public sign-up path.

create table if not exists public.fi_supplier_profiles (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (char_length(trim(legal_name)) between 1 and 200),
  trading_name text check (trading_name is null or char_length(trim(trading_name)) <= 200),
  country text not null default 'China' check (char_length(trim(country)) between 2 and 100),
  province_or_state text check (province_or_state is null or char_length(trim(province_or_state)) <= 120),
  city text check (city is null or char_length(trim(city)) <= 120),
  website text check (website is null or char_length(trim(website)) <= 500),
  contact_name text check (contact_name is null or char_length(trim(contact_name)) <= 160),
  contact_email text check (contact_email is null or (position('@' in contact_email) > 1 and char_length(contact_email) <= 320)),
  contact_phone text check (contact_phone is null or char_length(trim(contact_phone)) <= 80),
  capabilities text check (capabilities is null or char_length(capabilities) <= 4000),
  certifications text check (certifications is null or char_length(certifications) <= 4000),
  moq_notes text check (moq_notes is null or char_length(moq_notes) <= 1000),
  typical_lead_time_days integer check (typical_lead_time_days is null or typical_lead_time_days between 1 and 730),
  export_markets text check (export_markets is null or char_length(export_markets) <= 1000),
  supplier_submission_state text not null default 'draft' check (supplier_submission_state in ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fi_supplier_memberships (
  supplier_id uuid not null references public.fi_supplier_profiles(id) on delete cascade,
  email text not null check (char_length(trim(email)) between 3 and 320),
  role text not null default 'owner' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (supplier_id, email)
);

-- Review information is separated from supplier-editable data. A supplier can submit
-- its own profile, but cannot make itself approved.
create table if not exists public.fi_supplier_profile_reviews (
  supplier_id uuid primary key references public.fi_supplier_profiles(id) on delete cascade,
  status text not null default 'not_submitted' check (status in ('not_submitted', 'in_review', 'changes_requested', 'approved', 'rejected')),
  review_note text check (review_note is null or char_length(review_note) <= 4000),
  reviewed_by text check (reviewed_by is null or char_length(reviewed_by) <= 320),
  reviewed_at timestamptz not null default now()
);

create table if not exists public.fi_supplier_catalogue_items (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.fi_supplier_profiles(id) on delete cascade,
  product_name text not null check (char_length(trim(product_name)) between 1 and 200),
  product_code text check (product_code is null or char_length(trim(product_code)) <= 120),
  category text not null check (category in ('stairs', 'facade', 'metalwork', 'precast', 'joinery', 'other')),
  material text not null check (char_length(trim(material)) between 1 and 200),
  description text check (description is null or char_length(description) <= 5000),
  specifications text check (specifications is null or char_length(specifications) <= 5000),
  minimum_order_quantity integer check (minimum_order_quantity is null or minimum_order_quantity between 1 and 1000000),
  quantity_unit text check (quantity_unit is null or char_length(trim(quantity_unit)) <= 60),
  lead_time_days integer check (lead_time_days is null or lead_time_days between 1 and 730),
  export_markets text check (export_markets is null or char_length(export_markets) <= 1000),
  supplier_submission_state text not null default 'draft' check (supplier_submission_state in ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, supplier_id)
);

create table if not exists public.fi_supplier_catalogue_reviews (
  catalogue_item_id uuid primary key references public.fi_supplier_catalogue_items(id) on delete cascade,
  status text not null default 'not_submitted' check (status in ('not_submitted', 'in_review', 'changes_requested', 'approved', 'rejected')),
  review_note text check (review_note is null or char_length(review_note) <= 4000),
  reviewed_by text check (reviewed_by is null or char_length(reviewed_by) <= 320),
  reviewed_at timestamptz not null default now()
);

create table if not exists public.fi_supplier_catalogue_assets (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null,
  catalogue_item_id uuid not null,
  asset_type text not null check (asset_type in ('image', 'specification', 'certificate', 'catalogue')),
  storage_path text not null unique check (char_length(storage_path) between 1 and 700),
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text check (mime_type is null or char_length(mime_type) <= 120),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  foreign key (catalogue_item_id, supplier_id)
    references public.fi_supplier_catalogue_items(id, supplier_id) on delete cascade
);

create index if not exists fi_supplier_memberships_email_idx on public.fi_supplier_memberships (lower(email));
create index if not exists fi_supplier_catalogue_supplier_updated_idx on public.fi_supplier_catalogue_items (supplier_id, updated_at desc);
create index if not exists fi_supplier_catalogue_submission_idx on public.fi_supplier_catalogue_items (supplier_submission_state, updated_at desc);
create index if not exists fi_supplier_catalogue_assets_item_supplier_idx on public.fi_supplier_catalogue_assets (catalogue_item_id, supplier_id);

alter table public.fi_supplier_profiles enable row level security;
alter table public.fi_supplier_memberships enable row level security;
alter table public.fi_supplier_profile_reviews enable row level security;
alter table public.fi_supplier_catalogue_items enable row level security;
alter table public.fi_supplier_catalogue_reviews enable row level security;
alter table public.fi_supplier_catalogue_assets enable row level security;

revoke all on public.fi_supplier_profiles, public.fi_supplier_memberships, public.fi_supplier_profile_reviews,
  public.fi_supplier_catalogue_items, public.fi_supplier_catalogue_reviews, public.fi_supplier_catalogue_assets
  from anon, authenticated;
grant select, insert, update, delete on public.fi_supplier_profiles to authenticated;
grant select, insert, update on public.fi_supplier_memberships,
  public.fi_supplier_profile_reviews, public.fi_supplier_catalogue_items, public.fi_supplier_catalogue_reviews
  to authenticated;
grant select, insert, update, delete on public.fi_supplier_catalogue_assets to authenticated;

-- Supplier profiles
drop policy if exists "FI team manages supplier profiles" on public.fi_supplier_profiles;
create policy "FI team manages supplier profiles"
  on public.fi_supplier_profiles for all to authenticated
  using (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))))
  with check (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))));

drop policy if exists "Suppliers can view their own profiles" on public.fi_supplier_profiles;
create policy "Suppliers can view their own profiles"
  on public.fi_supplier_profiles for select to authenticated
  using (exists (select 1 from public.fi_supplier_memberships membership where membership.supplier_id = fi_supplier_profiles.id and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))));

drop policy if exists "Suppliers can update their own profiles" on public.fi_supplier_profiles;
create policy "Suppliers can update their own profiles"
  on public.fi_supplier_profiles for update to authenticated
  using (exists (select 1 from public.fi_supplier_memberships membership where membership.supplier_id = fi_supplier_profiles.id and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))))
  with check (exists (select 1 from public.fi_supplier_memberships membership where membership.supplier_id = fi_supplier_profiles.id and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))));

-- Memberships are created and changed by FI. Suppliers may only read their own row.
drop policy if exists "FI team manages supplier memberships" on public.fi_supplier_memberships;
create policy "FI team manages supplier memberships"
  on public.fi_supplier_memberships for all to authenticated
  using (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))))
  with check (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))));

drop policy if exists "Suppliers can view their own memberships" on public.fi_supplier_memberships;
create policy "Suppliers can view their own memberships"
  on public.fi_supplier_memberships for select to authenticated
  using (lower(email) = lower(((select auth.jwt()) ->> 'email')));

-- FI-only profile approval, readable by the related supplier.
drop policy if exists "FI team manages supplier profile reviews" on public.fi_supplier_profile_reviews;
create policy "FI team manages supplier profile reviews"
  on public.fi_supplier_profile_reviews for all to authenticated
  using (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))))
  with check (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))));

drop policy if exists "Suppliers can view their profile reviews" on public.fi_supplier_profile_reviews;
create policy "Suppliers can view their profile reviews"
  on public.fi_supplier_profile_reviews for select to authenticated
  using (exists (select 1 from public.fi_supplier_memberships membership where membership.supplier_id = fi_supplier_profile_reviews.supplier_id and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))));

-- Catalogue items are editable by their supplier. Approval remains in the separate review table.
drop policy if exists "FI team manages supplier catalogue items" on public.fi_supplier_catalogue_items;
create policy "FI team manages supplier catalogue items"
  on public.fi_supplier_catalogue_items for all to authenticated
  using (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))))
  with check (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))));

drop policy if exists "Suppliers can view their catalogue items" on public.fi_supplier_catalogue_items;
create policy "Suppliers can view their catalogue items"
  on public.fi_supplier_catalogue_items for select to authenticated
  using (exists (select 1 from public.fi_supplier_memberships membership where membership.supplier_id = fi_supplier_catalogue_items.supplier_id and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))));

drop policy if exists "Suppliers can add their catalogue items" on public.fi_supplier_catalogue_items;
create policy "Suppliers can add their catalogue items"
  on public.fi_supplier_catalogue_items for insert to authenticated
  with check (exists (select 1 from public.fi_supplier_memberships membership where membership.supplier_id = fi_supplier_catalogue_items.supplier_id and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))));

drop policy if exists "Suppliers can update their catalogue items" on public.fi_supplier_catalogue_items;
create policy "Suppliers can update their catalogue items"
  on public.fi_supplier_catalogue_items for update to authenticated
  using (exists (select 1 from public.fi_supplier_memberships membership where membership.supplier_id = fi_supplier_catalogue_items.supplier_id and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))))
  with check (exists (select 1 from public.fi_supplier_memberships membership where membership.supplier_id = fi_supplier_catalogue_items.supplier_id and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))));

drop policy if exists "FI team manages supplier catalogue reviews" on public.fi_supplier_catalogue_reviews;
create policy "FI team manages supplier catalogue reviews"
  on public.fi_supplier_catalogue_reviews for all to authenticated
  using (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))))
  with check (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))));

drop policy if exists "Suppliers can view their catalogue reviews" on public.fi_supplier_catalogue_reviews;
create policy "Suppliers can view their catalogue reviews"
  on public.fi_supplier_catalogue_reviews for select to authenticated
  using (exists (
    select 1 from public.fi_supplier_catalogue_items item
    join public.fi_supplier_memberships membership on membership.supplier_id = item.supplier_id
    where item.id = fi_supplier_catalogue_reviews.catalogue_item_id
      and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))
  ));

-- Asset records and object access follow the supplier UUID in the first storage folder.
drop policy if exists "FI team manages supplier catalogue assets" on public.fi_supplier_catalogue_assets;
create policy "FI team manages supplier catalogue assets"
  on public.fi_supplier_catalogue_assets for all to authenticated
  using (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))))
  with check (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))));

drop policy if exists "Suppliers can view their catalogue assets" on public.fi_supplier_catalogue_assets;
create policy "Suppliers can view their catalogue assets"
  on public.fi_supplier_catalogue_assets for select to authenticated
  using (exists (select 1 from public.fi_supplier_memberships membership where membership.supplier_id = fi_supplier_catalogue_assets.supplier_id and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))));

drop policy if exists "Suppliers can add their catalogue assets" on public.fi_supplier_catalogue_assets;
create policy "Suppliers can add their catalogue assets"
  on public.fi_supplier_catalogue_assets for insert to authenticated
  with check (exists (select 1 from public.fi_supplier_memberships membership where membership.supplier_id = fi_supplier_catalogue_assets.supplier_id and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))));

drop policy if exists "Suppliers can delete their catalogue assets" on public.fi_supplier_catalogue_assets;
create policy "Suppliers can delete their catalogue assets"
  on public.fi_supplier_catalogue_assets for delete to authenticated
  using (exists (select 1 from public.fi_supplier_memberships membership where membership.supplier_id = fi_supplier_catalogue_assets.supplier_id and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fi-supplier-assets', 'fi-supplier-assets', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Supplier members upload private assets" on storage.objects;
create policy "Supplier members upload private assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fi-supplier-assets'
    and exists (
      select 1 from public.fi_supplier_memberships membership
      where membership.supplier_id::text = (storage.foldername(name))[1]
        and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))
    )
  );

drop policy if exists "Supplier members read their private assets" on storage.objects;
create policy "Supplier members read their private assets"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'fi-supplier-assets'
    and exists (
      select 1 from public.fi_supplier_memberships membership
      where membership.supplier_id::text = (storage.foldername(name))[1]
        and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))
    )
  );

drop policy if exists "Supplier members delete their private assets" on storage.objects;
create policy "Supplier members delete their private assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'fi-supplier-assets'
    and exists (
      select 1 from public.fi_supplier_memberships membership
      where membership.supplier_id::text = (storage.foldername(name))[1]
        and lower(membership.email) = lower(((select auth.jwt()) ->> 'email'))
    )
  );

drop policy if exists "FI team reads supplier private assets" on storage.objects;
create policy "FI team reads supplier private assets"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'fi-supplier-assets'
    and exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email')))
  );
