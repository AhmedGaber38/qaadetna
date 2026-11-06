import {useEffect,useRef,useState} from 'react'
import {Pencil,Trash2} from 'lucide-react'
import {sb,Profile,Item,Gath,Order,egp,dt,toast,useRealtime} from './lib'
import {Shell,btn,btn2,inp,card} from './ui'
import MenuItemEditor from './MenuItemEditor'

export default function Admin(){
  const [tab,setTab]=useState('orders'),[users,setUsers]=useState<Profile[]>([]),[items,setItems]=useState<Item[]>([]),[gs,setGs]=useState<Gath[]>([]),[orders,setOrders]=useState<Order[]>([])
  const [gid,setGid]=useState(''),ref=useRef(''),[search,setSearch]=useState(''),[day,setDay]=useState(''),[editing,setEditing]=useState<Item|null>(null),[title,setTitle]=useState('')
  const load=async()=>{
    const [u,i,g]=await Promise.all([sb.from('profiles').select('*').order('created_at',{ascending:false}),sb.from('menu_items').select('*').order('created_at'),sb.from('gatherings').select('*').order('started_at',{ascending:false})])
    setUsers(u.data||[]);setItems(i.data||[]);setGs(g.data||[])
    if(!ref.current){ref.current=(g.data?.find(x=>x.status==='active')||g.data?.[0])?.id||'';setGid(ref.current)}
    if(ref.current){const {data}=await sb.from('orders').select('*').eq('gathering_id',ref.current).order('created_at',{ascending:false});setOrders(data||[])}else setOrders([])
  }
  useEffect(()=>{load()},[])
  useRealtime('orders',load);useRealtime('profiles',load);useRealtime('menu_items',load);useRealtime('gatherings',load)
  const pick=(id:string)=>{ref.current=id;setGid(id);load()}
  const U=(id:string)=>users.find(u=>u.id===id)
  const res=(error:any,ok:string)=>{toast(error?'حدث خطأ، حاول مرة أخرى':ok);load()}
  const shown=orders.filter(o=>{const u=U(o.user_id);return (!search||(u?.username+' '+u?.full_name).toLowerCase().includes(search.toLowerCase()))&&(!day||o.created_at.slice(0,10)===day)})
  const sums=users.filter(u=>u.status==='approved').map(u=>({u,t:orders.filter(o=>o.user_id===u.id).reduce((s,o)=>s+Number(o.total_price),0)}))
  const grand=orders.reduce((s,o)=>s+Number(o.total_price),0)
  const active=gs.find(g=>g.status==='active')
  const editOrder=async(o:Order)=>{
    const qty=Number(prompt('الكمية',String(o.quantity))),pr=Number(prompt('سعر الوحدة',String(o.unit_price_snapshot)))
    if(!qty||qty<1||qty>50||isNaN(pr)||pr<0)return
    const {error}=await sb.from('orders').update({quantity:qty,unit_price_snapshot:pr}).eq('id',o.id);res(error,'تم التعديل')
  }
  const delOrder=async(o:Order)=>{if(!confirm('هل تريد حذف هذا الطلب؟'))return;const {error}=await sb.from('orders').delete().eq('id',o.id);res(error,'تم الحذف')}
  const setStatus=async(id:string,status:string)=>{const {error}=await sb.from('profiles').update({status}).eq('id',id);res(error,'تم التحديث')}
  const tabs:[string,string][]=[['orders','الطلبات'],['users','الأعضاء'],['menu','المنيو'],['gath','القعدات']]
  return <Shell title="لوحة المدير">
    <div className="grid grid-cols-4 gap-1">{tabs.map(([k,l])=><button key={k} onClick={()=>setTab(k)} className={'rounded-xl py-3 text-sm font-bold '+(tab===k?'bg-amber-900 text-white':'bg-white')}>{l}{k==='users'&&users.some(u=>u.status==='pending')?' •':''}</button>)}</div>
    {tab==='orders'&&<>
      <select className={inp} value={gid} onChange={e=>pick(e.target.value)}>{gs.map(g=><option key={g.id} value={g.id}>{g.title} — {g.status==='active'?'نشطة':'مغلقة'}</option>)}</select>
      <div className="rounded-2xl bg-amber-800 p-4 text-center text-white"><div className="text-sm">إجمالي القعدة</div><div className="text-3xl font-bold">{egp(grand)}</div></div>
      <div className={card}>{sums.map(s=><div key={s.u.id} className="flex justify-between border-b border-amber-50 py-1"><span>{s.u.full_name}</span><b>{egp(s.t)}</b></div>)}</div>
      <div className="grid grid-cols-2 gap-2"><input className={inp} placeholder="بحث بالاسم" value={search} onChange={e=>setSearch(e.target.value)}/><input className={inp} type="date" value={day} onChange={e=>setDay(e.target.value)}/></div>
      {shown.map(o=><div key={o.id} className={card+' flex items-center justify-between gap-2'}><div><div className="font-bold">{U(o.user_id)?.full_name} · {o.item_name_snapshot}</div><div className="text-xs text-stone-500">{egp(o.unit_price_snapshot)} × {o.quantity} = {egp(o.total_price)}</div><div className="text-xs text-stone-400">{dt(o.created_at)}</div></div>
        <div className="flex gap-1"><button className={btn2} onClick={()=>editOrder(o)}><Pencil size={16}/></button><button className={btn2} onClick={()=>delOrder(o)}><Trash2 size={16}/></button></div></div>)}
    </>}
    {tab==='users'&&users.map(u=><div key={u.id} className={card+' space-y-2'}><div className="flex justify-between"><div><b>{u.full_name}</b> <span className="text-xs text-stone-500" dir="ltr">@{u.username}</span></div><span className="text-xs">{({pending:'قيد المراجعة',approved:'مفعّل',rejected:'مرفوض',suspended:'موقوف'} as any)[u.status]}</span></div>
      {u.role!=='admin'&&<div className="flex flex-wrap gap-2">
        {(u.status==='pending'||u.status==='rejected')&&<button className={btn2} onClick={()=>setStatus(u.id,'approved')}>قبول</button>}
        {u.status==='pending'&&<button className={btn2} onClick={()=>setStatus(u.id,'rejected')}>رفض</button>}
        {u.status==='approved'&&<button className={btn2} onClick={()=>setStatus(u.id,'suspended')}>إيقاف</button>}
        {u.status==='suspended'&&<button className={btn2} onClick={()=>setStatus(u.id,'approved')}>إعادة تفعيل</button>}
        <button className={btn2} onClick={()=>{setSearch(u.username);setTab('orders')}}>طلباته</button></div>}</div>)}
    {tab==='menu'&&<>
      <MenuItemEditor key={editing?.id||'new'} item={editing||undefined} onSaved={()=>{setEditing(null);load()}} onCancel={editing?()=>setEditing(null):undefined}/>
      {items.filter(i=>!i.is_archived).map(i=><div key={i.id} className={card+' flex items-center justify-between gap-2'}><div className="flex min-w-0 items-center gap-3">{i.image_url&&<img src={i.image_url} alt={i.name} loading="lazy" className="h-14 w-14 rounded-lg object-cover"/>}<div><b>{i.name}</b><div className="text-sm text-stone-500">{egp(i.price)}</div>{i.audio_url&&<span className="text-xs text-amber-800">صوت MP3 مضاف</span>}</div></div>
        <div className="flex gap-1"><button className={btn2} aria-label={`تعديل ${i.name}`} onClick={()=>{setEditing(i)}}><Pencil size={16}/></button>
        <button className={btn2} onClick={async()=>{const {error}=await sb.from('menu_items').update({is_active:!i.is_active}).eq('id',i.id);res(error,'تم')}}>{i.is_active?'إيقاف':'تفعيل'}</button>
        <button className={btn2} onClick={async()=>{if(!confirm('حذف الصنف؟ (يُؤرشف إن كان له طلبات سابقة)'))return;const {error}=await sb.rpc('delete_or_archive_item',{p_id:i.id});res(error,'تم')}}><Trash2 size={16}/></button></div></div>)}
    </>}
    {tab==='gath'&&<>
      <div className={card+' space-y-2'}>{active?<><p>القعدة النشطة: <b>{active.title}</b></p><button className={btn+' w-full'} onClick={async()=>{if(!confirm('إغلاق القعدة الحالية؟'))return;const {error}=await sb.rpc('close_gathering');res(error,'تم إغلاق القعدة')}}>إغلاق القعدة</button></>:<><input className={inp} placeholder="اسم القعدة (اختياري)" value={title} onChange={e=>setTitle(e.target.value)}/><button className={btn+' w-full'} onClick={async()=>{const {data,error}=await sb.rpc('start_gathering',{p_title:title});if(data?.id)pick(data.id);setTitle('');res(error,'بدأت قعدة جديدة')}}>بدء قعدة جديدة</button></>}</div>
      {gs.map(g=><div key={g.id} className={card+' flex items-center justify-between'}><div><b>{g.title}</b><div className="text-xs text-stone-500">{dt(g.started_at)}{g.closed_at?' → '+dt(g.closed_at):''}</div></div><button className={btn2} onClick={()=>{pick(g.id);setTab('orders')}}>عرض</button></div>)}
    </>}
  </Shell>
}
