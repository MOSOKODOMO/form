-- Integration checks against the deployed FI schema. All fixtures are rolled back.
begin;
select set_config('fi_test.client_id', gen_random_uuid()::text, true);
select set_config('fi_test.manufacturer_id', gen_random_uuid()::text, true);
insert into auth.users (id, email, raw_user_meta_data) values
  (current_setting('fi_test.client_id')::uuid, 'fi-qa-client@example.invalid', '{"role":"client","full_name":"QA client"}'),
  (current_setting('fi_test.manufacturer_id')::uuid, 'fi-qa-manufacturer@example.invalid', '{"role":"manufacturer","company_name":"QA maker"}');

do $$ begin
  if (select count(*) from public.fi_user_profiles where user_id in
    (current_setting('fi_test.client_id')::uuid, current_setting('fi_test.manufacturer_id')::uuid)) <> 2
  then raise exception 'Profile trigger did not create both profiles'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('fi_test.client_id'), 'role', 'authenticated', 'email', 'fi-qa-client@example.invalid')::text, true);

insert into public.fi_quote_requests (reference, requester_name, requester_email, project_name, category, material, quantity, dimensions, delivery_date, destination_port, requester_user_id)
values ('FI-20991231-QATEST', 'QA client', 'fi-qa-client@example.invalid', 'QA ownership test', 'metalwork', 'Steel', 1, '1 m', '2099-12-31', 'Melbourne', current_setting('fi_test.client_id')::uuid);

do $$ begin
  if (select count(*) from public.fi_user_profiles) <> 1 then raise exception 'Client can see another profile'; end if;
  if (select count(*) from public.fi_quote_requests where reference = 'FI-20991231-QATEST') <> 1 then raise exception 'Client cannot read own request'; end if;
  begin
    insert into public.fi_quote_requests (reference, requester_name, requester_email, project_name, category, material, quantity, dimensions, delivery_date, destination_port, requester_user_id)
    values ('FI-20991231-QAFORG', 'QA', 'qa@example.invalid', 'Forged ownership', 'metalwork', 'Steel', 1, '1 m', '2099-12-31', 'Melbourne', current_setting('fi_test.manufacturer_id')::uuid);
    raise exception 'Client was allowed to forge another owner';
  exception when insufficient_privilege then null; end;
  update public.fi_quote_requests set status='won' where reference='FI-20991231-QATEST';
  if found then raise exception 'Client was allowed to change team status'; end if;
end $$;

select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('fi_test.manufacturer_id'), 'role', 'authenticated', 'email', 'fi-qa-manufacturer@example.invalid')::text, true);
insert into public.fi_manufacturer_applications (user_id, company_name)
values (current_setting('fi_test.manufacturer_id')::uuid, 'QA maker');

do $$ begin
  if exists (select 1 from public.fi_quote_requests where reference = 'FI-20991231-QATEST') then raise exception 'Manufacturer can read another client request'; end if;
  begin
    update public.fi_manufacturer_applications set submitted_at=now() where user_id=current_setting('fi_test.manufacturer_id')::uuid;
    raise exception 'An incomplete application was submitted';
  exception when check_violation then null; end;
  begin
    insert into public.fi_manufacturer_application_reviews (manufacturer_user_id, status)
    values (current_setting('fi_test.manufacturer_id')::uuid, 'approved');
    raise exception 'Manufacturer could approve itself';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.fi_supplier_profiles (legal_name) values ('Unauthorized supplier');
    raise exception 'Manufacturer could create approved workspace access';
  exception when insufficient_privilege then null; end;
end $$;
update public.fi_manufacturer_applications set country='Australia', product_categories='Metalwork', capabilities='Fabrication', submitted_at=now()
where user_id=current_setting('fi_test.manufacturer_id')::uuid;

select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('fi_test.client_id'), 'role', 'authenticated', 'email', 'fi-qa-client@example.invalid')::text, true);
do $$ begin
  if exists (select 1 from public.fi_manufacturer_applications) then raise exception 'Client can read a manufacturer application'; end if;
  update public.fi_user_profiles set full_name='Unwanted edit' where user_id=current_setting('fi_test.manufacturer_id')::uuid;
  if found then raise exception 'Client can edit another profile'; end if;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin
    perform 1 from public.fi_user_profiles;
    raise exception 'Anonymous visitor can read profiles';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.fi_quote_requests;
    raise exception 'Anonymous visitor can read requests';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: profile creation, own requests, cross-account isolation, draft/submission validation, no self-approval, anonymous denial; fixtures rolled back' as result;
