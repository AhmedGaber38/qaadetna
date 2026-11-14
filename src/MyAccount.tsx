import {useRef,useState} from 'react'
import {Gath,Order,Profile,dt,egp,sb,toast} from './lib'
import {Account,Custody,PAY_LABEL,Payment,ReceiptData,accountOrders,accountPending,accountTotal,receiptFromOrders} from './accounts'
import {btn,btn2,card} from './ui'
import ReceiptView from './ReceiptView'
import OrderStatus from './OrderStatus'
type Props={p:Profile;gatherings:Gath[];orders:Order[];accounts:Account[];payments:Payment[];custody:Custody[];onChanged:()=>void}
export default function MyAccount({p,gatherings,orders,accounts,payments,custody,onChanged}:Props){
  const [viewing,setViewing]=useState<{data:ReceiptData;status:'open'|'pending'|'paid'}|null>(null),[confirming,setConfirming]=useState<Account|null>(null),[busy,setBusy]=useState(false),lock=useRef(false)
  const mine=accounts.filter(a=>a.user_id===p.id)
  const unpaid=mine.filter(a=>a.status!=='paid').sort((a,b)=>b.opened_at.localeCompare(a.opened_at))
  const paid=payments.filter(x=>x.user_id===p.id&&x.status==='confirmed').sort((a,b)=>(b.confirmed_at||'').localeCompare(a.confirmed_at||''))
  const gOf=(a:Account)=>gatherings.find(g=>g.id===a.gathering_id)||{title:'قعدة',started_at:a.opened_at}
  const run=async(name:string,args:Record<string,unknown>,ok:string,fail:string)=>{
    if(lock.current)return false
    lock.current=true;setBusy(true)
    try{const {error}=await sb.rpc(name,args);if(error)throw error;toast(ok);onChanged();return true}
    catch(e:any){toast(/awaiting|receipt|Nothing/i.test(String(e?.message))?'راجع حسابك: لازم تأكد استلام كل المشروبات أولًا':fail);return false}
    finally{lock.current=false;setBusy(false)}
  }
  const pay=async()=>{if(!confirming)return;const ok=await run('qa_request_payment',{p_account:confirming.id},'تم إرسال طلب تأكيد الدفع للمدير','تعذر إرسال طلب الدفع، حاول مرة أخرى');if(ok)setConfirming(null)}
  const pendingCustody=custody.filter(c=>c.to_user===p.id&&c.status==='pending')
  return <div className="space-y-3">
    {pendingCustody.map(c=><div key={c.id} className={card+' space-y-2 border border-amber-300'}>
      <p className="text-sm">المدير بيسلّمك مسؤولية محفظة القعدة بمبلغ <b>{egp(c.amount)}</b>. أكّد بعد ما تستلم الفلوس فعلًا.</p>
      <button className={btn+' w-full'} disabled={busy} onClick={()=>run('qa_confirm_custody',{p_id:c.id},'تم تأكيد استلام المحفظة','تعذر تأكيد الاستلام')}>أكدت استلام المحفظة</button>
    </div>)}
    {!unpaid.length&&<p className={card+' text-center'}>مفيش حساب مفتوح دلوقتي</p>}
    {unpaid.map(a=>{
      const total=accountTotal(orders,a),pending=accountPending(orders,a),list=accountOrders(orders,a)
      return <section key={a.id} className={card+' space-y-3'}>
        <div className="flex flex-wrap items-center justify-between gap-2"><div><b>{gOf(a).title}</b>{a.seq>1&&<span className="mr-2 text-xs text-stone-500">حساب رقم {a.seq}</span>}<div className="text-xs text-stone-500">{dt(a.opened_at)}</div></div>
          <span className={'rounded-full px-3 py-1 text-xs font-bold '+(a.status==='pending'?'bg-amber-100 text-amber-900':'bg-red-50 text-red-700')}>{PAY_LABEL[a.status]}</span></div>
        <div className="divide-y divide-amber-100">{list.map(o=><div key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm"><div><b>{o.item_name_snapshot}</b><div className="text-xs text-stone-500">{o.quantity} × {egp(o.unit_price_snapshot)}</div></div><div className="flex items-center gap-2"><OrderStatus order={o}/><b>{egp(Number(o.unit_price_snapshot)*o.quantity)}</b></div></div>)}</div>
        <div className="flex items-center justify-between rounded-xl bg-amber-800 p-3 text-white"><span>إجمالي حسابك</span><b className="text-xl">{egp(total)}</b></div>
        {pending>0&&<p className="text-sm text-amber-900">عندك {pending} مشروب قيد التحضير. أكّد «وصل» من تبويب طلباتي عشان تقدر تدفع.</p>}
        {a.status==='pending'&&<p className="text-sm">طلب الدفع وصل للمدير، وبانتظار تأكيده استلام الفلوس.</p>}
        <div className="flex flex-wrap gap-2">
          <button className={btn2} onClick={()=>setViewing({data:receiptFromOrders(a,orders,p.full_name,gOf(a)),status:a.status})}>عرض الإيصال</button>
          {a.status==='open'&&<button className={btn} disabled={busy||pending>0||total<=0} onClick={()=>setConfirming(a)}>دفع الحساب بالكامل</button>}
          {a.status==='pending'&&<button className={btn2} disabled={busy} onClick={()=>run('qa_cancel_payment',{p_account:a.id},'تم إلغاء طلب الدفع','تعذر إلغاء الطلب')}>إلغاء طلب الدفع</button>}
        </div>
      </section>})}
    {paid.length>0&&<h2 className="pt-2 font-bold">حساباتي المدفوعة</h2>}
    {paid.map(x=><div key={x.id} className={card+' flex items-center justify-between gap-2'}><div><b>{egp(x.amount)}</b><div className="text-xs text-stone-500">{x.confirmed_at&&dt(x.confirmed_at)} · {x.receipt?.gathering}</div></div>
      {x.receipt&&<button className={btn2} onClick={()=>setViewing({data:x.receipt as ReceiptData,status:'paid'})}>عرض الإيصال</button>}</div>)}
    {confirming&&<div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="pay-title" className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5">
      <h2 id="pay-title" className="text-xl font-bold">دفع الحساب بالكامل</h2>
      <p className="text-sm">هتسجّل دفع حسابك كله: <b>{egp(accountTotal(orders,confirming))}</b>. مفيش دفع جزئي، والمبلغ بيتحسب في المحفظة بعد ما المدير يأكد إنه استلمه.</p>
      <div className="flex gap-2"><button className={btn} disabled={busy} onClick={pay}>{busy?'جاري الإرسال...':'تأكيد الدفع'}</button><button className={btn2} disabled={busy} onClick={()=>setConfirming(null)}>إلغاء</button></div>
    </section></div>}
    {viewing&&<ReceiptView data={viewing.data} status={viewing.status} onClose={()=>setViewing(null)}/>}
  </div>
}
