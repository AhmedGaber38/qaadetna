-- Existing-project upgrade. Apply 001 first. No accounts/gatherings/orders are deleted.
-- Run as database owner. The complete migration rolls back on any incompatible schema.
begin;

do $$
declare v_table text; v_column text;
begin
  foreach v_table in array array['profiles','orders','menu_items','gatherings','order_batch_receipts'] loop
    if to_regclass('public.'||v_table) is null then raise exception 'Missing table public.%. Apply existing schema and migration 001 first.',v_table; end if;
  end loop;
  foreach v_column in array array['id','user_id','gathering_id','item_name_snapshot','unit_price_snapshot','quantity','total_price','created_at'] loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name=v_column) then
      raise exception 'Missing orders column %. Migration stopped without changes.',v_column;
    end if;
  end loop;
  if exists(select 1 from information_schema.columns where table_schema='public' and (table_name,column_name) in (('orders','created_at'),('gatherings','started_at'),('gatherings','closed_at')) and data_type<>'timestamp with time zone') then
    raise exception 'Expected timestamptz dates. Resolve legacy timezone explicitly before this upgrade.';
  end if;
  if (select count(*) from public.gatherings where status='active')>1 then
    raise exception 'More than one active gathering. Resolve explicitly before upgrading; no gathering was closed automatically.';
  end if;
end $$;

alter table public.orders
  add column if not exists delivery_status text,
  add column if not exists received_at timestamptz,
  add column if not exists next_reminder_at timestamptz,
  add column if not exists reminder_claim_token uuid,
  add column if not exists reminder_lease_until timestamptz;
-- Only pre-upgrade/NULL statuses are backfilled. Re-running never confirms new orders.
update public.orders set delivery_status='received',received_at=coalesce(received_at,created_at)
  where delivery_status is null;
alter table public.orders alter column delivery_status set default 'pending';
alter table public.orders alter column delivery_status set not null;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='qa_order_delivery_status') then
    alter table public.orders add constraint qa_order_delivery_status check(delivery_status in ('pending','received'));
  end if;
end $$;
create index if not exists qa_orders_member_gathering on public.orders(user_id,gathering_id,created_at desc);
create index if not exists qa_orders_due on public.orders(user_id,next_reminder_at) where delivery_status='pending';
create unique index if not exists qa_one_active_gathering on public.gatherings(status) where status='active';

create or replace function public.qa_is_approved() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and status='approved');
$$;
create or replace function public.qa_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='approved');
$$;
revoke all on function public.qa_is_admin(),public.qa_is_approved() from public,anon;
grant execute on function public.qa_is_admin(),public.qa_is_approved() to authenticated;

-- Preserve original policy definitions before replacing access rules. A rerun does
-- not overwrite the pre-upgrade snapshot. No browser role can read this schema.
create schema if not exists qa_backup;
revoke all on schema qa_backup from public,anon,authenticated;
create table if not exists qa_backup.policy_snapshots(
  migration text not null, table_name text not null, policy_name text not null,
  captured_at timestamptz not null default now(), definition jsonb not null,
  primary key(migration,table_name,policy_name)
);
revoke all on qa_backup.policy_snapshots from public,anon,authenticated;
insert into qa_backup.policy_snapshots(migration,table_name,policy_name,definition)
select '202611060002',tablename,policyname,to_jsonb(p) from pg_policies p
where schemaname='public' and tablename in ('profiles','orders','menu_items','gatherings')
  and policyname not like 'qa\_%' escape '\'
on conflict do nothing;

-- Replace policies on the four app tables: old permissive policies would otherwise OR
-- with the new policies. This changes access rules, not application data.
do $$ declare r record; t text; begin
  for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('profiles','orders','menu_items','gatherings') loop
    execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop;
  foreach t in array array['profiles','orders','menu_items','gatherings'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    -- Remove legacy column grants as well as table grants (role escalation bypass).
    for r in select column_name from information_schema.columns where table_schema='public' and table_name=t loop
      execute format('revoke insert(%I),update(%I),references(%I) on public.%I from anon,authenticated',r.column_name,r.column_name,r.column_name,t);
    end loop;
  end loop;
end $$;
create policy qa_profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.qa_is_admin());
create policy qa_orders_read on public.orders for select to authenticated using(public.qa_is_approved() and (user_id=auth.uid() or public.qa_is_admin()));
create policy qa_menu_read on public.menu_items for select to authenticated using(public.qa_is_approved());
create policy qa_menu_admin on public.menu_items for all to authenticated using(public.qa_is_admin()) with check(public.qa_is_admin());
grant insert,update,delete on public.menu_items to authenticated;
create policy qa_gatherings_read on public.gatherings for select to authenticated using(public.qa_is_approved());

