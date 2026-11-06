import {useState} from 'react'
import {Order,egp} from './lib'
import {drinkSummary} from './orders'
import {btn2,card} from './ui'
export default function GatheringReceipt({title,orders}:{title:string;orders:Order[]}){
  const s=drinkSummary(orders),[copied,setCopied]=useState(false)
  if(!s.rows.length)return <p className={card+' text-center'}>لا توجد مشروبات في هذه القعدة بعد</p>
  const text=[title,...s.rows.map(r=>`${r.name} × ${r.qty} = ${egp(r.total)}`),`الإجمالي: ${egp(s.total)}`].join('\n')
  const copy=async()=>{try{await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),2000)}catch{setCopied(false)}}
  return <section className={card+' space-y-3'} aria-label="ريسيت القعدة">
    <h2 className="text-center text-lg font-bold">ريسيت القعدة</h2>
    <p className="text-center text-sm text-stone-500">{title}</p>
    <div className="divide-y divide-amber-100">{s.rows.map(r=><div key={r.name+'|'+r.price} className="flex items-center justify-between gap-2 py-2">
      <div><b>{r.name}</b><div className="text-xs text-stone-500">{r.qty} × {egp(r.price)}</div></div>
      <b>{egp(r.total)}</b>
    </div>)}</div>
    <div className="flex items-center justify-between rounded-xl bg-amber-800 p-3 text-white"><span>إجمالي {s.totalQty} مشروب</span><b className="text-xl">{egp(s.total)}</b></div>
    <p className="text-center text-xs text-stone-500">مستلم: {egp(s.receivedTotal)} · قيد التحضير: {egp(s.pendingTotal)}</p>
    <button className={btn2+' w-full'} onClick={copy}>{copied?'تم النسخ ✓':'نسخ الريسيت'}</button>
  </section>
}
