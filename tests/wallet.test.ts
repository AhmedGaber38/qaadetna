// @vitest-environment node
// Runs migrations 001-003 on an in-memory Postgres (PGlite) and exercises the money rules end to end.
import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest'
const db=new PGlite()
const admin='10000000-0000-4000-8000-000000000001'
const m1='10000000-0000-4000-8000-000000000011',m2='10000000-0000-4000-8000-000000000012',m3='10000000-0000-4000-8000-000000000013',m4='10000000-0000-4000-8000-000000000014'
const gathering='20000000-0000-4000-8000-000000000001',tea='30000000-0000-4000-8000-000000000001'
const sql=(f:string)=>readFileSync(`supabase/migrations/${f}`,'utf8')
async function as<T>(id:string,task:()=>Promise<T>){
  await db.exec(`set test.uid='${id}';set role authenticated`)
  try{return await task()}finally{await db.exec('reset role')}
}
const q=async(text:string,params:any[]=[])=>(await db.query<any>(text,params)).rows
let n=0
async function order(user:string,qty=1){await as(user,()=>q('select public.qa_submit_order_batch($1,$2::jsonb,$3)',[gathering,JSON.stringify([{item_id:tea,quantity:qty}]),`40000000-0000-4000-8000-${String(++n).padStart(12,'0')}`]))}
async function receiveAll(user:string){for(const o of await q('select id from public.orders where user_id=$1 and delivery_status=\'pending\'',[user]))await as(user,()=>q('select public.qa_confirm_order($1)',[o.id]))}
const account=async(user:string)=>(await q('select * from public.member_accounts where user_id=$1 order by seq desc limit 1',[user]))[0]
const balance=async()=>Number((await q('select coalesce(sum(amount),0) as b from public.wallet_ledger'))[0].b)
async function payFull(user:string){
  await receiveAll(user);const a=await account(user)
  const pay=(await as(user,()=>q('select public.qa_request_payment($1) as id',[a.id])))[0].id
  await as(admin,()=>q('select public.qa_confirm_payment($1)',[pay]));return pay
}
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
  `)
  await db.exec(sql('202611060001_menu_cart_media.sql'));await db.exec(sql('202611060002_receipts_billing_security.sql'))
  await db.exec(`insert into auth.users values('${m1}');insert into public.profiles(id,username,full_name,status) values('${m1}','old','Old','approved');
    insert into public.gatherings(id,title,status) values('${gathering}','Old','closed');insert into public.menu_items(id,name,price) values('${tea}','Tea',10);
    insert into public.orders(user_id,gathering_id,item_id,item_name_snapshot,unit_price_snapshot,quantity) values('${m1}','${gathering}','${tea}','Tea',10,2);`)
  await db.exec(sql('202611140001_accounts_payments_wallet.sql'))
  const old=await q('select o.account_id,a.status from public.orders o join public.member_accounts a on a.id=o.account_id')
  expect(old).toHaveLength(1);expect(old[0].status).toBe('open')           // legacy orders become an UNPAID account, no payment invented
  expect(await q('select * from public.wallet_ledger')).toHaveLength(0)
  await db.exec(sql('202611140001_accounts_payments_wallet.sql'))          // re-running is safe
},60000)
beforeEach(async()=>{
  await db.exec(`reset role;truncate public.wallet_custody,public.wallet_ledger,public.account_payments,public.admin_order_notifications,public.order_batch_receipts,public.orders,public.member_accounts,public.menu_items,public.gatherings,public.profiles,auth.users cascade;
    insert into auth.users values('${admin}'),('${m1}'),('${m2}'),('${m3}'),('${m4}');
    insert into public.profiles(id,username,full_name,role,status) values('${admin}','admin','Admin','admin','approved'),('${m1}','m1','Ahmed','user','approved'),('${m2}','m2','Mohamed','user','approved'),('${m3}','m3','Mahmoud','user','approved'),('${m4}','m4','Omar','user','approved');
    insert into public.gatherings(id,title) values('${gathering}','Test');insert into public.menu_items(id,name,price) values('${tea}','Tea',10);`)
})
afterAll(()=>db.close())

it('S1: every member has an independent account; the drink belongs to its owner, not to whoever recorded it',async()=>{
  await order(m1,2);await order(m2,3)
  await as(admin,()=>q('select public.qa_admin_add_order($1,$2,4,true)',[m3,tea]))
  const rows=await q('select user_id,created_by,account_id,delivery_status from public.orders order by quantity')
  expect(new Set(rows.map(r=>r.account_id)).size).toBe(3)
  const adminAdded=rows.find(r=>r.user_id===m3);expect(adminAdded.created_by).toBe(admin);expect(adminAdded.delivery_status).toBe('received')
  await as(m1,async()=>expect(await q('select * from public.member_accounts')).toHaveLength(1))   // cannot see other accounts
  await as(m1,async()=>expect(await q('select * from public.orders')).toHaveLength(1))
  await expect(as(m1,()=>q('select public.qa_admin_add_order($1,$2,1,true)',[m2,tea]))).rejects.toThrow('Admin required')
})
it('S2: full payment only: pending then admin confirmation; wallet credited once; duplicates and partials impossible',async()=>{
  await order(m1,2)
  const a=await account(m1)
  await expect(as(m1,()=>q('select public.qa_request_payment($1)',[a.id]))).rejects.toThrow('Confirm receipt')   // drink still being prepared
  await receiveAll(m1)
  const first=(await as(m1,()=>q('select public.qa_request_payment($1) as id',[a.id])))[0].id
  const again=(await as(m1,()=>q('select public.qa_request_payment($1) as id',[a.id])))[0].id
  expect(again).toBe(first)                                                       // repeated tap / reload = same request
  expect((await account(m1)).status).toBe('pending');expect(await balance()).toBe(0)   // nothing in the wallet before confirmation
  expect(await as(admin,()=>q("select * from public.admin_order_notifications where kind='payment'"))).toHaveLength(1)
  await expect(as(m1,()=>q('select public.qa_confirm_payment($1)',[first]))).rejects.toThrow('Admin required')   // cannot confirm own payment
  await as(admin,()=>q('select public.qa_confirm_payment($1)',[first]));await as(admin,()=>q('select public.qa_confirm_payment($1)',[first]))
  expect(await balance()).toBe(20);expect((await q('select * from public.wallet_ledger'))).toHaveLength(1)
  const p=(await q('select * from public.account_payments'))[0];expect(p.status).toBe('confirmed');expect(Number(p.amount)).toBe(20)
  expect(p.receipt.total).toBe(20);expect(p.receipt.items).toHaveLength(1);expect((await account(m1)).status).toBe('paid')
  await expect(as(m1,()=>q('select public.qa_request_payment($1)',[a.id]))).rejects.toThrow('already paid')
  expect((await as(admin,()=>q('select public.qa_admin_record_payment($1) as id',[a.id])))[0].id).toBe(first)   // idempotent
  expect(await balance()).toBe(20)
})
it('S2b: admin can record a payment directly; a pending request blocks new orders until cancelled',async()=>{
  await order(m2,3);await receiveAll(m2);const a=await account(m2)
  await as(m2,()=>q('select public.qa_request_payment($1)',[a.id]))
  await expect(order(m2,1)).rejects.toThrow('awaiting payment')
  await as(m2,()=>q('select public.qa_cancel_payment($1)',[a.id]));expect((await account(m2)).status).toBe('open')
  await order(m2,1);await receiveAll(m2)
  await as(admin,()=>q('select public.qa_admin_record_payment($1)',[a.id]))
  expect(await balance()).toBe(40)
})
it('S3+S4: members leave after paying, others keep ordering; a returning member starts a fresh account',async()=>{
  for(const u of [m1,m2,m3,m4])await order(u,2)
  const oldReceipts:any={}
  for(const u of [m1,m2,m3]){await payFull(u);oldReceipts[u]=(await q('select receipt from public.account_payments where user_id=$1',[u]))[0].receipt}
  expect((await q('select status from public.gatherings'))[0].status).toBe('active')
  await order(m4,1)                                                              // still ordering normally
  await order(m1,5)                                                              // returning member
  const accts=await q('select seq,status from public.member_accounts where user_id=$1 order by seq',[m1])
  expect(accts.map(x=>x.status)).toEqual(['paid','open']);expect(accts.map(x=>x.seq)).toEqual([1,2])
  const fresh=await q('select quantity from public.orders where account_id=(select id from public.member_accounts where user_id=$1 and seq=2)',[m1]);expect(fresh).toHaveLength(1)
  expect((await q('select receipt from public.account_payments where user_id=$1',[m1]))[0].receipt).toEqual(oldReceipts[m1])   // old receipt untouched
  expect(await balance()).toBe(60)                                               // 3 x 20
})
it('S5: wallet = confirmed collections − expenses; custody needs both sides and is recorded',async()=>{
  const pays=[[m1,10],[m2,15],[m3,8]] as const
  for(const [u,q10] of pays){await order(u,q10);await payFull(u)}                // 100 + 150 + 80
  expect(await balance()).toBe(330)
  await as(admin,()=>q("select public.qa_record_expense($1,'حساب الكافيه',200)",[gathering]))
  expect(await balance()).toBe(130)
  expect(Number((await q('select sum(amount) as s from public.wallet_ledger'))[0].s)).toBe(130)
  await expect(as(m1,()=>q("select public.qa_record_expense($1,'x',5)",[gathering]))).rejects.toThrow('Admin required')
  await expect(as(admin,()=>q('select public.qa_record_expense($1,$2,-5)',[gathering,'x']))).rejects.toThrow('Invalid amount')
  await expect(as(admin,()=>q('select public.qa_start_custody($1,$2,500)',[gathering,m4]))).rejects.toThrow('exceeds')
  const id=(await as(admin,()=>q('select public.qa_start_custody($1,$2,130) as id',[gathering,m4])))[0].id
  await expect(as(m1,()=>q('select public.qa_confirm_custody($1)',[id]))).rejects.toThrow('Custody not found')
  await as(m4,()=>q('select public.qa_confirm_custody($1)',[id]))
  const c=(await q('select * from public.wallet_custody'))[0];expect(c.status).toBe('confirmed');expect(c.to_name).toBe('Omar');expect(Number(c.amount)).toBe(130)
  await expect(db.exec('delete from public.wallet_custody')).rejects.toThrow('cannot be deleted')
  await as(m4,async()=>expect(await q('select * from public.wallet_custody')).toHaveLength(1))
  await as(m1,async()=>{expect(await q('select * from public.wallet_custody')).toHaveLength(0);expect(await q('select * from public.wallet_ledger')).toHaveLength(0)})
})
it('S6: errors: paid drink deleted -> documented adjustment; ledger is append-only; closing keeps unpaid accounts payable',async()=>{
  await order(m1,3);await order(m2,2);await payFull(m1)
  const o=(await q('select id from public.orders where user_id=$1',[m1]))[0].id
  await expect(as(admin,()=>q('select public.qa_admin_update_order($1,5,10)',[o]))).rejects.toThrow('only reductions')
  await as(admin,()=>q('select public.qa_admin_delete_order($1)',[o]))
  const adj=(await q("select * from public.wallet_ledger where kind='adjustment'"))[0]
  expect(Number(adj.amount)).toBe(-30);expect(await balance()).toBe(0)           // 30 collected, 30 refund recorded
  expect((await q('select * from public.wallet_ledger'))).toHaveLength(2)        // payment row is kept
  await expect(db.exec("update public.wallet_ledger set amount=1")).rejects.toThrow('append-only')
  await expect(db.exec('delete from public.wallet_ledger')).rejects.toThrow('append-only')
  await as(admin,()=>q('select public.qa_wallet_correct($1,5,$2)',[gathering,'تصحيح يدوي']))
  expect(await balance()).toBe(5)
  await expect(as(admin,()=>q('select public.qa_wallet_correct($1,5,$2)',[gathering,'']))).rejects.toThrow('reason')
  await as(admin,()=>q('select public.qa_close_gathering()'))                   // m2 never paid: closing is still allowed
  expect((await account(m2)).status).toBe('open')
  await receiveAll(m2)
  const a2=await account(m2)
  await as(admin,()=>q('select public.qa_admin_record_payment($1)',[a2.id]))
  expect(await balance()).toBe(25)                                                // still settles into the same gathering wallet
  const a1=await account(m1)
  await expect(as(m2,()=>q('select public.qa_admin_record_payment($1)',[a1.id]))).rejects.toThrow('Admin required')
})
it('direct writes from the browser are blocked; member deletion keeps payment history',async()=>{
  await order(m1,2);await payFull(m1)
  await as(m1,async()=>{
    await expect(db.exec("insert into public.wallet_ledger(gathering_id,kind,amount,description,created_by) values(gen_random_uuid(),'payment',999,'x',gen_random_uuid())")).rejects.toThrow('permission denied')
    await expect(db.exec("update public.member_accounts set status='paid'")).rejects.toThrow('permission denied')
    await expect(db.exec("update public.account_payments set amount=1")).rejects.toThrow('permission denied')
  })
  await db.exec(`delete from auth.users where id='${m1}'`)
  expect(await q('select * from public.account_payments')).toHaveLength(1);expect(await balance()).toBe(20)
})
