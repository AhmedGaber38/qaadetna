import {useEffect,useRef,useState} from 'react'
import {sb,toast,useRealtime} from './lib'
import {btn2} from './ui'
type Notice={id:string;order_id:string;member_name:string;item_name:string;quantity:number}
export default function AdminNotifications({userId}:{userId:string}){
  const [notices,setNotices]=useState<Notice[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(false)
  const revision=useRef(0),alive=useRef(true)
  const load=async()=>{
    const version=++revision.current
    try{
      const {data,error}=await sb.from('admin_order_notifications').select('*').eq('admin_id',userId).is('read_at',null).order('created_at',{ascending:false}).limit(100)
      if(alive.current&&version===revision.current){setError(!!error);if(!error)setNotices([...new Map((data||[]).map(n=>[n.order_id,n])).values()] as Notice[])}
    }catch{if(alive.current)setError(true)}
  }
  useEffect(()=>{alive.current=true;load();const timer=setInterval(load,30000);window.addEventListener('online',load);return()=>{alive.current=false;revision.current++;clearInterval(timer);window.removeEventListener('online',load)}},[userId])
  useRealtime('admin_order_notifications',load)
  const read=async()=>{
    if(busy)return;setBusy(true)
    try{const {error}=await sb.rpc('qa_read_notifications',{p_ids:notices.map(n=>n.id)});if(error)throw error;await load()}catch{toast('تعذر حفظ قراءة الإشعارات')}finally{setBusy(false)}
  }
  if(error)return <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm">تعذر تحديث إشعارات الطلبات. ستتم إعادة المحاولة تلقائيًا.</p>
  if(!notices.length)return null
  return <aside aria-label="طلبات جديدة" className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-4"><div className="flex items-center justify-between gap-2"><h2 className="font-bold">طلبات جديدة ({notices.length}{notices.length===100?'+':''})</h2><button className={btn2} disabled={busy} onClick={read}>تم الاطلاع</button></div>
    <div className="max-h-40 space-y-1 overflow-auto">{notices.map(n=><p key={n.order_id} className="text-sm">{n.member_name}: {n.item_name} × {n.quantity}</p>)}</div>
    <p className="text-xs text-stone-500">إشعارات داخل التطبيق؛ لا تصل عند إغلاقه.</p>
  </aside>
}
