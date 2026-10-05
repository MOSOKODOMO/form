-- Account profile permissions and customer-visible payment history.
-- Filename matches the version recorded by the production migration service.
-- This is a read model, NOT a payable quote, checkout API, or payout ledger.
-- No payment rows are seeded and no live charge is enabled by this migration.

revoke update on public.fi_user_profiles from authenticated;
grant update (full_name, company_name, updated_at)
  on public.fi_user_profiles to authenticated;

create table public.fi_account_payments (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references auth.users(id) on delete restrict,
  description text not null check (char_length(trim(description)) between 1 and 300),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 99999999),
  currency text not null default 'aud' check (currency = 'aud'),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'processing', 'paid', 'failed', 'refunded', 'cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint fi_account_payments_paid_at_required
    check (status not in ('paid', 'refunded') or paid_at is not null)
);

comment on table public.fi_account_payments is
  'Customer-visible payment history only. Populate from a verified server-side payment ledger; never from redirects, client amounts, or editable product sheets. Live checkout is not enabled.';

create index fi_account_payments_customer_created_idx
  on public.fi_account_payments (customer_user_id, created_at desc);

alter table public.fi_account_payments enable row level security;
revoke all on public.fi_account_payments from public, anon, authenticated, service_role;
grant select on public.fi_account_payments to authenticated;
grant select, insert, update on public.fi_account_payments to service_role;

create policy "Customers read their own payment history"
  on public.fi_account_payments for select to authenticated
  using (customer_user_id = (select auth.uid()));
