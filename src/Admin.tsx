import {useEffect,useRef,useState} from 'react'
import {Pencil,Trash2} from 'lucide-react'
import {sb,Profile,Item,Gath,Order,egp,dt,toast,useRealtime} from './lib'
import {Shell,btn,btn2,inp,card} from './ui'
import MenuItemEditor from './MenuItemEditor'
import User from './User'
import Invoices from './Invoices'
import MemberManagement from './MemberManagement'
import AdminNotifications from './AdminNotifications'
import {sumOrders,received,dateKey} from './orders'
import {allRows} from './data'

export default function Admin({p}:{p:Profile}){
  const [tab,setTab]=useState('orders'),[users,setUsers]=useState<Profile[]>([]),[items,setItems]=useState<Item[]>([]),[gs,setGs]=useState<Gath[]>([]),[orders,setOrders]=useState<Order[]>([])
  const [gid,setGid]=useState(''),ref=useRef(''),[search,setSearch]=useState(''),[day,setDay]=useState(''),[editing,setEditing]=useState<Item|null>(null),[title,setTitle]=useState(''),[loadError,setLoadError]=useState(''),[busy,setBusy]=useState(false),[edit,setEdit]=useState<Order|null>(null),[qty,setQty]=useState('1'),[price,setPrice]=useState('0')
  const version=useRef(0),lock=useRef(false),alive=useRef(true)
  const load=async()=>{
    const request=++version.current
    try{
      const [u,i,g]=await Promise.all([allRows<Profile>(()=>sb.from('profiles').select('*').order('created_at',{ascending:false}).order('id')),allRows<Item>(()=>sb.from('menu_items').select('*').order('created_at').order('id')),allRows<Gath>(()=>sb.from('gatherings').select('*').order('started_at',{ascending:false}).order('id'))])
      if(!alive.current||request!==version.current)return
      if(u.error||i.error||g.error)throw new Error('Load failed')
      setUsers(u.data||[]);setItems(i.data||[]);setGs(g.data||[])
      if(!ref.current||!g.data?.some(x=>x.id===ref.current)){ref.current=(g.data?.find(x=>x.status==='active')||g.data?.[0])?.id||'';setGid(ref.current)}
      if(ref.current){const {data,error}=await allRows<Order>(()=>sb.from('orders').select('*').eq('gathering_id',ref.current).order('created_at',{ascending:false}).order('id'));if(request!==version.current||!alive.current)return;if(error)throw error;setOrders(data||[])}else setOrders([])
      setLoadError('')
    }catch{if(alive.current&&request===version.current)setLoadError('تعذر تحديث بيانات الإدارة. البيانات المعروضة قد تكون قديمة.')}
  }
  useEffect(()=>{alive.current=true;load();const timer=setInterval(load,30000);return()=>{alive.current=false;version.current++;clearInterval(timer)}},[])
  useRealtime('orders',load);useRealtime('profiles',load);useRealtime('menu_items',load);useRealtime('gatherings',load)
  const pick=(id:string)=>{ref.current=id;setGid(id);load()}
  const U=(id:string)=>users.find(u=>u.id===id)
  const res=(error:any,ok:string)=>{toast(error?'حدث خطأ، حاول مرة أخرى':ok);load()}
  const shown=orders.filter(o=>{const u=U(o.user_id);return (!search||((u?.username||'')+' '+(u?.full_name||'')).toLowerCase().includes(search.toLowerCase()))&&(!day||dateKey(o.created_at)===day)})
  const grand=sumOrders(orders)
  const active=gs.find(g=>g.status==='active')
  const perform=async(name:string,args:Record<string,unknown>,message:string)=>{
    if(lock.current)return false;lock.current=true;setBusy(true)
    try{const {error}=await sb.rpc(name,args);if(error)throw error;toast(message);await load();return true}catch{toast('تعذر تنفيذ العملية، حاول مرة أخرى');return false}finally{lock.current=false;setBusy(false)}
  }
  const editOrder=(o:Order)=>{setEdit(o);setQty(String(o.quantity));setPrice(String(o.unit_price_snapshot))}
  const delOrder=(o:Order)=>{if(confirm('حذف الطلب نهائيًا؟ سيتغير إجمالي فاتورة العضو.'))perform('qa_admin_delete_order',{p_order:o.id},'تم حذف الطلب')}
  const tabs:[string,string][]=[['orders','الفواتير'],['self','اطلب لنفسي'],['users','الأعضاء'],['menu','المنيو'],['gath','القعدات']]
  return <Shell title="لوحة المدير">
    <AdminNotifications userId={p.id}/>
    {loadError&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{loadError}<button className={btn2+' mr-2'} onClick={load}>إعادة المحاولة</button></p>}
    <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">{tabs.map(([k,l])=><button key={k} onClick={()=>setTab(k)} className={'rounded-xl py-3 text-sm font-bold '+(tab===k?'bg-amber-900 text-white':'bg-white')}>{l}{k==='users'&&users.some(u=>u.status==='pending')?' •':''}</button>)}</div>
    {tab==='orders'&&<>
      <select className={inp} value={gid} onChange={e=>pick(e.target.value)}>{gs.map(g=><option key={g.id} value={g.id}>{g.title} — {g.status==='active'?'نشطة':'مغلقة'}</option>)}</select>
      <div className="rounded-2xl bg-amber-800 p-4 text-center text-white"><div className="text-sm">إجمالي المستلم المستحق للقعدة</div><div className="text-3xl font-bold">{egp(grand)}</div><p className="mt-2 text-sm">قيد التحضير: {egp(sumOrders(orders.filter(o=>!received(o)),false))} (غير محتسب)</p></div>
      <div className="grid grid-cols-2 gap-2"><label className="text-sm">بحث بالاسم<input className={inp} placeholder="بحث بالاسم" value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="text-sm">تاريخ الطلب (القاهرة)<input className={inp} type="date" value={day} onChange={e=>setDay(e.target.value)}/></label></div>
      <p className="text-sm text-stone-500">افتح اسم العضو لعرض تفاصيل فاتورته. المستحق للطلبات المعروضة: {egp(sumOrders(shown))}</p>
      <Invoices orders={shown} users={users} onEdit={editOrder} onDelete={delOrder} busy={busy}/>
    </>}
    {tab==='self'&&<User p={p} embedded onOrdered={load}/>}
    {tab==='users'&&<MemberManagement users={users} onChanged={load}/>}
    {tab==='menu'&&<>
      <MenuItemEditor key={editing?.id||'new'} item={editing||undefined} onSaved={()=>{setEditing(null);load()}} onCancel={editing?()=>setEditing(null):undefined}/>
      {items.filter(i=>!i.is_archived).map(i=><div key={i.id} className={card+' flex items-center justify-between gap-2'}><div className="flex min-w-0 items-center gap-3">{i.image_url&&<img src={i.image_url} alt={i.name} loading="lazy" className="h-14 w-14 rounded-lg object-cover"/>}<div><b>{i.name}</b><div className="text-sm text-stone-500">{egp(i.price)}</div>{i.audio_url&&<span className="text-xs text-amber-800">صوت MP3 مضاف</span>}</div></div>
        <div className="flex gap-1"><button className={btn2} aria-label={`تعديل ${i.name}`} onClick={()=>{setEditing(i)}}><Pencil size={16}/></button>
        <button className={btn2} onClick={async()=>{const {error}=await sb.from('menu_items').update({is_active:!i.is_active}).eq('id',i.id);res(error,'تم')}}>{i.is_active?'إيقاف':'تفعيل'}</button>
        <button className={btn2} onClick={async()=>{if(!confirm('أرشفة الصنف وإخفاؤه من المنيو؟ ستظل الطلبات السابقة محفوظة.'))return;const {error}=await sb.rpc('qa_delete_or_archive_item',{p_id:i.id});res(error,'تم')}}><Trash2 size={16}/></button></div></div>)}
    </>}
    {tab==='gath'&&<>
      <div className={card+' space-y-2'}>{active?<><p>القعدة النشطة: <b>{active.title}</b></p><button className={btn+' w-full'} disabled={busy} onClick={()=>{if(confirm('إغلاق القعدة الحالية؟ الطلبات قيد التحضير تظل غير مستحقة حتى يؤكد صاحبها الاستلام.'))perform('qa_close_gathering',{},'تم إغلاق القعدة')}}>إغلاق القعدة</button></>:<><input className={inp} placeholder="اسم القعدة (اختياري)" value={title} onChange={e=>setTitle(e.target.value)}/><button className={btn+' w-full'} disabled={busy} onClick={async()=>{if(await perform('qa_start_gathering',{p_title:title},'بدأت قعدة جديدة')){ref.current='';setTitle('');load()}}}>بدء قعدة جديدة</button></>}</div>
      {gs.map(g=><div key={g.id} className={card+' flex items-center justify-between'}><div><b>{g.title}</b><div className="text-xs text-stone-500">{dt(g.started_at)}{g.closed_at?' → '+dt(g.closed_at):''}</div></div><button className={btn2} onClick={()=>{pick(g.id);setTab('orders')}}>عرض</button></div>)}
    </>}
    {edit&&<div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-4"><form role="dialog" aria-modal="true" aria-label="تعديل الطلب" className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5" onSubmit={async e=>{e.preventDefault();if(await perform('qa_admin_update_order',{p_order:edit.id,p_qty:Number(qty),p_price:Number(price)},'تم تعديل الطلب'))setEdit(null)}}>
      <h2 className="font-bold">تعديل {edit.item_name_snapshot}</h2><p className="text-xs text-stone-500">هذا تعديل صريح للفاتورة؛ تغيير سعر المنيو لا يعدل الطلبات القديمة.</p>
      <label className="block text-sm">الكمية<input className={inp} type="number" min="1" max="50" step="1" required value={qty} disabled={busy} onChange={e=>setQty(e.target.value)}/></label><label className="block text-sm">سعر الوحدة وقت الطلب<input className={inp} type="number" min="0" step="0.01" required value={price} disabled={busy} onChange={e=>setPrice(e.target.value)}/></label>
      <div className="flex gap-2"><button className={btn} disabled={busy}>حفظ</button><button type="button" className={btn2} disabled={busy} onClick={()=>setEdit(null)}>إلغاء</button></div>
    </form></div>}
  </Shell>
}
