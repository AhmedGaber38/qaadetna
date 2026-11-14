import {Printer,Share2} from 'lucide-react'
import {dt,egp,toast} from './lib'
import {AccountStatus,PAY_LABEL,ReceiptData,receiptText} from './accounts'
import {btn,btn2} from './ui'
export default function ReceiptView({data,status,onClose}:{data:ReceiptData;status:AccountStatus;onClose:()=>void}){
  const share=async()=>{
    const text=receiptText(data,status,egp,dt)
    try{
      if(typeof navigator.share==='function')await navigator.share({title:'إيصال قعدتنا',text})
      else{await navigator.clipboard.writeText(text);toast('تم نسخ الإيصال')}
    }catch{/* user dismissed the share sheet */}
  }
  return <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-black/45 p-4">
    <section role="dialog" aria-modal="true" aria-label="الإيصال" className="print-area w-full max-w-md space-y-3 rounded-2xl bg-white p-5">
      <h2 className="text-center text-xl font-bold">إيصال قعدتنا</h2>
      <div className="text-center text-sm text-stone-600"><b>{data.member}</b><div>{data.gathering} · {dt(data.started_at)}</div>{data.account_no>1&&<div>حساب رقم {data.account_no}</div>}</div>
      <div className="divide-y divide-amber-100">{data.items.map((i,k)=><div key={k} className="flex items-start justify-between gap-2 py-2 text-sm">
        <div><b>{i.name}</b><div className="text-xs text-stone-500">{i.qty} × {egp(i.unit_price)}{i.pending&&' · قيد التحضير (غير محسوب)'}</div></div><b>{egp(i.total)}</b>
      </div>)}</div>
      <div className="flex items-center justify-between rounded-xl bg-amber-800 p-3 text-white"><span>إجمالي الحساب</span><b className="text-xl">{egp(data.total)}</b></div>
      <p className={'rounded-xl p-2 text-center text-sm font-bold '+(status==='paid'?'bg-emerald-100 text-emerald-800':status==='pending'?'bg-amber-100 text-amber-900':'bg-red-50 text-red-700')}>{PAY_LABEL[status]}</p>
      {data.paid_at&&<p className="text-center text-xs text-stone-500">تاريخ الدفع: {dt(data.paid_at)}{data.confirmed_by&&<> · أكّد الاستلام: {data.confirmed_by}</>}</p>}
      <div className="no-print flex gap-2"><button className={btn+' flex flex-1 items-center justify-center gap-1'} onClick={share}><Share2 size={16}/>مشاركة</button><button className={btn2+' flex items-center gap-1'} onClick={()=>window.print()}><Printer size={16}/>طباعة</button><button className={btn2} onClick={onClose}>إغلاق</button></div>
    </section>
  </div>
}
