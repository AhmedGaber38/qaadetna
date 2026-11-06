// @vitest-environment node
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {afterAll,beforeAll,expect,it} from 'vitest'
const db=new PGlite()
const user='11111111-1111-4111-8111-111111111111',g='22222222-2222-4222-8222-222222222222',a='33333333-3333-4333-8333-333333333333',b='44444444-4444-4444-8444-444444444444'
const req='55555555-5555-4555-8555-555555555555'
const lines=[{item_id:a,quantity:2},{item_id:b,quantity:3}]
const call=(items=lines,id=req)=>db.query('select public.add_orders($1,$2::jsonb,$3)',[g,JSON.stringify(items),id])
beforeAll(async()=>{
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create table public.profiles(id uuid primary key,role text,status text);
    create table public.menu_items(id uuid primary key,name text,price numeric,is_active boolean,is_archived boolean);
    create table public.gatherings(id uuid primary key,status text);
    create table public.orders(user_id uuid,item_id uuid,quantity integer,total_price numeric);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);
    create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
    create function public.add_order(p_item uuid,p_qty integer) returns void language plpgsql as $$
    begin
      insert into public.orders select auth.uid(),id,p_qty,price*p_qty from public.menu_items where id=p_item;
    end; $$;
    insert into auth.users values('${user}');
    insert into public.profiles values('${user}','user','approved');
    insert into public.gatherings values('${g}','active');
    insert into public.menu_items values('${a}','Tea',10,true,false),('${b}','Coffee',20,true,false);
    set test.uid='${user}';
  `)
  await db.exec(readFileSync('supabase/migrations/202611060001_menu_cart_media.sql','utf8'))
},30000)
afterAll(()=>db.close())
it('rolls back every order and the retry receipt when a later item fails',async()=>{
  await expect(call([{item_id:a,quantity:2},{item_id:b,quantity:51}])).rejects.toThrow('Quantity')
  expect((await db.query('select * from public.orders')).rows).toHaveLength(0)
  expect((await db.query('select * from public.order_batch_receipts')).rows).toHaveLength(0)
})
it('uses server prices and makes an identical retry idempotent, even after closing',async()=>{
  await call();await db.exec(`update public.gatherings set status='closed'`);await call()
  const {rows}=await db.query<any>('select quantity,total_price from public.orders order by quantity')
  expect(rows).toEqual([{quantity:2,total_price:'20'},{quantity:3,total_price:'60'}])
  await expect(call([{item_id:a,quantity:1}])).rejects.toThrow('different cart')
})
it('rejects a new request against a closed gathering without inserting orders',async()=>{
  await expect(call(lines,'66666666-6666-4666-8666-666666666666')).rejects.toThrow('closed')
  expect((await db.query('select * from public.orders')).rows).toHaveLength(2)
})
it('rejects pending members and anonymous callers',async()=>{
  await db.exec(`update public.profiles set status='pending'`)
  await expect(call()).rejects.toThrow('Approved membership')
  await db.exec(`set test.uid=''`)
  await expect(call()).rejects.toThrow('Approved membership')
})
it('limits storage writes to approved admins and keeps receipt rows private',async()=>{
  await db.exec(`
    set test.uid='${user}';
    update public.profiles set status='approved';
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to authenticated;
    grant select on public.profiles to authenticated;
    grant insert,select,delete on storage.objects to authenticated;
    set role authenticated;
  `)
  try{
    await expect(db.exec(`insert into storage.objects values('menu-media','${user}/test.mp3')`)).rejects.toThrow('row-level security')
    await expect(db.query('select * from public.order_batch_receipts')).rejects.toThrow('permission denied')
  }finally{await db.exec('reset role')}
  await db.exec(`update public.profiles set role='admin'; set role authenticated`)
  try{await db.exec(`insert into storage.objects values('menu-media','${user}/test.mp3')`)}finally{await db.exec('reset role')}
  expect((await db.query('select * from storage.objects')).rows).toHaveLength(1)
})
