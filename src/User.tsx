import {useEffect,useRef,useState} from 'react'
import {Coffee,Minus,Plus} from 'lucide-react'
import {sb,Item,Gath,Order,Profile,egp,dt,toast,useRealtime} from './lib'
import {Shell,btn,card} from './ui'
import {playTea,playItem} from './sound'

type Cart=Record<string,number>
export default function User({p}:{p:Profile}){
  const [items,setItems]=useState<Item[]>([]),[g,setG]=useState<Gath|null>(null),[orders,setOrders]=useState<Order[]>([])
  const [cart,setCart]=useState<Cart>({}),[busy,setBusy]=useState(false),[tab,setTab]=useState(0)
  const gathering=useRef<string|null>(null),sending=useRef(false),revision=useRef(0)
  const attempt=useRef<{key:string;id:string}|null>(null)
  const load=async()=>{
    const current=++revision.current
    const [gs,it]=await Promise.all([
      sb.from('gatherings').select('*').eq('status','active').maybeSingle(),
      sb.from('menu_items').select('*').eq('is_active',true).eq('is_archived',false).order('name')
    ])
    if(current!==revision.current)return
    if(gs.error||it.error){toast('تعذر تحديث المنيو، حاول مرة أخرى');return}
    const next=gs.data
    if(gathering.current!== (next?.id||null)){
      gathering.current=next?.id||null
      setCart({})
    }
    setG(next);setItems(it.data||[])
    if(next){
      const {data,error}=await sb.from('orders').select('*').eq('gathering_id',next.id).eq('user_id',p.id).order('created_at',{ascending:false})
      if(current===revision.current&&!error)setOrders(data||[])
    }else setOrders([])
  }
  useEffect(()=>{load();return()=>{revision.current++}},[p.id])
  useRealtime('orders',load);useRealtime('gatherings',load);useRealtime('menu_items',load)
  const total=orders.reduce((s,o)=>s+Number(o.total_price),0)
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
    if(sending.current||!g||!count||unavailable)return
    const lines=selected.map(i=>({item_id:i.id,quantity:cart[i.id]})).sort((a,b)=>a.item_id.localeCompare(b.item_id))
    const key=JSON.stringify({gathering:g.id,lines})
    if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()}
    const requestId=attempt.current.id
    sending.current=true;setBusy(true)
    try{
      const {error}=await sb.rpc('add_orders',{p_gathering:g.id,p_items:lines,p_request_id:requestId})
      if(error)throw error
      setCart({});attempt.current=null;setTab(1);playTea();toast('تم إرسال كل الطلبات للمدير ✅');await load()
    }catch{
      toast('تعذر تأكيد الإرسال. راجع طلباتي ثم أعد المحاولة؛ إعادة نفس السلة لا تكرر الطلب.')
    }finally{sending.current=false;setBusy(false)}
  }
  return <Shell title={`أهلاً ${p.full_name}`}>
    <div className="rounded-2xl bg-amber-800 p-5 text-center text-white"><div className="text-sm opacity-80">{g?g.title:'لا توجد قعدة نشطة'}</div><div className="mt-1 text-3xl font-bold">حسابك لحد دلوقتي: {egp(total)}</div></div>
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
        <button type="button" className={btn+' w-full'} disabled={busy||unavailable||!count} onClick={send}>{busy?'جاري الإرسال...':'إرسال الطلبات للمدير'}</button>
        <button type="button" className="w-full text-sm text-stone-500 disabled:opacity-40" disabled={busy} onClick={()=>setCart({})}>مسح السلة</button>
      </div>}
    </div>:<div className={card+' text-center'}>القعدة مغلقة حالياً. انتظر المدير ليبدأ قعدة جديدة.</div>)}
    {tab===1&&<div className="space-y-2">{orders.map(o=><div key={o.id} className={card+' flex justify-between'}><div><div className="font-bold">{o.item_name_snapshot}</div><div className="text-xs text-stone-500">{egp(o.unit_price_snapshot)} × {o.quantity}</div><div className="text-xs text-stone-400">{dt(o.created_at)}</div></div><div className="font-bold">{egp(o.total_price)}</div></div>)}{!orders.length&&<p className="text-center text-stone-500">لا توجد طلبات بعد</p>}</div>}
  </Shell>
}
