// @vitest-environment node
import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest'
const db=new PGlite()
const admin='10000000-0000-4000-8000-000000000001',member='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003'
const gathering='20000000-0000-4000-8000-000000000001',item='30000000-0000-4000-8000-000000000001',request='40000000-0000-4000-8000-000000000001'
const migration=readFileSync('supabase/migrations/202611060002_receipts_billing_security.sql','utf8')
async function asUser(id:string,task:()=>Promise<any>){
  await db.exec(`set test.uid='${id}';set role authenticated`)
  try{return await task()}finally{await db.exec('reset role')}
}
async function batch(id=member,lines=[{item_id:item,quantity:2}],req=request){
  return asUser(id,()=>db.query('select public.qa_submit_order_batch($1,$2::jsonb,$3)',[gathering,JSON.stringify(lines),req]))
}
async function orderId(id=member){return (await db.query<any>('select id from public.orders where user_id=$1',[id])).rows[0].id}
beforeAll(async()=>{
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table public.profiles(id uuid primary key references auth.users(id),username text unique not null,full_name text not null,role text not null default 'user',status text not null default 'pending',created_at timestamptz default now());
    create table public.gatherings(id uuid primary key default gen_random_uuid(),title text not null,status text not null default 'active',started_at timestamptz not null default now(),closed_at timestamptz);
    create table public.menu_items(id uuid primary key default gen_random_uuid(),name text not null,price numeric(12,2) not null,is_active boolean default true,is_archived boolean default false,created_at timestamptz default now());
    create table public.orders(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),gathering_id uuid not null references public.gatherings(id),item_id uuid references public.menu_items(id),item_name_snapshot text not null,unit_price_snapshot numeric(12,2) not null,quantity integer not null,total_price numeric generated always as (unit_price_snapshot*quantity) stored,created_at timestamptz not null default now());
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
    create function public.add_order(p_item uuid,p_qty integer) returns void language sql security definer as $$select$$;
    grant usage on schema auth,public,storage to anon,authenticated,service_role;
    grant all on all tables in schema public to authenticated;
    grant update(role) on public.profiles to authenticated;
    alter table public.orders enable row level security;
    create policy legacy_leak on public.orders for all to authenticated using(true) with check(true);
  `)
  await db.exec(readFileSync('supabase/migrations/202611060001_menu_cart_media.sql','utf8'))
  // A genuinely old order exists BEFORE the status migration.
  await db.exec(`
    insert into auth.users values('${member}');
    insert into public.profiles(id,username,full_name,status) values('${member}','old','Old Member','approved');
    insert into public.gatherings(id,title) values('${gathering}','Old');
    insert into public.menu_items(id,name,price) values('${item}','Tea',10);
    insert into public.orders(user_id,gathering_id,item_id,item_name_snapshot,unit_price_snapshot,quantity) values('${member}','${gathering}','${item}','Old tea',10,2);
  `)
  await db.exec(migration)
  const {rows}=await db.query<any>('select delivery_status,received_at from public.orders')
  expect(rows[0].delivery_status).toBe('received');expect(rows[0].received_at).toBeTruthy()
},30000)
beforeEach(async()=>{
  await db.exec(`reset role;truncate public.admin_order_notifications,public.order_batch_receipts,public.orders,public.menu_items,public.gatherings,public.profiles,auth.users cascade;
    insert into auth.users values('${admin}'),('${member}'),('${other}');
    insert into public.profiles(id,username,full_name,role,status) values('${admin}','admin','Admin','admin','approved'),('${member}','member','Member','user','approved'),('${other}','other','Other','user','approved');
    insert into public.gatherings(id,title) values('${gathering}','Test');
    insert into public.menu_items(id,name,price) values('${item}','Tea',10);
  `)
})
afterAll(()=>db.close())
it('allows admin participation and creates pending orders with server snapshots and a 15-minute deadline',async()=>{
  await batch(admin)
  const row=(await db.query<any>('select * from public.orders')).rows[0]
  expect(row.user_id).toBe(admin);expect(row.delivery_status).toBe('pending');expect(row.received_at).toBeNull()
  expect(row.item_name_snapshot).toBe('Tea');expect(row.unit_price_snapshot).toBe('10.00');expect(row.total_price).toBe('20.00')
  expect(new Date(row.next_reminder_at).getTime()-new Date(row.created_at).getTime()).toBe(900000)
})
it('backfills old rows and can be safely rerun without confirming pending orders',async()=>{
  await batch();await db.exec(migration)
  expect((await db.query<any>('select delivery_status from public.orders')).rows[0].delivery_status).toBe('pending')
})
it('prevents cross-member reads and updates, and blocks legacy permissive policies/RPCs',async()=>{
  await batch(member);await batch(other)
  await asUser(member,async()=>{
    expect((await db.query('select * from public.orders')).rows).toHaveLength(1)
    await expect(db.exec("update public.orders set delivery_status='received'")).rejects.toThrow('permission denied')
    await expect(db.exec("update public.profiles set role='admin'")).rejects.toThrow('permission denied')
    await expect(db.query('select public.add_order($1,1)',[item])).rejects.toThrow('permission denied')
    await expect(db.query('select public.add_orders($1,$2::jsonb,$3)',[gathering,'[]',request])).rejects.toThrow('permission denied')
  })
  await asUser(admin,async()=>expect((await db.query('select * from public.orders')).rows).toHaveLength(2))
})
it('permits only the owner to confirm delivery, even when another caller is admin; confirmation is idempotent',async()=>{
  await batch();const id=await orderId()
  await expect(asUser(other,()=>db.query('select public.qa_confirm_order($1)',[id]))).rejects.toThrow('Order not found')
  await expect(asUser(admin,()=>db.query('select public.qa_confirm_order($1)',[id]))).rejects.toThrow('Order not found')
  await asUser(member,()=>db.query('select public.qa_confirm_order($1)',[id]))
  const first=(await db.query<any>('select * from public.orders')).rows[0]
  await asUser(member,()=>db.query('select public.qa_confirm_order($1)',[id]))
  const second=(await db.query<any>('select * from public.orders')).rows[0]
  expect(second.delivery_status).toBe('received');expect(second.received_at).toEqual(first.received_at);expect(second.next_reminder_at).toBeNull()
})
it('deduplicates admin notifications and batch retries; menu price changes preserve snapshots',async()=>{
  await batch();await batch()
  expect((await db.query('select * from public.orders')).rows).toHaveLength(1)
  expect((await db.query('select * from public.admin_order_notifications')).rows).toHaveLength(1)
  await db.exec('update public.menu_items set price=99')
  expect((await db.query<any>('select unit_price_snapshot from public.orders')).rows[0].unit_price_snapshot).toBe('10.00')
  await asUser(member,async()=>expect((await db.query('select * from public.admin_order_notifications')).rows).toHaveLength(0))
  const notices=(await asUser(admin,()=>db.query<any>('select * from public.admin_order_notifications'))).rows
  await asUser(admin,()=>db.query('select public.qa_read_notifications($1::uuid[])',[[notices[0].id]]))
  expect((await asUser(admin,()=>db.query('select * from public.admin_order_notifications where read_at is null'))).rows).toHaveLength(0)
})
it('does not claim before 15 minutes; one lease per order; snooze schedules a fresh 15 minutes',async()=>{
  await batch()
  expect((await asUser(member,()=>db.query('select * from public.qa_claim_reminder()'))).rows).toHaveLength(0)
  await db.exec("update public.orders set next_reminder_at=now()-interval '1 second'")
  const claim=(await asUser(member,()=>db.query<any>('select * from public.qa_claim_reminder()'))).rows[0]
  expect(claim.item_name).toBe('Tea')
  expect((await asUser(member,()=>db.query('select * from public.qa_claim_reminder()'))).rows).toHaveLength(0)
  expect((await asUser(other,()=>db.query('select * from public.qa_claim_reminder()'))).rows).toHaveLength(0)
  await expect(asUser(other,()=>db.query('select public.qa_snooze_order($1,$2)',[claim.order_id,claim.claim_token]))).rejects.toThrow('expired')
  expect((await asUser(member,()=>db.query<any>('select public.qa_renew_reminder($1,$2) as ok',[claim.order_id,claim.claim_token]))).rows[0].ok).toBe(true)
  await asUser(member,()=>db.query('select public.qa_snooze_order($1,$2)',[claim.order_id,claim.claim_token]))
  const row=(await db.query<any>('select next_reminder_at,reminder_claim_token from public.orders')).rows[0]
  expect(new Date(row.next_reminder_at).getTime()-Date.now()).toBeGreaterThan(895000)
  expect(row.reminder_claim_token).toBeNull()
})
it('confirmation stops reminders; admin manages quantities while member cannot manage other orders',async()=>{
  await batch();const id=await orderId()
  await expect(asUser(member,()=>db.query('select public.qa_admin_update_order($1,4,12)',[id]))).rejects.toThrow('Admin required')
  await asUser(admin,()=>db.query('select public.qa_admin_update_order($1,4,12)',[id]))
  expect((await db.query<any>('select total_price from public.orders')).rows[0].total_price).toBe('48.00')
  await asUser(member,()=>db.query('select public.qa_confirm_order($1)',[id]))
  expect((await asUser(member,()=>db.query('select * from public.qa_claim_reminder()'))).rows).toHaveLength(0)
})
it('blocks suspended/anonymous users and role escalation through the profile RPC',async()=>{
  await db.exec(`update public.profiles set status='suspended' where id='${member}'`)
  await expect(batch()).rejects.toThrow('Approved membership')
  await expect(asUser(other,()=>db.query('select public.qa_admin_update_profile($1,$2,null)',[other,'Hacked']))).rejects.toThrow('Admin required')
  await db.exec("set test.uid='';set role anon")
  try{await expect(db.query('select public.qa_claim_reminder()')).rejects.toThrow('permission denied')}finally{await db.exec('reset role')}
})
it('renames a member without changing snapshots and deletes Auth + dependent records consistently',async()=>{
  await batch();await batch(other)
  await asUser(admin,()=>db.query('select public.qa_admin_update_profile($1,$2,null)',[member,'New Name']))
  expect((await db.query<any>('select full_name from public.profiles where id=$1',[member])).rows[0].full_name).toBe('New Name')
  await db.query('delete from auth.users where id=$1',[member])
  expect((await db.query('select * from public.orders where user_id=$1',[member])).rows).toHaveLength(0)
  expect((await db.query('select * from public.profiles where id=$1',[member])).rows).toHaveLength(0)
  expect((await db.query('select * from public.order_batch_receipts where user_id=$1',[member])).rows).toHaveLength(0)
  expect((await db.query('select * from public.orders where user_id=$1',[other])).rows).toHaveLength(1)
  expect((await db.query('select * from public.gatherings')).rows).toHaveLength(1)
})
it('rolls back cleanup if another dependency prevents Auth deletion',async()=>{
  await batch()
  await db.exec(`create table public.test_dependency(user_id uuid references auth.users(id));insert into public.test_dependency values('${member}')`)
  try{
    await expect(db.query('delete from auth.users where id=$1',[member])).rejects.toThrow('foreign key')
    expect((await db.query('select * from public.orders where user_id=$1',[member])).rows).toHaveLength(1)
    expect((await db.query('select * from public.profiles where id=$1',[member])).rows).toHaveLength(1)
  }finally{await db.exec('drop table public.test_dependency')}
})
it('a later invalid line rolls back orders, notifications and the receipt',async()=>{
  const missing='30000000-0000-4000-8000-000000000002'
  await expect(batch(member,[{item_id:item,quantity:1},{item_id:missing,quantity:1}])).rejects.toThrow('unavailable')
  for(const table of ['orders','admin_order_notifications','order_batch_receipts'])expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0)
})
it('keeps closed-gathering orders confirmable and permits an idempotent retry but no new cart',async()=>{
  await batch();await asUser(admin,()=>db.query('select public.qa_close_gathering()'))
  await batch()
  await expect(batch(other)).rejects.toThrow('closed')
  const id=await orderId();await asUser(member,()=>db.query('select public.qa_confirm_order($1)',[id]))
  expect((await db.query<any>('select delivery_status from public.orders')).rows[0].delivery_status).toBe('received')
})
it('supports a non-generated legacy total and menu_item_id without trusting old RPC code',async()=>{
  await db.exec('begin')
  try{
    await db.exec('alter table public.orders alter column total_price drop expression;alter table public.orders rename column item_id to menu_item_id')
    await batch()
    const row=(await db.query<any>('select * from public.orders')).rows[0]
    expect(row.menu_item_id).toBe(item);expect(row.total_price).toBe('20.00')
    await asUser(admin,()=>db.query('select public.qa_admin_update_order($1,3,7)',[row.id]))
    expect((await db.query<any>('select total_price from public.orders')).rows[0].total_price).toBe('21.00')
  }finally{await db.exec('rollback')}
})
it('revokes browser execution of trigger functions and prohibits direct account deletion',async()=>{
  await asUser(member,async()=>{
    const row=(await db.query<any>("select has_function_privilege(current_user,'public.qa_cleanup_auth_user()','EXECUTE') as allowed")).rows[0]
    expect(row.allowed).toBe(false)
    await expect(db.query('delete from auth.users where id=$1',[member])).rejects.toThrow('permission denied')
  })
})
