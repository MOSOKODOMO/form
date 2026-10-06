begin;
-- Consolidate only this feature's policies; preserve unrelated existing policies.
drop policy "FI team reads" on public.fi_shop_categories;
drop policy "FI team reads" on public.fi_shop_products;
drop policy "Published products" on public.fi_shop_products;
create policy "Published products" on public.fi_shop_products for select to anon using(status='published');
create policy "Visible products" on public.fi_shop_products for select to authenticated using(status='published' or exists(select 1 from public.fi_team_members m where lower(m.email)=lower((select auth.jwt())->>'email')));
drop policy "FI team reads" on public.fi_shop_orders;
drop policy "Owner orders" on public.fi_shop_orders;
create policy "Owner or FI orders" on public.fi_shop_orders for select to authenticated using(user_id=(select auth.uid()) or exists(select 1 from public.fi_team_members m where lower(m.email)=lower((select auth.jwt())->>'email')));
drop policy "FI team reads" on public.fi_shop_order_items;
drop policy "Owner order items" on public.fi_shop_order_items;
create policy "Visible order items" on public.fi_shop_order_items for select to authenticated using(exists(select 1 from public.fi_shop_orders o where o.id=order_id));
drop policy "FI team reads" on public.fi_shop_payments;
drop policy "Owner payments" on public.fi_shop_payments;
create policy "Visible payments" on public.fi_shop_payments for select to authenticated using(exists(select 1 from public.fi_shop_orders o where o.id=order_id));
drop policy "FI team reads" on public.fi_order_shipments;
drop policy "Owner outbound shipment" on public.fi_order_shipments;
create policy "Visible shipments" on public.fi_order_shipments for select to authenticated using(
  (leg='warehouse_to_customer' and exists(select 1 from public.fi_shop_orders o where o.id=order_id and o.user_id=(select auth.uid())))
  or exists(select 1 from public.fi_team_members m where lower(m.email)=lower((select auth.jwt())->>'email')));

create function public.fi_commerce_record_return(p_order uuid,p_actor uuid,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.fi_shop_orders where id=p_order for update;
  if not found then raise exception 'Order not found'; end if;
  insert into public.fi_order_returns(order_id,reason,created_by) values(p_order,p_reason,p_actor);
  update public.fi_shop_orders set fulfillment_hold=true,updated_at=now() where id=p_order;
  insert into public.fi_commerce_audit(actor_user_id,action,entity_id) values(p_actor,'return_requested',p_order);
end $$;
revoke all on function public.fi_commerce_record_return(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fi_commerce_record_return(uuid,uuid,text) to service_role;
commit;
