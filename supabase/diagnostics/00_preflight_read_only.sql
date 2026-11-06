-- Optional owner-only inspection before applying upgrades. This file is READ ONLY.
select table_name,column_name,data_type,is_generated,column_default
from information_schema.columns where table_schema='public'
and table_name in ('profiles','orders','gatherings','menu_items') order by table_name,ordinal_position;

select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname in ('public','storage') order by schemaname,tablename,policyname;

select p.oid::regprocedure as function_name,p.prosecdef as security_definer,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as browser_can_execute,
  p.proconfig as function_settings
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by function_name::text;

select count(*) as active_gatherings from public.gatherings where status='active';
select id,user_id,quantity,unit_price_snapshot,total_price,
       quantity*unit_price_snapshot as calculated_snapshot_total
from public.orders where total_price is distinct from quantity*unit_price_snapshot;
-- Differences are reported, NOT overwritten. New billing uses snapshot quantity × price.

select id,user_id,quantity,unit_price_snapshot from public.orders
where quantity is null or quantity<1 or unit_price_snapshot is null or unit_price_snapshot<0;
-- If extra custom SECURITY DEFINER APIs exist, inspect their own authorization too.
-- The upgrade revokes the five known legacy mutation APIs from browser roles.
