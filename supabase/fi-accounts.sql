-- Fabrication Intelligence client and manufacturer accounts.
-- Apply after supabase/fi-stage2.sql. The manufacturer application is deliberately
-- separate from the approved supplier workspace: self-sign-up never grants approval.
--
-- If this project uses explicit Data API exposure, expose the three new public
-- tables after running this script. Grants and RLS are defined below.

create table if not exists public.fi_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('client', 'manufacturer')),
  full_name text check (full_name is null or char_length(trim(full_name)) between 1 and 160),
  company_name text check (company_name is null or char_length(trim(company_name)) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fi_manufacturer_applications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_name text check (company_name is null or char_length(trim(company_name)) between 1 and 200),
  country text check (country is null or char_length(trim(country)) between 2 and 100),
  website text check (website is null or char_length(trim(website)) <= 500),
  product_categories text check (product_categories is null or char_length(trim(product_categories)) between 1 and 1200),
  capabilities text check (capabilities is null or char_length(trim(capabilities)) between 1 and 5000),
  certifications text check (certifications is null or char_length(certifications) <= 4000),
  notes text check (notes is null or char_length(notes) <= 4000),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Drafts may be incomplete. A submitted application must include its core fields.
alter table public.fi_manufacturer_applications alter column company_name drop not null;
alter table public.fi_manufacturer_applications alter column country drop not null;
alter table public.fi_manufacturer_applications alter column product_categories drop not null;
alter table public.fi_manufacturer_applications alter column capabilities drop not null;
alter table public.fi_manufacturer_applications drop constraint if exists fi_manufacturer_submission_complete;
alter table public.fi_manufacturer_applications add constraint fi_manufacturer_submission_complete
  check (submitted_at is null or (company_name is not null and country is not null
    and product_categories is not null and capabilities is not null));

-- FI controls review state in a separate table so an applicant cannot approve itself.
create table if not exists public.fi_manufacturer_application_reviews (
  manufacturer_user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'in_review', 'changes_requested', 'approved', 'rejected')),
  review_note text check (review_note is null or char_length(review_note) <= 4000),
  reviewed_by text check (reviewed_by is null or char_length(reviewed_by) <= 320),
  reviewed_at timestamptz not null default now()
);

-- Link new signed-in requests to their client. Existing anonymous requests remain valid.
alter table public.fi_quote_requests add column if not exists requester_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fi_quote_requests_requester_user_id_fkey'
      and conrelid = 'public.fi_quote_requests'::regclass
  ) then
    alter table public.fi_quote_requests
      add constraint fi_quote_requests_requester_user_id_fkey
      foreign key (requester_user_id) references auth.users(id) on delete set null;
  end if;
end $$;

create index if not exists fi_quote_requests_requester_created_idx
  on public.fi_quote_requests (requester_user_id, created_at desc)
  where requester_user_id is not null;

alter table public.fi_user_profiles enable row level security;
alter table public.fi_manufacturer_applications enable row level security;
alter table public.fi_manufacturer_application_reviews enable row level security;

revoke all on public.fi_user_profiles, public.fi_manufacturer_applications,
  public.fi_manufacturer_application_reviews from anon, authenticated;
grant select, insert, update on public.fi_user_profiles to authenticated;
grant select, insert, update on public.fi_manufacturer_applications to authenticated;
grant select, insert, update on public.fi_manufacturer_application_reviews to authenticated;

drop policy if exists "Account owners read their profile" on public.fi_user_profiles;
create policy "Account owners read their profile"
  on public.fi_user_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Account owners create their profile" on public.fi_user_profiles;
create policy "Account owners create their profile"
  on public.fi_user_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Account owners update their profile" on public.fi_user_profiles;
create policy "Account owners update their profile"
  on public.fi_user_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Manufacturers read their application" on public.fi_manufacturer_applications;
create policy "Manufacturers read their application"
  on public.fi_manufacturer_applications for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Manufacturers create their application" on public.fi_manufacturer_applications;
create policy "Manufacturers create their application"
  on public.fi_manufacturer_applications for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Manufacturers update their application" on public.fi_manufacturer_applications;
create policy "Manufacturers update their application"
  on public.fi_manufacturer_applications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "FI team reads manufacturer applications" on public.fi_manufacturer_applications;
