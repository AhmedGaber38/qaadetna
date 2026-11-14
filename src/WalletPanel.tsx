import {useState} from 'react'
import {Profile,dt,egp} from './lib'
import {Custody,KIND_LABEL,LedgerEntry,walletTotals} from './accounts'
import {btn,btn2,card,inp} from './ui'
type Props={title:string;ledger:LedgerEntry[];custody:Custody[];users:Profile[];busy:boolean
  onExpense:(description:string,amount:number)=>Promise<boolean>;onCorrect:(amount:number,reason:string)=>Promise<boolean>
  onStartCustody:(to:string,amount:number)=>Promise<boolean>;onConfirmCustody:(id:string)=>void;onCancelCustody:(id:string)=>void}
const CUSTODY_LABEL={pending:'بانتظار تأكيد الاستلام',confirmed:'تم التسليم والاستلام',cancelled:'أُلغي'} as const
export default function WalletPanel(p:Props){
  const [desc,setDesc]=useState(''),[amount,setAmount]=useState(''),[cAmount,setCAmount]=useState(''),[reason,setReason]=useState(''),[to,setTo]=useState(''),[handAmount,setHandAmount]=useState('')
  const w=walletTotals(p.ledger)
  const holder=p.custody.filter(c=>c.status==='confirmed').sort((a,b)=>(b.confirmed_at||'').localeCompare(a.confirmed_at||''))[0]
  const members=p.users.filter(u=>u.status==='approved')
  const num=(v:string)=>Number(v.replace(/,/g,'.'))
  const valid=(v:string)=>v.trim()!==''&&Number.isFinite(num(v))
  return <div className="space-y-3">
    <div className="rounded-2xl bg-amber-800 p-4 text-center text-white"><div className="text-sm">رصيد محفظة قعدتنا — {p.title}</div><div className="text-3xl font-bold">{egp(w.balance)}</div>
      <p className="mt-2 text-xs">التحصيل المؤكد {egp(w.collected)} − المصروفات {egp(w.expenses)}{w.other!==0&&<> {w.other>0?'+':'−'} تسويات {egp(Math.abs(w.other))}</>}</p></div>
    <div className={card+' text-sm'}>مسؤول المحفظة الحالي: <b>{holder?holder.to_name:'المدير'}</b>{holder&&<span className="text-xs text-stone-500"> · منذ {dt(holder.confirmed_at||holder.handed_at)}</span>}</div>

    <form className={card+' space-y-2'} onSubmit={async e=>{e.preventDefault();if(valid(amount)&&await p.onExpense(desc,num(amount))){setDesc('');setAmount('')}}}>
      <h2 className="font-bold">تسجيل مصروف</h2>
      <input className={inp} placeholder="الوصف (مثلًا: حساب الكافيه)" value={desc} maxLength={200} required disabled={p.busy} onChange={e=>setDesc(e.target.value)}/>
      <input className={inp} placeholder="المبلغ" inputMode="decimal" value={amount} required disabled={p.busy} onChange={e=>setAmount(e.target.value)}/>
      <button className={btn+' w-full'} disabled={p.busy||!desc.trim()||!valid(amount)||num(amount)<=0}>تسجيل المصروف وخصمه من المحفظة</button>
    </form>

    <form className={card+' space-y-2'} onSubmit={async e=>{e.preventDefault();if(valid(handAmount)&&to&&await p.onStartCustody(to,num(handAmount))){setTo('');setHandAmount('')}}}>
      <h2 className="font-bold">نقل مسؤولية المحفظة</h2>
      <select className={inp} value={to} disabled={p.busy} onChange={e=>{setTo(e.target.value);if(!handAmount)setHandAmount(String(Math.max(0,w.balance)))}}><option value="">اختار العضو المسؤول</option>{members.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select>
      <input className={inp} placeholder="المبلغ المسلَّم" inputMode="decimal" value={handAmount} disabled={p.busy} onChange={e=>setHandAmount(e.target.value)}/>
      <button className={btn+' w-full'} disabled={p.busy||!to||!valid(handAmount)||num(handAmount)<0}>تسجيل التسليم</button>
      <p className="text-xs text-stone-500">يكتمل النقل لما العضو (أو أنت) يؤكد الاستلام.</p>
    </form>
    {p.custody.length>0&&<div className="space-y-2"><h2 className="font-bold">سجل نقل المسؤولية</h2>{p.custody.map(c=><div key={c.id} className={card+' space-y-1 text-sm'}>
      <div><b>{c.from_name||'المدير'}</b> ← <b>{c.to_name}</b> · {egp(c.amount)}</div>
      <div className="text-xs text-stone-500">{dt(c.handed_at)} · {CUSTODY_LABEL[c.status]}{c.confirmed_by_name&&<> · أكّد: {c.confirmed_by_name}</>}</div>
      {c.status==='pending'&&<div className="flex gap-2"><button className={btn2} disabled={p.busy} onClick={()=>p.onConfirmCustody(c.id)}>تأكيد الاستلام</button><button className={btn2} disabled={p.busy} onClick={()=>p.onCancelCustody(c.id)}>إلغاء</button></div>}
    </div>)}</div>}

    <div className="space-y-2"><h2 className="font-bold">سجل الحركات المالية</h2>
      {!p.ledger.length&&<p className={card+' text-center text-sm'}>لا توجد حركات بعد</p>}
      {p.ledger.map(e=><div key={e.id} className={card+' flex items-start justify-between gap-2 text-sm'}>
        <div><b>{KIND_LABEL[e.kind]}</b>{e.member_name&&<span> · {e.member_name}</span>}<div className="text-xs text-stone-600">{e.description}</div>
          <div className="text-xs text-stone-400">{dt(e.created_at)}{e.confirmed_by_name?` · أكّد: ${e.confirmed_by_name}`:e.created_by_name?` · سجّله: ${e.created_by_name}`:''}</div></div>
        <b className={Number(e.amount)<0?'text-red-700':'text-emerald-800'} dir="ltr">{Number(e.amount)>0?'+':''}{egp(Number(e.amount))}</b></div>)}
    </div>

    <details className={card}><summary className="cursor-pointer font-bold">تصحيح خطأ مالي (يُسجَّل أثره)</summary>
      <form className="mt-3 space-y-2" onSubmit={async e=>{e.preventDefault();if(valid(cAmount)&&await p.onCorrect(num(cAmount),reason)){setCAmount('');setReason('')}}}>
        <p className="text-xs text-stone-500">الحركات القديمة لا تُحذف ولا تُعدَّل. اكتب مبلغًا موجبًا للزيادة أو سالبًا للنقص مع السبب.</p>
        <input className={inp} placeholder="المبلغ (مثلًا -20 أو 15)" inputMode="decimal" value={cAmount} disabled={p.busy} onChange={e=>setCAmount(e.target.value)}/>
        <input className={inp} placeholder="سبب التصحيح" value={reason} maxLength={200} disabled={p.busy} onChange={e=>setReason(e.target.value)}/>
        <button className={btn+' w-full'} disabled={p.busy||!valid(cAmount)||num(cAmount)===0||reason.trim().length<3}>تسجيل التصحيح</button>
      </form></details>
  </div>
}
