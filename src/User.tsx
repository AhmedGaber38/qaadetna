import {useEffect,useState} from 'react'
import {Minus,Plus} from 'lucide-react'
import {sb,Item,Gath,Order,Profile,egp,dt,toast,useRealtime} from './lib'
import {Shell,btn,card} from './ui'
import {playTea} from './sound'

export default function User({p}:{p:Profile}){
  const [items,setItems]=useState<Item[]>([]),[g,setG]=useState<Gath|null>(null),[orders,setOrders]=useState<Order[]>([])
  const [sel,setSel]=useState(''),[q,setQ]=useState(1),[busy,setBusy]=useState(false),[tab,setTab]=useState(0)
  const load=async()=>{
    const {data:gs}=await sb.from('gatherings').select('*').eq('status','active').maybeSingle();setG(gs)
    const {data:it}=await sb.from('menu_items').select('*').eq('is_active',true).eq('is_archived',false).order('name');setItems(it||[])
    if(gs){const {data:o}=await sb.from('orders').select('*').eq('gathering_id',gs.id).order('created_at',{ascending:false});setOrders(o||[])}else setOrders([])
  }
  useEffect(()=>{load()},[])
  useRealtime('orders',load);useRealtime('gatherings',load);useRealtime('menu_items',load)
  const total=orders.reduce((s,o)=>s+Number(o.total_price),0)
  const add=async()=>{
    if(busy||!sel)return;setBusy(true)
    const {error}=await sb.rpc('add_order',{p_item:sel,p_qty:q});setBusy(false)
    if(error)toast('تعذر إضافة الطلب، ربما القعدة مغلقة')
    else{toast('تمت إضافة الطلب ✅');playTea();setSel('');setQ(1);setTab(1);load()}
  }
  const it=items.find(i=>i.id===sel)
  return <Shell title={`أهلاً ${p.full_name}`}>
    <div className="rounded-2xl bg-amber-800 p-5 text-center text-white"><div className="text-sm opacity-80">{g?g.title:'لا توجد قعدة نشطة'}</div><div className="mt-1 text-3xl font-bold">حسابك لحد دلوقتي: {egp(total)}</div></div>
    <div className="grid grid-cols-2 gap-2">{['إضافة طلب','طلباتي'].map((t,i)=><button key={t} onClick={()=>setTab(i)} className={'rounded-xl py-3 font-bold '+(tab===i?'bg-amber-900 text-white':'bg-white')}>{t}</button>)}</div>
    {tab===0&&(g?<div className={card+' space-y-3'}>
      <div className="grid grid-cols-2 gap-2">{items.map(i=><button key={i.id} onClick={()=>setSel(i.id)} className={'rounded-xl border-2 p-3 text-start '+(sel===i.id?'border-amber-800 bg-amber-50':'border-amber-100')}><div className="font-bold">{i.name}</div><div className="text-sm text-stone-500">{egp(i.price)}</div></button>)}</div>
      {!items.length&&<p className="text-center text-stone-500">لا توجد أصناف متاحة</p>}
      <div className="flex items-center justify-center gap-5"><button onClick={()=>setQ(Math.max(1,q-1))} className="rounded-full bg-amber-100 p-3"><Minus/></button><span className="text-2xl font-bold">{q}</span><button onClick={()=>setQ(Math.min(50,q+1))} className="rounded-full bg-amber-100 p-3"><Plus/></button></div>
      <button className={btn+' w-full'} disabled={!sel||busy} onClick={add}>{busy?'...':'إضافة الطلب'}{it&&` (${egp(it.price*q)})`}</button>
    </div>:<div className={card+' text-center'}>القعدة مغلقة حالياً. انتظر المدير ليبدأ قعدة جديدة.</div>)}
    {tab===1&&<div className="space-y-2">{orders.map(o=><div key={o.id} className={card+' flex justify-between'}><div><div className="font-bold">{o.item_name_snapshot}</div><div className="text-xs text-stone-500">{egp(o.unit_price_snapshot)} × {o.quantity}</div><div className="text-xs text-stone-400">{dt(o.created_at)}</div></div><div className="font-bold">{egp(o.total_price)}</div></div>)}{!orders.length&&<p className="text-center text-stone-500">لا توجد طلبات بعد</p>}</div>}
  </Shell>
}
