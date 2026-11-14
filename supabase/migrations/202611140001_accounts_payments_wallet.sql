-- Qaadetna 003: per-member accounts, full-payment-only settlement, group wallet ledger, custody.
-- Requires migrations 001 and 002. Safe to re-run. Does not delete or rewrite any existing money data.
begin;

do $$ begin
  if to_regclass('public.orders') is null or to_regprocedure('public.qa_order_defaults()') is null then
    raise exception 'Apply migrations 001 and 002 first. Nothing was changed.';
  end if;
end $$;

-- ---------------------------------------------------------------- accounts
create table if not exists public.member_accounts(
  id uuid primary key default gen_random_uuid(),
  gathering_id uuid not null references public.gatherings(id),
  user_id uuid not null,
  seq integer not null check(seq>=1),
  status text not null default 'open' check(status in ('open','pending','paid')),
  opened_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  unique(gathering_id,user_id,seq)
);
create unique index if not exists qa_one_unpaid_account on public.member_accounts(gathering_id,user_id) where status<>'paid';

alter table public.orders
  add column if not exists account_id uuid references public.member_accounts(id),
  add column if not exists created_by uuid;

-- Existing orders become one open (unpaid) account per member and gathering. No payment is invented.
insert into public.member_accounts(gathering_id,user_id,seq)
select distinct o.gathering_id,o.user_id,1 from public.orders o
where o.account_id is null
  and not exists(select 1 from public.member_accounts a where a.gathering_id=o.gathering_id and a.user_id=o.user_id)
on conflict do nothing;
update public.orders o set account_id=a.id from public.member_accounts a
  where o.account_id is null and a.gathering_id=o.gathering_id and a.user_id=o.user_id and a.seq=1;
update public.orders set created_by=user_id where created_by is null;
create index if not exists qa_orders_account on public.orders(account_id);

-- ---------------------------------------------------------------- payments
create table if not exists public.account_payments(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.member_accounts(id),
  gathering_id uuid not null references public.gatherings(id),
  user_id uuid not null,
  member_name text not null,
  amount numeric(12,2) not null check(amount>0),
  status text not null default 'pending' check(status in ('pending','confirmed','cancelled')),
  requested_at timestamptz not null default clock_timestamp(),
  requested_by uuid not null,
  confirmed_at timestamptz,
  confirmed_by uuid,
  confirmed_by_name text,
  receipt jsonb
);
-- One live (pending or confirmed) payment per account: repeated taps/reloads cannot duplicate money.
create unique index if not exists qa_one_live_payment on public.account_payments(account_id) where status in ('pending','confirmed');

