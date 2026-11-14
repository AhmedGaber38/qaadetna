import {useState} from 'react'
import {Pencil,Trash2} from 'lucide-react'
import {Order,Profile,dt,egp} from './lib'
import {Account,PAY_LABEL,Payment,accountOrders,accountPending,accountTotal,sessionStats,stateLabel} from './accounts'
import {btn,btn2,card,inp} from './ui'
import OrderStatus from './OrderStatus'
import {received} from './orders'
type Props={accounts:Account[];payments:Payment[];orders:Order[];users:Profile[];stats:ReturnType<typeof sessionStats>;busy:boolean
  onReceipt:(a:Account)=>void;onConfirm:(p:Payment)=>void;onRecord:(a:Account)=>void;onCancel:(a:Account)=>void
  onEdit:(o:Order)=>void;onDelete:(o:Order)=>void;onReceived:(o:Order)=>void}
const chip=(a:Account,all:Account[])=>{
  const label=stateLabel(a,all)
  const tone=a.status==='paid'?'bg-emerald-100 text-emerald-800':a.status==='pending'?'bg-amber-100 text-amber-900':'bg-red-50 text-red-700'
  return <span className={'rounded-full px-3 py-1 text-xs font-bold '+tone}>{label}</span>
}
export default function AccountsPanel(p:Props){
  const [search,setSearch]=useState(''),[filter,setFilter]=useState('all')
  const U=(id:string)=>p.users.find(u=>u.id===id)
  const rows=p.accounts.filter(a=>{
    const u=U(a.user_id),text=((u?.username||'')+' '+(u?.full_name||'')).toLowerCase()
    if(search&&!text.includes(search.toLowerCase()))return false
    if(filter==='open')return a.status==='open'
    if(filter==='pending')return a.status==='pending'
    if(filter==='paid')return a.status==='paid'
    return true
  }).sort((a,b)=>(U(a.user_id)?.full_name||'').localeCompare(U(b.user_id)?.full_name||'','ar')||a.seq-b.seq)
  const s=p.stats
  const cells:[string,string][]=[['الأعضاء الحاليون',String(s.present)],['إجمالي المشاريب',String(s.drinks)],['إجمالي الحسابات',egp(s.accountsTotal)],['المستحق (لم يُدفع)',egp(s.due)],['التحصيل المؤكد',egp(s.collected)],['المصروفات',egp(s.expenses)],['رصيد المحفظة',egp(s.balance)],['دفعوا / لم يدفعوا',`${s.paidMembers} / ${s.unpaidMembers}`]]
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">{cells.map(([l,v])=><div key={l} className="rounded-2xl bg-white p-3 text-center shadow-sm"><div className="text-xs text-stone-500">{l}</div><div className="font-bold">{v}</div></div>)}</div>
    <div className="grid grid-cols-2 gap-2"><label className="text-sm">بحث عن عضو<input className={inp} placeholder="الاسم" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <label className="text-sm">الحالة<select className={inp} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">الكل</option><option value="open">حساب مفتوح</option><option value="pending">في انتظار التأكيد</option><option value="paid">مدفوع</option></select></label></div>
    {!rows.length&&<p className={card+' text-center'}>لا توجد حسابات في هذا العرض</p>}
    {rows.map(a=>{
      const u=U(a.user_id),list=accountOrders(p.orders,a),total=accountTotal(p.orders,a),pend=accountPending(p.orders,a)
      const pay=p.payments.find(x=>x.account_id===a.id&&(x.status==='pending'||x.status==='confirmed'))
      return <details key={a.id} className={card}>
        <summary className="cursor-pointer space-y-1"><span className="font-bold">{u?.full_name||'عضو غير متاح'}</span>{a.seq>1&&<span className="mr-2 text-xs text-stone-500">حساب {a.seq}</span>}
          <span className="mr-2 text-sm">الحساب: <b>{egp(a.status==='paid'&&pay?.status==='confirmed'?pay.amount:total)}</b></span>
          <span className="block">{chip(a,p.accounts)}</span></summary>
        <div className="mt-3 space-y-3">
          {list.map(o=><article key={o.id} className="space-y-2 border-t border-amber-100 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><b>{o.item_name_snapshot}</b><OrderStatus order={o}/></div>
            <p className="text-sm">{o.quantity} × {egp(o.unit_price_snapshot)} = <b>{egp(Number(o.unit_price_snapshot)*o.quantity)}</b></p>
            <p className="text-xs text-stone-500">الطلب: {dt(o.created_at)}{o.received_at&&<> · الاستلام: {dt(o.received_at)}</>}{o.created_by&&o.created_by!==o.user_id&&<> · سجّله: {U(o.created_by)?.full_name||'المدير'}</>}</p>
            <div className="flex gap-2"><button className={btn2} disabled={p.busy} aria-label={`تعديل طلب ${o.item_name_snapshot}`} onClick={()=>p.onEdit(o)}><Pencil size={16}/></button><button className={btn2} disabled={p.busy} aria-label={`حذف طلب ${o.item_name_snapshot}`} onClick={()=>p.onDelete(o)}><Trash2 size={16}/></button>{!received(o)&&<button className={btn2} disabled={p.busy} onClick={()=>p.onReceived(o)}>تسجيل الاستلام</button>}</div>
          </article>)}
          {a.status==='paid'&&<p className="text-xs text-stone-500">الحساب مدفوع: الإيصال النهائي محفوظ. أي تخفيض بعد الدفع يُسجَّل كتسوية في المحفظة.</p>}
          {pay?.status==='pending'&&<p className="text-sm">طلب دفع بمبلغ <b>{egp(pay.amount)}</b> بانتظار تأكيد استلام الفلوس.</p>}
          {pend>0&&a.status!=='paid'&&<p className="text-sm text-amber-900">{pend} مشروب قيد التحضير: سجّل استلامه قبل الدفع.</p>}
          <div className="flex flex-wrap gap-2"><button className={btn2} onClick={()=>p.onReceipt(a)}>عرض الإيصال</button>
            {pay?.status==='pending'&&<button className={btn} disabled={p.busy} onClick={()=>p.onConfirm(pay)}>تأكيد استلام المبلغ</button>}
            {a.status==='open'&&<button className={btn} disabled={p.busy||pend>0||total<=0} onClick={()=>p.onRecord(a)}>تسجيل دفع الحساب بالكامل</button>}
            {a.status==='pending'&&<button className={btn2} disabled={p.busy} onClick={()=>p.onCancel(a)}>إلغاء طلب الدفع</button>}
          </div>
          <p className="text-xs text-stone-400">{PAY_LABEL[a.status]}</p>
        </div>
      </details>})}
  </div>
}
