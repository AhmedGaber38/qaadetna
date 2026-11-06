import {useCallback,useEffect,useRef,useState} from 'react'
import {sb,toast,useRealtime} from './lib'
import {btn,btn2} from './ui'
const visible=()=>document.visibilityState!=='hidden'
type Reminder={order_id:string;item_name:string;quantity:number;claim_token:string}
export default function OrderReminders({userId}:{userId:string}){
  const [reminder,setReminder]=useState<Reminder|null>(null),[busy,setBusy]=useState(false)
  const current=useRef<Reminder|null>(null),running=useRef(false),mounted=useRef(true),action=useRef(false)
  const expiryTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const show=(value:Reminder|null,deadline=performance.now()+60000)=>{
    if(expiryTimer.current)clearTimeout(expiryTimer.current)
    // The server leases for 90s. A conservative 60s client deadline, measured
    // from REQUEST START, hides a popup even if renewal hangs or loses network.
    const next=value&&performance.now()<deadline?value:null
    current.current=next
    if(next)expiryTimer.current=setTimeout(()=>show(null),Math.max(0,deadline-performance.now()))
    if(mounted.current)setReminder(next)
  }
  const poll=useCallback(async()=>{
    if(running.current||action.current||!visible())return
    running.current=true
    const deadline=performance.now()+60000
    try{
      if(current.current){
        const r=current.current
        const {data,error}=await sb.rpc('qa_renew_reminder',{p_order:r.order_id,p_token:r.claim_token})
        if(mounted.current&&current.current?.claim_token===r.claim_token)show(!data||error?null:r,deadline)
      }else{
        const {data,error}=await sb.rpc('qa_claim_reminder')
        if(mounted.current&&visible()&&!error&&data?.[0])show(data[0],deadline)
      }
    }catch{show(null) /* Never leave a stale lease visible offline. */}
    finally{running.current=false}
  },[userId])
  useEffect(()=>{
    mounted.current=true;poll()
    const timer=setInterval(poll,30000)
    const visibility=()=>{if(document.visibilityState==='hidden')show(null);else poll()}
    document.addEventListener('visibilitychange',visibility);window.addEventListener('online',poll)
    return()=>{mounted.current=false;if(expiryTimer.current)clearTimeout(expiryTimer.current);clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',poll)}
  },[poll])
  // Realtime handlers must only read: renewing a lease here would create an
  // UPDATE -> Realtime -> renew UPDATE feedback loop.
  useRealtime('orders',async()=>{
    const r=current.current
    if(!r){poll();return}
    try{
      const {data,error}=await sb.from('orders').select('delivery_status,reminder_claim_token').eq('id',r.order_id).maybeSingle()
      if(mounted.current&&current.current?.claim_token===r.claim_token&&!error&&(!data||data.delivery_status!=='pending'||data.reminder_claim_token!==r.claim_token))show(null)
    }catch{/* The regular heartbeat will reconcile after connectivity returns. */}
  })
  const respond=async(done:boolean)=>{
    const r=current.current;if(!r||action.current)return
    action.current=true;setBusy(true)
    try{
      const {error}=await sb.rpc(done?'qa_confirm_order':'qa_snooze_order',done?{p_order:r.order_id}:{p_order:r.order_id,p_token:r.claim_token})
      if(error)throw error
      show(null);toast(done?'تم تأكيد الاستلام':'هنفكّرك بعد ١٥ دقيقة')
    }catch{toast('تعذر حفظ الرد. حاول مرة أخرى')}
    finally{action.current=false;if(mounted.current)setBusy(false)}
  }
  if(!reminder)return null
  return <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="reminder-title" className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
    <h2 id="reminder-title" className="text-xl font-bold text-amber-900">مشروبك وصل؟</h2>
    <p>{reminder.item_name} × {reminder.quantity}</p>
    <div className="grid grid-cols-2 gap-3"><button autoFocus className={btn} disabled={busy} onClick={()=>respond(true)}>وصل</button><button className={btn2} disabled={busy} onClick={()=>respond(false)}>لسه</button></div>
    <p className="text-xs text-stone-500">تذكير داخل التطبيق. اختيار «لسه» يؤجل التذكير ١٥ دقيقة.</p>
  </section></div>
}
