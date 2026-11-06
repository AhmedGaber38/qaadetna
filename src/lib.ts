import {createClient} from '@supabase/supabase-js'
import {useEffect,useRef} from 'react'
import {formatDate} from './orders'
export type Rec={n:string;ms:number;ok:boolean}
const recs:Rec[]=[]
const subs=new Set<()=>void>()
export const getRecs=()=>recs
export const onRecs=(f:()=>void)=>{subs.add(f);return()=>{subs.delete(f)}}
const label=(u:string,m:string)=>{try{return m+' '+new URL(u).pathname.replace('/rest/v1/','').replace('/auth/v1/','auth/')}catch(e){return m}}
const tfetch=async(input:any,init?:any)=>{
  const t=performance.now()
  const url=typeof input==='string'?input:(input&&input.url)||String(input)
  const m=(init&&init.method)||(input&&input.method)||'GET'
  let ok=true
  try{const r=await fetch(input,init);ok=r.ok;return r}catch(e){ok=false;throw e}
  finally{recs.unshift({n:label(url,m),ms:Math.round(performance.now()-t),ok});if(recs.length>14)recs.pop();subs.forEach(f=>f())}
}
export const sb=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY,{global:{fetch:tfetch as any}})
export type Profile={id:string;full_name:string;username:string;role:string;status:string;created_at:string}
export type Item={id:string;name:string;price:number;is_active:boolean;is_archived:boolean;image_url?:string|null;audio_url?:string|null}
export type Gath={id:string;title:string;status:string;started_at:string;closed_at:string|null}
export type Order={id:string;user_id:string;gathering_id:string;item_name_snapshot:string;unit_price_snapshot:number;quantity:number;total_price:number;created_at:string;delivery_status?:'pending'|'received';received_at?:string|null;next_reminder_at?:string|null}
export const egp=(n:number)=>new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(n)+' جنيه'
export const dt=formatDate
export const EMAIL_DOMAIN=(import.meta.env.VITE_EMAIL_DOMAIN as string)||'qaadetna.local'
export const email=(u:string)=>`${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`
export const toast=(m:string)=>window.dispatchEvent(new CustomEvent('toast',{detail:m}))
export function useRealtime(table:string,cb:()=>void){
  const r=useRef(cb);r.current=cb
  useEffect(()=>{const ch=sb.channel('rt-'+table+Math.random()).on('postgres_changes',{event:'*',schema:'public',table},()=>r.current()).subscribe();return()=>{sb.removeChannel(ch)}},[table])
}
