-- Fabrication Intelligence Stage 2: requests, private drawings and team admin.
-- This migration is applied to the existing FI Supabase project.
-- Replace the seeded address with the verified FI team email before production use.

create table if not exists public.fi_team_members (
  email text primary key check (char_length(trim(email)) between 3 and 320),
  role text not null default 'team' check (role in ('team', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.fi_team_members enable row level security;
revoke all on public.fi_team_members from anon, authenticated;
grant select on public.fi_team_members to authenticated;

drop policy if exists "FI team members can read their own membership" on public.fi_team_members;
create policy "FI team members can read their own membership"
  on public.fi_team_members for select to authenticated
  using (lower(email) = lower(((select auth.jwt()) ->> 'email')));

insert into public.fi_team_members (email, role)
values ('kondeeplus01@gmail.com', 'admin')
on conflict (email) do update set role = excluded.role;

create table if not exists public.fi_quote_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^FI-[0-9]{8}-[A-Z0-9]{4,8}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'quoting', 'quotes_sent', 'won', 'lost')),
  requester_name text not null check (char_length(trim(requester_name)) between 1 and 160),
  requester_email text not null check (position('@' in requester_email) > 1 and char_length(requester_email) <= 320),
  company text check (company is null or char_length(company) <= 160),
  project_name text not null check (char_length(trim(project_name)) between 1 and 160),
  category text not null check (category in ('stairs', 'facade', 'metalwork', 'precast', 'joinery', 'other')),
  material text not null check (char_length(trim(material)) between 1 and 160),
  quantity integer not null check (quantity > 0 and quantity <= 1000000),
  dimensions text not null check (char_length(trim(dimensions)) between 1 and 500),
  finish text check (finish is null or char_length(finish) <= 240),
  delivery_date date not null,
  destination_port text not null check (destination_port in ('Melbourne', 'Sydney', 'Brisbane', 'Perth')),
  notes text check (notes is null or char_length(notes) <= 4000),
  drawing_path text check (drawing_path is null or drawing_path ~ '^[0-9a-f-]{36}/[^/]+$'),
  drawing_name text check (drawing_name is null or char_length(drawing_name) <= 255),
  drawing_size_bytes integer check (drawing_size_bytes is null or drawing_size_bytes between 1 and 10485760),
  drawing_type text check (drawing_type is null or char_length(drawing_type) <= 120)
);

alter table public.fi_quote_requests enable row level security;
revoke all on public.fi_quote_requests from anon, authenticated;
grant insert on public.fi_quote_requests to anon, authenticated;
grant select, update on public.fi_quote_requests to authenticated;

create index if not exists fi_quote_requests_status_created_idx on public.fi_quote_requests (status, created_at desc);
create index if not exists fi_quote_requests_created_idx on public.fi_quote_requests (created_at desc);

drop policy if exists "Anyone can submit FI quote requests" on public.fi_quote_requests;
create policy "Anyone can submit FI quote requests"
  on public.fi_quote_requests for insert to anon, authenticated with check (true);

drop policy if exists "FI team can read quote requests" on public.fi_quote_requests;
create policy "FI team can read quote requests"
  on public.fi_quote_requests for select to authenticated
  using (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))));

drop policy if exists "FI team can update quote requests" on public.fi_quote_requests;
create policy "FI team can update quote requests"
  on public.fi_quote_requests for update to authenticated
  using (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))))
  with check (exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fi-drawings', 'fi-drawings', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can upload FI drawings" on storage.objects;
create policy "Anyone can upload FI drawings"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'fi-drawings' and name ~ '^[0-9a-f-]{36}/[^/]+$');

drop policy if exists "FI team can read drawings" on storage.objects;
create policy "FI team can read drawings"
  on storage.objects for select to authenticated
  using (bucket_id = 'fi-drawings' and exists (select 1 from public.fi_team_members member where lower(member.email) = lower(((select auth.jwt()) ->> 'email'))));
