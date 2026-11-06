-- Apply once in Supabase SQL Editor before deploying the matching frontend.
begin;

alter table public.menu_items
  add column if not exists image_url text,
  add column if not exists audio_url text;

-- Public assets may be read by browsers; only approved admins may upload/delete.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('menu-media','menu-media',true,10485760,
        array['image/jpeg','image/png','image/webp','audio/mpeg'])
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists menu_media_admin_insert on storage.objects;
create policy menu_media_admin_insert on storage.objects for insert to authenticated
with check (
  bucket_id='menu-media'
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.status='approved')
);
drop policy if exists menu_media_admin_select on storage.objects;
create policy menu_media_admin_select on storage.objects for select to authenticated
using (bucket_id='menu-media' and exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.status='approved'
));
drop policy if exists menu_media_admin_delete on storage.objects;
create policy menu_media_admin_delete on storage.objects for delete to authenticated
using (bucket_id='menu-media' and exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.status='approved'
));

-- Receipts prevent a retry after a lost response from creating duplicate orders.
-- The table is private; all access goes through the authenticated function below.
create table if not exists public.order_batch_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  gathering_id uuid not null references public.gatherings(id),
  items jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.order_batch_receipts enable row level security;
revoke all on public.order_batch_receipts from anon,authenticated;

create or replace function public.add_orders(p_gathering uuid,p_items jsonb,p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_line jsonb;
  v_id uuid;
  v_quantity numeric;
  v_inserted uuid;
  v_existing public.order_batch_receipts%rowtype;
begin
  if v_user is null or not exists (
    select 1 from public.profiles where id=v_user and status='approved'
  ) then
    raise exception 'Approved membership required' using errcode='42501';
  end if;
  if p_request_id is null or p_gathering is null then
    raise exception 'Request and gathering are required';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then
    raise exception 'Items must be an array';
  end if;
  if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then
    raise exception 'Choose between 1 and 100 distinct items';
  end if;
  if (select count(distinct x->>'item_id') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Duplicate or missing items';
  end if;

  insert into public.order_batch_receipts(user_id,request_id,gathering_id,items)
    values(v_user,p_request_id,p_gathering,p_items)
    on conflict do nothing returning request_id into v_inserted;
  if v_inserted is null then
    select * into strict v_existing from public.order_batch_receipts
      where user_id=v_user and request_id=p_request_id;
    if v_existing.gathering_id<>p_gathering or v_existing.items<>p_items then
      raise exception 'Request ID already used with a different cart';
    end if;
    return;
  end if;

  -- Hold this gathering open for the whole transaction. A concurrent close waits.
  perform 1 from public.gatherings where id=p_gathering and status='active' for share;
  if not found then raise exception 'Gathering is closed'; end if;
  if (select count(*) from public.gatherings where status='active')<>1 then
    raise exception 'Exactly one active gathering required';
  end if;

  for v_line in select value from jsonb_array_elements(p_items) loop
    v_id := (v_line->>'item_id')::uuid;
    if jsonb_typeof(v_line->'quantity') is distinct from 'number' then
      raise exception 'Quantity must be numeric';
    end if;
    v_quantity := (v_line->>'quantity')::numeric;
    if v_quantity is null or v_quantity<>trunc(v_quantity) or v_quantity<1 or v_quantity>50 then
      raise exception 'Quantity must be an integer between 1 and 50';
    end if;
    perform 1 from public.menu_items
      where id=v_id and is_active=true and is_archived=false for share;
    if not found then raise exception 'Menu item unavailable'; end if;
    -- Reuse existing pricing, snapshots, permissions and order insertion logic.
    -- Every call shares this transaction; any failure rolls the whole cart back.
    perform public.add_order(p_item=>v_id,p_qty=>v_quantity::integer);
  end loop;
end;
$$;
revoke all on function public.add_orders(uuid,jsonb,uuid) from public,anon;
grant execute on function public.add_orders(uuid,jsonb,uuid) to authenticated;

commit;
