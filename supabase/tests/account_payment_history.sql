-- Transaction-scoped fixtures: no emails, permanent users, or payment records.
-- Run against a database containing fi-accounts.sql and the account payment migration.
begin;
insert into auth.users (id, raw_user_meta_data)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '{"full_name":"Account test A"}'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '{"full_name":"Account test B"}');

insert into public.fi_account_payments (customer_user_id, description, amount_minor)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Transaction-only fixture A', 100),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Transaction-only fixture B', 200);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
do $$
begin
  if (select count(*) from public.fi_user_profiles) <> 1 then
    raise exception 'Profile isolation failed';
  end if;
  if (select count(*) from public.fi_account_payments) <> 1 then
    raise exception 'Payment history isolation failed';
  end if;
  if exists (select 1 from public.fi_account_payments where amount_minor = 200) then
    raise exception 'Cross-account payment leaked';
  end if;

  update public.fi_user_profiles set full_name = 'Updated test name'
    where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if not exists (select 1 from public.fi_user_profiles where full_name = 'Updated test name') then
    raise exception 'Owner could not edit name';
  end if;

  begin
    update public.fi_user_profiles set role = 'manufacturer';
    raise exception 'Profile role was writable';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.fi_account_payments set status = 'paid', paid_at = now();
    raise exception 'Customer could forge payment status';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.fi_account_payments (customer_user_id, description, amount_minor)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'Forged record', 100);
    raise exception 'Customer could create payment history';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role anon;
do $$
begin
  begin
    perform 1 from public.fi_account_payments;
    raise exception 'Anonymous payment access allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