create table if not exists public.admin_order_notifications(
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  member_name text not null,
  item_name text not null,
  quantity integer not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(admin_id,order_id)
);
alter table public.admin_order_notifications enable row level security;
revoke all on public.admin_order_notifications from anon,authenticated;
grant select on public.admin_order_notifications to authenticated;
drop policy if exists qa_notifications_read on public.admin_order_notifications;
create policy qa_notifications_read on public.admin_order_notifications for select to authenticated
using(admin_id=auth.uid() and public.qa_is_admin());
create index if not exists qa_unread_notifications on public.admin_order_notifications(admin_id,created_at desc) where read_at is null;

create or replace function public.qa_order_defaults() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.delivery_status:='pending'; new.received_at:=null;
    new.created_at:=clock_timestamp();
    new.next_reminder_at:=new.created_at+interval '15 minutes';
    new.reminder_claim_token:=null; new.reminder_lease_until:=null;
  end if;
  -- Support both stored-generated and ordinary total_price in the existing schema.
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='total_price' and is_generated='NEVER') then
    new.total_price:=new.unit_price_snapshot*new.quantity;
  end if;
  return new;
end $$;
drop trigger if exists qa_order_defaults_trigger on public.orders;
create trigger qa_order_defaults_trigger before insert or update on public.orders for each row execute function public.qa_order_defaults();

create or replace function public.qa_notify_order() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.admin_order_notifications(admin_id,order_id,member_name,item_name,quantity)
  select p.id,new.id,coalesce((select full_name from public.profiles where id=new.user_id),'عضو'),new.item_name_snapshot,new.quantity
  from public.profiles p where p.role='admin' and p.status='approved'
  on conflict(admin_id,order_id) do nothing;
  return new;
end $$;
drop trigger if exists qa_notify_order_trigger on public.orders;
create trigger qa_notify_order_trigger after insert on public.orders for each row execute function public.qa_notify_order();

