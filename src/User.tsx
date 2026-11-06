import {useEffect,useRef,useState} from 'react'
import {Coffee,Minus,Plus} from 'lucide-react'
import {sb,Item,Gath,Order,Profile,egp,dt,toast,useRealtime} from './lib'
import {Shell,btn,card} from './ui'
import {playTea,playItem} from './sound'
import {sumOrders,received,orderTotal} from './orders'
import OrderStatus from './OrderStatus'
import {allRows} from './data'

type Cart=Record<string,number>
export default function User({p,embedded=false,onOrdered}:{p:Profile;embedded?:boolean;onOrdered?:()=>void}){
  const [items,setItems]=useState<Item[]>([]),[g,setG]=useState<Gath|null>(null),[orders,setOrders]=useState<Order[]>([]),[history,setHistory]=useState('all'),[confirming,setConfirming]=useState<string|null>(null),[loadError,setLoadError]=useState('')
  const [cart,setCart]=useState<Cart>({}),[busy,setBusy]=useState(false),[tab,setTab]=useState(0)
  const gathering=useRef<string|null>(null),sending=useRef(false),revision=useRef(0)
  const attempt=useRef<{key:string;id:string}|null>(null)
  const load=async()=>{
    const current=++revision.current
    const [gs,it]=await Promise.all([
      sb.from('gatherings').select('*').eq('status','active').maybeSingle(),
      allRows<Item>(()=>sb.from('menu_items').select('*').eq('is_active',true).eq('is_archived',false).order('name').order('id'))
    ])
    if(current!==revision.current)return
    if(gs.error||it.error){setLoadError('تعذر تحديث المنيو. أعد المحاولة قبل إرسال طلب جديد.');return}
    const next=gs.data
    if(gathering.current!== (next?.id||null)){
      gathering.current=next?.id||null
      setCart({})
    }
    setG(next);setItems(it.data||[])
    const {data,error}=await allRows<Order>(()=>sb.from('orders').select('*').eq('user_id',p.id).order('created_at',{ascending:false}).order('id'))
    if(current===revision.current){if(error)setLoadError('تعذر تحديث طلباتك. الحساب المعروض قد يكون قديمًا.');else{setOrders(data||[]);setLoadError('')}}
  }
  useEffect(()=>{load();const timer=setInterval(load,30000);window.addEventListener('online',load);return()=>{revision.current++;clearInterval(timer);window.removeEventListener('online',load)}},[p.id])
  useRealtime('orders',load);useRealtime('gatherings',load);useRealtime('menu_items',load)
  const currentOrders=orders.filter(o=>o.gathering_id===g?.id)
  const total=sumOrders(currentOrders)
  const displayed=history==='current'?currentOrders:orders
  const confirmOrder=async(id:string)=>{
    if(confirming)return
    setConfirming(id)
    try{const {error}=await sb.rpc('qa_confirm_order',{p_order:id});if(error)throw error;toast('تم تأكيد الاستلام');onOrdered?.();await load()}catch{toast('تعذر تأكيد الاستلام، حاول مرة أخرى')}finally{setConfirming(null)}
  }
  const selected=items.filter(i=>cart[i.id]>0)
  const unavailable=Object.keys(cart).some(id=>cart[id]>0&&!items.some(i=>i.id===id))
  const count=selected.reduce((s,i)=>s+cart[i.id],0)
  const subtotal=selected.reduce((s,i)=>s+Number(i.price)*cart[i.id],0)
  const change=(item:Item,delta:number)=>{
    if(sending.current)return
    const quantity=cart[item.id]||0
    if(delta>0&&quantity<50)playItem(item.audio_url)
    setCart(previous=>{
      const next={...previous},q=Math.max(0,Math.min(50,(next[item.id]||0)+delta))
      if(q)next[item.id]=q;else delete next[item.id]
      return next
    })
  }
  const send=async()=>{
    if(sending.current||!g||!count||unavailable||loadError)return
    const lines=selected.map(i=>({item_id:i.id,quantity:cart[i.id]})).sort((a,b)=>a.item_id.localeCompare(b.item_id))
    const key=JSON.stringify({gathering:g.id,lines})
    if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()}
    const requestId=attempt.current.id
    sending.current=true;setBusy(true)
    try{
      const {error}=await sb.rpc('qa_submit_order_batch',{p_gathering:g.id,p_items:lines,p_request_id:requestId})
      if(error)throw error
      setCart({});attempt.current=null;setTab(1);playTea();toast('تم إرسال كل الطلبات للمدير ✅');onOrdered?.();await load()
    }catch{
      toast('تعذر تأكيد الإرسال. راجع طلباتي ثم أعد المحاولة؛ إعادة نفس السلة لا تكرر الطلب.')
    }finally{sending.current=false;setBusy(false)}
  }
  const body=<>
    {loadError&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{loadError}<button className="mr-2 underline" onClick={load}>إعادة المحاولة</button></p>}
    <div className="rounded-2xl bg-amber-800 p-5 text-center text-white"><div className="text-sm opacity-80">{g?g.title:'لا توجد قعدة نشطة'}</div><div className="mt-1 text-3xl font-bold">المستحق للقعدة الحالية: {egp(total)}</div><p className="mt-2 text-sm">قيد التحضير: {egp(sumOrders(currentOrders.filter(o=>!received(o)),false))} — لا يُضاف للحساب قبل الاستلام</p></div>
    <div className="grid grid-cols-2 gap-2">{['المنيو','طلباتي'].map((t,i)=><button key={t} onClick={()=>setTab(i)} className={'rounded-xl py-3 font-bold '+(tab===i?'bg-amber-900 text-white':'bg-white')}>{t}</button>)}</div>
    {tab===0&&(g?<div className="space-y-3">
      <p className="text-sm text-stone-600">اختار الكميات بعلامة + وبعدها ابعت طلباتك مع بعض.</p>
      <div className="grid gap-3 sm:grid-cols-2">{items.map(i=>{const q=cart[i.id]||0;return <div key={i.id} className={card+' flex items-center gap-3'}>
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-amber-50">{i.image_url?<img src={i.image_url} alt={i.name} loading="lazy" className="h-full w-full object-cover"/>:<Coffee className="text-amber-700" size={32}/>}</div>
        <div className="min-w-0 flex-1"><h2 className="break-words font-bold">{i.name}</h2><p className="text-sm text-stone-500">{egp(i.price)}</p>
          <div className="mt-2 flex items-center gap-3"><button type="button" aria-label={`زيادة ${i.name}`} disabled={busy||q>=50} onClick={()=>change(i,1)} className="rounded-full bg-amber-800 p-2 text-white disabled:opacity-40"><Plus size={18}/></button><span aria-live="polite" className="min-w-6 text-center font-bold">{q}</span><button type="button" aria-label={`تقليل ${i.name}`} disabled={busy||!q} onClick={()=>change(i,-1)} className="rounded-full bg-amber-100 p-2 disabled:opacity-40"><Minus size={18}/></button></div>
        </div>
      </div>})}</div>
      {!items.length&&<div className={card+' text-center'}>لا توجد أصناف متاحة</div>}
      {(count>0||unavailable)&&<div className={card+' sticky bottom-3 space-y-3 border border-amber-200 shadow-lg'}>
        <h2 className="font-bold">طلباتك قبل الإرسال</h2>
        {selected.map(i=><div key={i.id} className="flex justify-between gap-2 text-sm"><span>{i.name} × {cart[i.id]}</span><span>{egp(Number(i.price)*cart[i.id])}</span></div>)}
        {unavailable&&<p role="alert" className="text-sm text-red-600">فيه صنف بقى غير متاح. امسح السلة واختار من المنيو الحالي.</p>}
        <div className="flex justify-between border-t pt-2 font-bold"><span>الإجمالي ({count})</span><span>{egp(subtotal)}</span></div>
        <button type="button" className={btn+' w-full'} disabled={busy||unavailable||!count||!!loadError} onClick={send}>{busy?'جاري الإرسال...':'إرسال الطلبات للمدير'}</button>
        <button type="button" className="w-full text-sm text-stone-500 disabled:opacity-40" disabled={busy} onClick={()=>setCart({})}>مسح السلة</button>
      </div>}
    </div>:<div className={card+' text-center'}>القعدة مغلقة حالياً. انتظر المدير ليبدأ قعدة جديدة.</div>)}
    {tab===1&&<div className="space-y-3">
      <label className="block text-sm">عرض طلباتي<select className="mt-1 w-full rounded-xl border border-amber-200 bg-white p-3" value={history} onChange={e=>setHistory(e.target.value)}><option value="all">كل القعدات</option><option value="current">القعدة الحالية</option></select></label>
      <p className="text-xs text-stone-500">التذكير بعد ١٥ دقيقة يعمل داخل التطبيق أثناء فتحه فقط.</p>
      <div className={card}>إجمالي المستلم في العرض: <b>{egp(sumOrders(displayed))}</b></div>
      {displayed.map(o=><div key={o.id} className={card+' space-y-2'}><div className="flex justify-between gap-2"><div><div className="font-bold">{o.item_name_snapshot}</div><div className="text-xs text-stone-500">{egp(o.unit_price_snapshot)} × {o.quantity}</div><div className="text-xs text-stone-400">{dt(o.created_at)} · {o.gathering_id===g?.id?'القعدة الحالية':'قعدة سابقة'}</div></div><div className="font-bold">{egp(orderTotal(o))}</div></div>
        <div className="flex items-center justify-between gap-2"><OrderStatus order={o}/>{!received(o)&&<button className={btn} disabled={!!confirming} onClick={()=>confirmOrder(o.id)} aria-label={`وصل ${o.item_name_snapshot}`}>{confirming===o.id?'جاري التأكيد...':'وصل'}</button>}</div>
      </div>)}{!displayed.length&&<p className="text-center text-stone-500">لا توجد طلبات بعد</p>}
    </div>}
  </>
  return embedded?<div className="space-y-4">{body}</div>:<Shell title={`أهلاً ${p.full_name}`}>{body}</Shell>
}