-- ---------------------------------------------------------------- wallet ledger (append-only)
create table if not exists public.wallet_ledger(
  id uuid primary key default gen_random_uuid(),
  gathering_id uuid not null references public.gatherings(id),
  kind text not null check(kind in ('payment','expense','adjustment','correction')),
  amount numeric(12,2) not null check(amount<>0),
  description text not null,
  member_id uuid,
  member_name text,
  account_id uuid,
  payment_id uuid,
  order_id uuid,
  created_by uuid not null,
  created_by_name text,
  confirmed_by uuid,
  confirmed_by_name text,
  created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists qa_ledger_one_per_payment on public.wallet_ledger(payment_id) where payment_id is not null;
create index if not exists qa_ledger_gathering on public.wallet_ledger(gathering_id,created_at desc);
create or replace function public.qa_ledger_append_only() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Financial ledger entries are append-only; record a correction instead'; end $$;
drop trigger if exists qa_ledger_no_change on public.wallet_ledger;
create trigger qa_ledger_no_change before update or delete on public.wallet_ledger for each row execute function public.qa_ledger_append_only();

-- ---------------------------------------------------------------- custody
create table if not exists public.wallet_custody(
  id uuid primary key default gen_random_uuid(),
  gathering_id uuid not null references public.gatherings(id),
  from_user uuid,
  from_name text,
  to_user uuid not null,
  to_name text not null,
  amount numeric(12,2) not null check(amount>=0),
  status text not null default 'pending' check(status in ('pending','confirmed','cancelled')),
  handed_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null,
  confirmed_at timestamptz,
  confirmed_by uuid,
  confirmed_by_name text
);
create or replace function public.qa_custody_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Custody records cannot be deleted'; end if;
  if old.status<>'pending' then raise exception 'Completed custody records are immutable'; end if;
  if new.to_user<>old.to_user or new.amount<>old.amount or new.gathering_id<>old.gathering_id then raise exception 'Custody details cannot be edited'; end if;
  return new;
end $$;
drop trigger if exists qa_custody_guard_trigger on public.wallet_custody;
create trigger qa_custody_guard_trigger before update or delete on public.wallet_custody for each row execute function public.qa_custody_guard();

-- ---------------------------------------------------------------- notifications for payment requests
alter table public.admin_order_notifications
  alter column order_id drop not null,
  add column if not exists kind text not null default 'order',
  add column if not exists payment_id uuid references public.account_payments(id) on delete cascade,
  add column if not exists amount numeric(12,2);
create unique index if not exists qa_notice_one_per_payment on public.admin_order_notifications(admin_id,payment_id) where payment_id is not null;

-- ---------------------------------------------------------------- RLS: read-only from the browser
do $$ declare t text; begin
  foreach t in array array['member_accounts','account_payments','wallet_ledger','wallet_custody'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
drop policy if exists qa_accounts_read on public.member_accounts;
create policy qa_accounts_read on public.member_accounts for select to authenticated
  using(public.qa_is_approved() and (user_id=auth.uid() or public.qa_is_admin()));
drop policy if exists qa_payments_read on public.account_payments;
create policy qa_payments_read on public.account_payments for select to authenticated
  using(public.qa_is_approved() and (user_id=auth.uid() or public.qa_is_admin()));
drop policy if exists qa_ledger_read on public.wallet_ledger;
create policy qa_ledger_read on public.wallet_ledger for select to authenticated using(public.qa_is_admin());
drop policy if exists qa_custody_read on public.wallet_custody;
create policy qa_custody_read on public.wallet_custody for select to authenticated
  using(public.qa_is_admin() or (public.qa_is_approved() and (to_user=auth.uid() or from_user=auth.uid())));

-- ---------------------------------------------------------------- orders: owner vs recorder, automatic account
create or replace function public.qa_order_defaults() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_a public.member_accounts%rowtype;
begin
  if tg_op='INSERT' then
    new.delivery_status:='pending'; new.received_at:=null;
    new.created_at:=clock_timestamp();
    new.next_reminder_at:=new.created_at+interval '15 minutes';
    new.reminder_claim_token:=null; new.reminder_lease_until:=null;
    new.created_by:=coalesce(new.created_by,auth.uid(),new.user_id);
    perform pg_advisory_xact_lock(hashtextextended(new.gathering_id::text||':'||new.user_id::text,0));
    select * into v_a from public.member_accounts
      where gathering_id=new.gathering_id and user_id=new.user_id and status<>'paid' for update;
    if found then
      if v_a.status='pending' then raise exception 'Account awaiting payment confirmation'; end if;
      new.account_id:=v_a.id;
    else
      insert into public.member_accounts(gathering_id,user_id,seq)
      values(new.gathering_id,new.user_id,
        coalesce((select max(seq) from public.member_accounts where gathering_id=new.gathering_id and user_id=new.user_id),0)+1)
      returning id into new.account_id;
    end if;
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='total_price' and is_generated='NEVER') then
    new.total_price:=new.unit_price_snapshot*new.quantity;
  end if;
  return new;
end $$;

create or replace function public.qa_account_totals(p_account uuid)
returns table(total numeric,pending integer)
language sql stable security definer set search_path='' as $$
  select coalesce(sum(round(unit_price_snapshot*quantity,2)) filter(where delivery_status='received'),0)::numeric,
         (count(*) filter(where delivery_status='pending'))::integer
  from public.orders where account_id=p_account
$$;

-- ---------------------------------------------------------------- payment engine
create or replace function public.qa_finalize_payment(p_payment uuid,p_admin uuid) returns void
language plpgsql security definer set search_path='' as $$
declare
  v_acc uuid; v_p public.account_payments%rowtype; v_a public.member_accounts%rowtype;
  v_total numeric; v_pending integer; v_admin text; v_g public.gatherings%rowtype; v_receipt jsonb;
begin
  select account_id into v_acc from public.account_payments where id=p_payment;
  if v_acc is null then raise exception 'Payment not found'; end if;
  select * into v_a from public.member_accounts where id=v_acc for update;
  select * into v_p from public.account_payments where id=p_payment for update;
  if v_p.status='confirmed' then return; end if;
  if v_p.status<>'pending' then raise exception 'Payment request is not pending'; end if;
  select t.total,t.pending into v_total,v_pending from public.qa_account_totals(v_acc) t;
  if v_pending>0 then raise exception 'Account has drinks awaiting receipt confirmation'; end if;
  if v_total<>v_p.amount then raise exception 'Account changed after the payment request; cancel it and request again'; end if;
  select full_name into v_admin from public.profiles where id=p_admin;
  select * into v_g from public.gatherings where id=v_p.gathering_id;
  select jsonb_build_object('member',v_p.member_name,'gathering',v_g.title,'started_at',v_g.started_at,
      'account_no',v_a.seq,'total',v_total,'paid_at',clock_timestamp(),'confirmed_by',v_admin,
      'items',coalesce(jsonb_agg(jsonb_build_object('name',o.item_name_snapshot,'qty',o.quantity,
        'unit_price',o.unit_price_snapshot,'total',round(o.unit_price_snapshot*o.quantity,2)) order by o.created_at,o.id),'[]'::jsonb))
    into v_receipt from public.orders o where o.account_id=v_acc;
  update public.account_payments set status='confirmed',confirmed_at=clock_timestamp(),confirmed_by=p_admin,
    confirmed_by_name=v_admin,receipt=v_receipt where id=p_payment;
  update public.member_accounts set status='paid',closed_at=clock_timestamp() where id=v_acc;
  insert into public.wallet_ledger(gathering_id,kind,amount,description,member_id,member_name,account_id,payment_id,
      created_by,created_by_name,confirmed_by,confirmed_by_name)
    values(v_p.gathering_id,'payment',v_p.amount,'دفع حساب كامل',v_p.user_id,v_p.member_name,v_acc,p_payment,
      p_admin,v_admin,p_admin,v_admin);
end $$;

create or replace function public.qa_request_payment(p_account uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_a public.member_accounts%rowtype; v_total numeric; v_pending integer; v_pay uuid; v_name text;
begin
  if not public.qa_is_approved() then raise exception 'Approved membership required' using errcode='42501'; end if;
  select * into v_a from public.member_accounts where id=p_account for update;
  if not found or v_a.user_id<>auth.uid() then raise exception 'Account not found' using errcode='42501'; end if;
  if v_a.status='paid' then raise exception 'Account already paid'; end if;
  if v_a.status='pending' then
    select id into v_pay from public.account_payments where account_id=p_account and status='pending';
    return v_pay;
  end if;
  select t.total,t.pending into v_total,v_pending from public.qa_account_totals(p_account) t;
  if v_pending>0 then raise exception 'Confirm receipt of all drinks first'; end if;
  if v_total<=0 then raise exception 'Nothing to pay'; end if;
  select full_name into v_name from public.profiles where id=auth.uid();
  insert into public.account_payments(account_id,gathering_id,user_id,member_name,amount,requested_by)
    values(p_account,v_a.gathering_id,v_a.user_id,coalesce(v_name,'عضو'),v_total,auth.uid()) returning id into v_pay;
  update public.member_accounts set status='pending' where id=p_account;
  insert into public.admin_order_notifications(admin_id,order_id,member_name,item_name,quantity,kind,payment_id,amount)
    select p.id,null,coalesce(v_name,'عضو'),'طلب تأكيد دفع الحساب',1,'payment',v_pay,v_total
    from public.profiles p where p.role='admin' and p.status='approved' on conflict do nothing;
  return v_pay;
end $$;

create or replace function public.qa_cancel_payment(p_account uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_a public.member_accounts%rowtype;
begin
  if not public.qa_is_approved() then raise exception 'Approved membership required' using errcode='42501'; end if;
  select * into v_a from public.member_accounts where id=p_account for update;
  if not found or (v_a.user_id<>auth.uid() and not public.qa_is_admin()) then raise exception 'Account not found' using errcode='42501'; end if;
  if v_a.status<>'pending' then return; end if;
  update public.account_payments set status='cancelled' where account_id=p_account and status='pending';
  update public.member_accounts set status='open' where id=p_account;
end $$;

create or replace function public.qa_confirm_payment(p_payment uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  perform public.qa_finalize_payment(p_payment,auth.uid());
end $$;

create or replace function public.qa_admin_record_payment(p_account uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_a public.member_accounts%rowtype; v_total numeric; v_pending integer; v_pay uuid; v_name text;
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  select * into v_a from public.member_accounts where id=p_account for update;
  if not found then raise exception 'Account not found'; end if;
  if v_a.status='paid' then
    select id into v_pay from public.account_payments where account_id=p_account and status='confirmed';
    return v_pay;
  end if;
  if v_a.status='pending' then
    select id into v_pay from public.account_payments where account_id=p_account and status='pending';
  else
    select t.total,t.pending into v_total,v_pending from public.qa_account_totals(p_account) t;
    if v_pending>0 then raise exception 'Confirm receipt of all drinks first'; end if;
    if v_total<=0 then raise exception 'Nothing to pay'; end if;
    select full_name into v_name from public.profiles where id=v_a.user_id;
    insert into public.account_payments(account_id,gathering_id,user_id,member_name,amount,requested_by)
      values(p_account,v_a.gathering_id,v_a.user_id,coalesce(v_name,'عضو'),v_total,auth.uid()) returning id into v_pay;
    update public.member_accounts set status='pending' where id=p_account;
  end if;
  perform public.qa_finalize_payment(v_pay,auth.uid());
  return v_pay;
end $$;

-- ---------------------------------------------------------------- admin drinks on behalf of a member
create or replace function public.qa_admin_add_order(p_user uuid,p_item uuid,p_qty integer,p_received boolean default true) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_g uuid; v_item public.menu_items%rowtype; v_fk text; v_columns text; v_values text; v_id uuid;
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  if p_qty is null or p_qty<1 or p_qty>50 then raise exception 'Invalid quantity'; end if;
  perform 1 from public.profiles where id=p_user and status='approved';
  if not found then raise exception 'Member must be approved'; end if;
  select id into v_g from public.gatherings where status='active';
  if v_g is null then raise exception 'No active gathering'; end if;
  select * into v_item from public.menu_items where id=p_item and is_active=true and is_archived=false for share;
  if not found then raise exception 'Menu item unavailable'; end if;
  select column_name into v_fk from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name in ('item_id','menu_item_id') order by column_name limit 1;
  v_columns:='user_id,gathering_id,item_name_snapshot,unit_price_snapshot,quantity';
  v_values:='$1,$2,$3,$4,$5';
  if v_fk is not null then v_columns:=v_columns||','||quote_ident(v_fk); v_values:=v_values||',$6'; end if;
  execute 'insert into public.orders('||v_columns||') values('||v_values||') returning id'
    into v_id using p_user,v_g,v_item.name,v_item.price,p_qty,p_item;
  if p_received then
    update public.orders set delivery_status='received',received_at=clock_timestamp(),next_reminder_at=null,
      reminder_claim_token=null,reminder_lease_until=null where id=v_id;
  end if;
  return v_id;
end $$;

create or replace function public.qa_admin_mark_received(p_order uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  update public.orders set delivery_status='received',received_at=clock_timestamp(),next_reminder_at=null,
    reminder_claim_token=null,reminder_lease_until=null where id=p_order and delivery_status='pending';
  if not found and not exists(select 1 from public.orders where id=p_order) then raise exception 'Order not found'; end if;
end $$;

-- Editing/deleting a drink whose account is already paid is allowed only as a documented reduction:
-- the paid receipt snapshot is untouched and a negative ledger adjustment records the refund due.
create or replace function public.qa_admin_update_order(p_order uuid,p_qty integer,p_price numeric) returns void
language plpgsql security definer set search_path='' as $$
declare v_o public.orders%rowtype; v_paid boolean; v_old numeric; v_new numeric; v_me text; v_name text;
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  if p_qty is null or p_qty<1 or p_qty>50 or p_price is null or p_price<0 or p_price::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid quantity or price'; end if;
  select * into v_o from public.orders where id=p_order for update;
  if not found then raise exception 'Order not found'; end if;
  select (status='paid') into v_paid from public.member_accounts where id=v_o.account_id;
  v_old:=round(v_o.unit_price_snapshot*v_o.quantity,2); v_new:=round(p_price*p_qty,2);
  if coalesce(v_paid,false) and v_new>v_old then raise exception 'Account already paid: only reductions are allowed after payment'; end if;
  update public.orders set quantity=p_qty,unit_price_snapshot=p_price where id=p_order;
  if coalesce(v_paid,false) and v_new<v_old then
    select full_name into v_me from public.profiles where id=auth.uid();
    select full_name into v_name from public.profiles where id=v_o.user_id;
    insert into public.wallet_ledger(gathering_id,kind,amount,description,member_id,member_name,account_id,order_id,created_by,created_by_name)
      values(v_o.gathering_id,'adjustment',-(v_old-v_new),'تسوية بعد الدفع: تخفيض '||v_o.item_name_snapshot,v_o.user_id,v_name,v_o.account_id,p_order,auth.uid(),v_me);
  end if;
end $$;

create or replace function public.qa_admin_delete_order(p_order uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_o public.orders%rowtype; v_paid boolean; v_old numeric; v_me text; v_name text;
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  select * into v_o from public.orders where id=p_order for update;
  if not found then raise exception 'Order not found'; end if;
  select (status='paid') into v_paid from public.member_accounts where id=v_o.account_id;
  v_old:=round(v_o.unit_price_snapshot*v_o.quantity,2);
  if coalesce(v_paid,false) and v_old>0 then
    select full_name into v_me from public.profiles where id=auth.uid();
    select full_name into v_name from public.profiles where id=v_o.user_id;
    insert into public.wallet_ledger(gathering_id,kind,amount,description,member_id,member_name,account_id,order_id,created_by,created_by_name)
      values(v_o.gathering_id,'adjustment',-v_old,'تسوية بعد الدفع: حذف '||v_o.item_name_snapshot,v_o.user_id,v_name,v_o.account_id,p_order,auth.uid(),v_me);
  end if;
  delete from public.orders where id=p_order;
end $$;

-- ---------------------------------------------------------------- expenses and corrections
create or replace function public.qa_record_expense(p_gathering uuid,p_description text,p_amount numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_me text;
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  perform 1 from public.gatherings where id=p_gathering;
  if not found then raise exception 'Gathering not found'; end if;
  if p_description is null or length(trim(p_description))<1 or length(p_description)>200 then raise exception 'Invalid description'; end if;
  if p_amount is null or p_amount<=0 or p_amount>1000000 or p_amount<>round(p_amount,2) then raise exception 'Invalid amount'; end if;
  select full_name into v_me from public.profiles where id=auth.uid();
  insert into public.wallet_ledger(gathering_id,kind,amount,description,created_by,created_by_name)
    values(p_gathering,'expense',-p_amount,trim(p_description),auth.uid(),v_me) returning id into v_id;
  return v_id;
end $$;

create or replace function public.qa_wallet_correct(p_gathering uuid,p_amount numeric,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_me text;
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  perform 1 from public.gatherings where id=p_gathering;
  if not found then raise exception 'Gathering not found'; end if;
  if p_amount is null or p_amount=0 or abs(p_amount)>1000000 or p_amount<>round(p_amount,2) then raise exception 'Invalid amount'; end if;
  if p_reason is null or length(trim(p_reason))<3 or length(p_reason)>200 then raise exception 'A reason is required'; end if;
  select full_name into v_me from public.profiles where id=auth.uid();
  insert into public.wallet_ledger(gathering_id,kind,amount,description,created_by,created_by_name)
    values(p_gathering,'correction',p_amount,'تصحيح: '||trim(p_reason),auth.uid(),v_me) returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- custody hand-over
create or replace function public.qa_start_custody(p_gathering uuid,p_to uuid,p_amount numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_balance numeric; v_from uuid; v_from_name text; v_to_name text; v_me text;
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('custody:'||p_gathering::text,0));
  perform 1 from public.gatherings where id=p_gathering;
  if not found then raise exception 'Gathering not found'; end if;
  select full_name into v_to_name from public.profiles where id=p_to and status='approved';
  if v_to_name is null then raise exception 'Custodian must be an approved member'; end if;
  if p_amount is null or p_amount<0 or p_amount<>round(p_amount,2) then raise exception 'Invalid amount'; end if;
  select coalesce(sum(amount),0) into v_balance from public.wallet_ledger where gathering_id=p_gathering;
  if p_amount>v_balance then raise exception 'Amount exceeds wallet balance'; end if;
  if exists(select 1 from public.wallet_custody where gathering_id=p_gathering and status='pending') then
    raise exception 'A custody transfer is already pending';
  end if;
  select to_user into v_from from public.wallet_custody where gathering_id=p_gathering and status='confirmed'
    order by confirmed_at desc,id desc limit 1;
  select full_name into v_me from public.profiles where id=auth.uid();
  select full_name into v_from_name from public.profiles where id=v_from;
  insert into public.wallet_custody(gathering_id,from_user,from_name,to_user,to_name,amount,recorded_by)
    values(p_gathering,v_from,coalesce(v_from_name,v_me),p_to,v_to_name,p_amount,auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.qa_confirm_custody(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_c public.wallet_custody%rowtype; v_me text;
begin
  if not public.qa_is_approved() then raise exception 'Approved membership required' using errcode='42501'; end if;
  select * into v_c from public.wallet_custody where id=p_id for update;
  if not found or (v_c.to_user<>auth.uid() and not public.qa_is_admin()) then raise exception 'Custody not found' using errcode='42501'; end if;
  if v_c.status='confirmed' then return; end if;
  if v_c.status<>'pending' then raise exception 'Custody transfer was cancelled'; end if;
  select full_name into v_me from public.profiles where id=auth.uid();
  update public.wallet_custody set status='confirmed',confirmed_at=clock_timestamp(),confirmed_by=auth.uid(),confirmed_by_name=v_me where id=p_id;
end $$;

create or replace function public.qa_cancel_custody(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.qa_is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  update public.wallet_custody set status='cancelled' where id=p_id and status='pending';
end $$;

-- ---------------------------------------------------------------- member deletion keeps financial history
create or replace function public.qa_cleanup_auth_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from public.admin_order_notifications where admin_id=old.id or order_id in (select id from public.orders where user_id=old.id);
  delete from public.orders where user_id=old.id;
  delete from public.order_batch_receipts where user_id=old.id;
  delete from public.member_accounts a where a.user_id=old.id
    and not exists(select 1 from public.account_payments p where p.account_id=a.id);
  delete from public.profiles where id=old.id;
  return old;
end $$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.qa_ledger_append_only(),public.qa_custody_guard(),public.qa_account_totals(uuid),public.qa_finalize_payment(uuid,uuid) from public,anon,authenticated;
revoke all on function
  public.qa_request_payment(uuid),public.qa_cancel_payment(uuid),public.qa_confirm_payment(uuid),public.qa_admin_record_payment(uuid),
  public.qa_admin_add_order(uuid,uuid,integer,boolean),public.qa_admin_mark_received(uuid),
  public.qa_record_expense(uuid,text,numeric),public.qa_wallet_correct(uuid,numeric,text),
  public.qa_start_custody(uuid,uuid,numeric),public.qa_confirm_custody(uuid),public.qa_cancel_custody(uuid)
  from public,anon;
grant execute on function
  public.qa_request_payment(uuid),public.qa_cancel_payment(uuid),public.qa_confirm_payment(uuid),public.qa_admin_record_payment(uuid),
  public.qa_admin_add_order(uuid,uuid,integer,boolean),public.qa_admin_mark_received(uuid),
  public.qa_record_expense(uuid,text,numeric),public.qa_wallet_correct(uuid,numeric,text),
  public.qa_start_custody(uuid,uuid,numeric),public.qa_confirm_custody(uuid),public.qa_cancel_custody(uuid)
  to authenticated;

do $$ declare t text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['member_accounts','account_payments','wallet_ledger','wallet_custody'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;

commit;