create policy "FI team reads manufacturer applications"
  on public.fi_manufacturer_applications for select to authenticated
  using (exists (
    select 1 from public.fi_team_members member
    where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))
  ));

drop policy if exists "FI team updates manufacturer applications" on public.fi_manufacturer_applications;
create policy "FI team updates manufacturer applications"
  on public.fi_manufacturer_applications for update to authenticated
  using (exists (
    select 1 from public.fi_team_members member
    where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))
  ))
  with check (exists (
    select 1 from public.fi_team_members member
    where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))
  ));

drop policy if exists "Manufacturers read their review" on public.fi_manufacturer_application_reviews;
create policy "Manufacturers read their review"
  on public.fi_manufacturer_application_reviews for select to authenticated
  using ((select auth.uid()) = manufacturer_user_id);

drop policy if exists "FI team reads manufacturer reviews" on public.fi_manufacturer_application_reviews;
create policy "FI team reads manufacturer reviews"
  on public.fi_manufacturer_application_reviews for select to authenticated
  using (exists (
    select 1 from public.fi_team_members member
    where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))
  ));

drop policy if exists "FI team creates manufacturer reviews" on public.fi_manufacturer_application_reviews;
create policy "FI team creates manufacturer reviews"
  on public.fi_manufacturer_application_reviews for insert to authenticated
  with check (exists (
    select 1 from public.fi_team_members member
    where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))
  ));

drop policy if exists "FI team updates manufacturer reviews" on public.fi_manufacturer_application_reviews;
create policy "FI team updates manufacturer reviews"
  on public.fi_manufacturer_application_reviews for update to authenticated
  using (exists (
    select 1 from public.fi_team_members member
    where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))
  ))
  with check (exists (
    select 1 from public.fi_team_members member
    where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))
  ));

drop policy if exists "Anyone can submit FI quote requests" on public.fi_quote_requests;
drop policy if exists "Visitors can submit FI quote requests" on public.fi_quote_requests;
create policy "Visitors can submit FI quote requests"
  on public.fi_quote_requests for insert to anon
  with check (requester_user_id is null and status = 'new');

drop policy if exists "Signed-in users can submit their own FI quote requests" on public.fi_quote_requests;
create policy "Signed-in users can submit their own FI quote requests"
  on public.fi_quote_requests for insert to authenticated
  with check ((requester_user_id is null or requester_user_id = (select auth.uid())) and status = 'new');

drop policy if exists "Clients can read their own quote requests" on public.fi_quote_requests;
create policy "Clients can read their own quote requests"
  on public.fi_quote_requests for select to authenticated
  using (requester_user_id = (select auth.uid()));

-- Create a non-privileged profile after sign-up. Metadata is used only to initialise
-- display fields; RLS authorization always uses auth.uid() and database ownership.
create schema if not exists fi_private;
revoke all on schema fi_private from public, anon, authenticated;

create or replace function fi_private.fi_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
begin
  requested_role := case
    when new.raw_user_meta_data ->> 'role' in ('client', 'manufacturer')
      then new.raw_user_meta_data ->> 'role'
    else 'client'
  end;

  insert into public.fi_user_profiles (user_id, role, full_name, company_name)
  values (
    new.id,
    requested_role,
    nullif(left(trim(new.raw_user_meta_data ->> 'full_name'), 160), ''),
    nullif(left(trim(new.raw_user_meta_data ->> 'company_name'), 200), '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function fi_private.fi_handle_new_user() from public, anon, authenticated;

drop trigger if exists fi_on_auth_user_created on auth.users;
create trigger fi_on_auth_user_created
  after insert on auth.users
  for each row execute function fi_private.fi_handle_new_user();

-- Give existing Auth users a basic profile without changing their current access.
insert into public.fi_user_profiles (user_id, role, full_name, company_name)
select
  id,
  case when raw_user_meta_data ->> 'role' = 'manufacturer' then 'manufacturer' else 'client' end,
  nullif(left(trim(raw_user_meta_data ->> 'full_name'), 160), ''),
  nullif(left(trim(raw_user_meta_data ->> 'company_name'), 200), '')
from auth.users
on conflict (user_id) do nothing;
