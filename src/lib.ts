import {createClient} from '@supabase/supabase-js'
import {useEffect,useRef} from 'react'
export const sb=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY)
export type Profile={id:string;full_name:string;username:string;role:string;status:string;created_at:string}
export type Item={id:string;name:string;price:number;is_active:boolean;is_archived:boolean}
export type Gath={id:string;title:string;status:string;started_at:string;closed_at:string|null}
export type Order={id:string;user_id:string;gathering_id:string;item_name_snapshot:string;unit_price_snapshot:number;quantity:number;total_price:number;created_at:string}
export const egp=(n:number)=>new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(n)+' جنيه'
export const dt=(s:string)=>new Date(s).toLocaleString('ar-EG')
export const EMAIL_DOMAIN=(import.meta.env.VITE_EMAIL_DOMAIN as string)||'qaadetna.local'
export const email=(u:string)=>`${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`
export const toast=(m:string)=>window.dispatchEvent(new CustomEvent('toast',{detail:m}))
export function useRealtime(table:string,cb:()=>void){
  const r=useRef(cb);r.current=cb
  useEffect(()=>{const ch=sb.channel('rt-'+table+Math.random()).on('postgres_changes',{event:'*',schema:'public',table},()=>r.current()).subscribe();return()=>{sb.removeChannel(ch)}},[table])
}