create or replace function public.qa_submit_order_batch(p_gathering uuid,p_items jsonb,p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_line jsonb; v_item public.menu_items%rowtype;
  v_id uuid; v_qty numeric; v_inserted uuid; v_existing public.order_batch_receipts%rowtype;
  v_fk text; v_columns text; v_values text; v_stmt text;
begin
  if not public.qa_is_approved() then raise exception 'Approved membership required' using errcode='42501'; end if;
  -- Share lock prevents suspension/deletion while this request is being placed.
  perform 1 from public.profiles where id=v_user and status='approved' for share;
  if not found then raise exception 'Approved membership required' using errcode='42501'; end if;
  if p_request_id is null or p_gathering is null or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Invalid cart'; end if;
  if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then raise exception 'Invalid cart size'; end if;
  if (select count(distinct x->>'item_id') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then raise exception 'Duplicate or missing items'; end if;
  insert into public.order_batch_receipts(user_id,request_id,gathering_id,items)
    values(v_user,p_request_id,p_gathering,p_items) on conflict do nothing returning request_id into v_inserted;
  if v_inserted is null then
    select * into strict v_existing from public.order_batch_receipts where user_id=v_user and request_id=p_request_id;
    if v_existing.gathering_id<>p_gathering or v_existing.items<>p_items then raise exception 'Request ID already used with a different cart'; end if;
    return;
  end if;
  perform 1 from public.gatherings where id=p_gathering and status='active' for share;
  if not found then raise exception 'Gathering is closed'; end if;
  -- The old RPC definitions were absent from the repository. Insert from server
  -- snapshots directly, supporting either common name for the optional item FK.
  select column_name into v_fk from information_schema.columns where table_schema='public' and table_name='orders' and column_name in ('item_id','menu_item_id') order by column_name limit 1;
  v_columns:='user_id,gathering_id,item_name_snapshot,unit_price_snapshot,quantity';
  v_values:='$1,$2,$3,$4,$5';
  if v_fk is not null then v_columns:=v_columns||','||quote_ident(v_fk);v_values:=v_values||',$6';end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='total_price' and is_generated='NEVER') then
    v_columns:=v_columns||',total_price';v_values:=v_values||',$4*$5';
  end if;
  v_stmt:='insert into public.orders('||v_columns||') values('||v_values||')';
  -- Stable ordering avoids cross-cart lock ordering problems.
  for v_line in select value from jsonb_array_elements(p_items) order by value->>'item_id' loop
    v_id:=(v_line->>'item_id')::uuid;
    if jsonb_typeof(v_line->'quantity') is distinct from 'number' then raise exception 'Quantity must be numeric'; end if;
    v_qty:=(v_line->>'quantity')::numeric;
    if v_qty is null or v_qty<>trunc(v_qty) or v_qty<1 or v_qty>50 then raise exception 'Invalid quantity'; end if;
    select * into v_item from public.menu_items where id=v_id and is_active=true and is_archived=false for share;
    if not found or v_item.price is null or v_item.price<0 or v_item.price::text in ('NaN','Infinity','-Infinity') then raise exception 'Menu item unavailable'; end if;
    execute v_stmt using v_user,p_gathering,v_item.name,v_item.price,v_qty::integer,v_id;
  end loop;
end $$;

create or replace function public.qa_confirm_order(p_order uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.qa_is_approved() then raise exception 'Approved membership required' using errcode='42501'; end if;
  -- Admin confirms only their OWN receipt here. Management is a separate capability.
  perform 1 from public.orders where id=p_order and user_id=auth.uid() for update;
  if not found then raise exception 'Order not found' using errcode='42501'; end if;
  update public.orders set delivery_status='received',received_at=clock_timestamp(),next_reminder_at=null,reminder_claim_token=null,reminder_lease_until=null
    where id=p_order and user_id=auth.uid() and delivery_status='pending';
end $$;

create or replace function public.qa_claim_reminder()
returns table(order_id uuid,item_name text,quantity integer,claim_token uuid)
language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_token uuid:=gen_random_uuid();
begin
  if not public.qa_is_approved() then raise exception 'Approved membership required' using errcode='42501'; end if;
  select * into v_order from public.orders where user_id=auth.uid() and delivery_status='pending'
    and next_reminder_at<=clock_timestamp() and (reminder_lease_until is null or reminder_lease_until<clock_timestamp())
    order by next_reminder_at,id limit 1 for update skip locked;
  if not found then return; end if;
  update public.orders set reminder_claim_token=v_token,reminder_lease_until=clock_timestamp()+interval '90 seconds',next_reminder_at=clock_timestamp()+interval '15 minutes' where id=v_order.id;
  return query select v_order.id,v_order.item_name_snapshot,v_order.quantity,v_token;
end $$;
create or replace function public.qa_renew_reminder(p_order uuid,p_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not public.qa_is_approved() then return false;end if;
  update public.orders set reminder_lease_until=clock_timestamp()+interval '90 seconds'
    where id=p_order and user_id=auth.uid() and delivery_status='pending' and reminder_claim_token=p_token and reminder_lease_until>clock_timestamp();
  return found;
end $$;
create or replace function public.qa_snooze_order(p_order uuid,p_token uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.qa_is_approved() then raise exception 'Approved membership required' using errcode='42501';end if;
  update public.orders set next_reminder_at=clock_timestamp()+interval '15 minutes',reminder_claim_token=null,reminder_lease_until=null
    where id=p_order and user_id=auth.uid() and delivery_status='pending' and reminder_claim_token=p_token;
  if not found then raise exception 'Reminder expired';end if;
end $$;

create or replace function public.qa_read_notifications(p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501';end if;
  update public.admin_order_notifications set read_at=coalesce(read_at,clock_timestamp()) where admin_id=auth.uid() and id=any(p_ids);
end $$;
create or replace function public.qa_admin_update_profile(p_user uuid,p_name text default null,p_status text default null) returns void
language plpgsql security definer set search_path='' as $$
declare v_target public.profiles%rowtype;
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501';end if;
  select * into strict v_target from public.profiles where id=p_user for update;
  if p_name is not null and (length(trim(p_name))<1 or length(trim(p_name))>120) then raise exception 'Invalid display name';end if;
  if p_status is not null and (v_target.role='admin' or p_status not in ('pending','approved','rejected','suspended')) then raise exception 'Invalid status change';end if;
  update public.profiles set full_name=coalesce(trim(p_name),full_name),status=(jsonb_populate_record(null::public.profiles,jsonb_build_object('status',coalesce(p_status,v_target.status::text)))).status where id=p_user;
end $$;
create or replace function public.qa_admin_update_order(p_order uuid,p_qty integer,p_price numeric) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501';end if;
  if p_qty is null or p_qty<1 or p_qty>50 or p_price is null or p_price<0 or p_price::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid quantity or price';end if;
  update public.orders set quantity=p_qty,unit_price_snapshot=p_price where id=p_order;
  if not found then raise exception 'Order not found';end if;
end $$;
create or replace function public.qa_admin_delete_order(p_order uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501';end if;
  delete from public.orders where id=p_order;
  if not found then raise exception 'Order not found';end if;
end $$;
create or replace function public.qa_start_gathering(p_title text default '') returns public.gatherings
language plpgsql security definer set search_path='' as $$
declare v_g public.gatherings;
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501';end if;
  perform pg_advisory_xact_lock(71624901);
  if exists(select 1 from public.gatherings where status='active') then raise exception 'Gathering already active';end if;
  if length(p_title)>120 then raise exception 'Title too long';end if;
  insert into public.gatherings(title,status,started_at) values(coalesce(nullif(trim(p_title),''),'قعدة '||to_char(clock_timestamp() at time zone 'Africa/Cairo','YYYY-MM-DD HH24:MI')),'active',clock_timestamp()) returning * into v_g;
  return v_g;
end $$;
create or replace function public.qa_close_gathering() returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501';end if;
  perform pg_advisory_xact_lock(71624901);
  update public.gatherings set status='closed',closed_at=clock_timestamp() where status='active';
end $$;
create or replace function public.qa_delete_or_archive_item(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501';end if;
  -- Archiving is consistent even when legacy orders have no item FK.
  update public.menu_items set is_archived=true,is_active=false where id=p_id;
  if not found then raise exception 'Item not found';end if;
end $$;

-- Supabase Auth Admin API performs its DELETE inside a transaction. Clean dependent
-- app rows in that same transaction, so failed Auth deletion cannot half-delete data.
create or replace function public.qa_cleanup_auth_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from public.admin_order_notifications where admin_id=old.id or order_id in (select id from public.orders where user_id=old.id);
  delete from public.orders where user_id=old.id;
  delete from public.order_batch_receipts where user_id=old.id;
  delete from public.profiles where id=old.id;
  return old;
end $$;
drop trigger if exists qa_cleanup_auth_user_trigger on auth.users;
create trigger qa_cleanup_auth_user_trigger before delete on auth.users for each row execute function public.qa_cleanup_auth_user();

-- Never expose trigger functions or superseded mutating RPCs as browser APIs.
do $$ declare r record; begin
  for r in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'qa\_%' escape '\' or p.proname in ('add_order','add_orders','start_gathering','close_gathering','delete_or_archive_item')) loop
    execute format('revoke all on function %s from public,anon,authenticated',r.signature);
    if r.proname not in ('qa_order_defaults','qa_notify_order','qa_cleanup_auth_user') and r.proname like 'qa\_%' escape '\' then
      execute format('grant execute on function %s to authenticated',r.signature);
    end if;
  end loop;
end $$;

-- Enable notifications/updates for this schema where the Supabase publication exists.
do $$ declare t text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['orders','profiles','gatherings','menu_items','admin_order_notifications'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;
commit;
