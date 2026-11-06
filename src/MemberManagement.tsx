import {useRef,useState} from 'react'
import {Profile,sb,toast} from './lib'
import {btn,btn2,card,inp} from './ui'
export default function MemberManagement({users,onChanged}:{users:Profile[];onChanged:()=>void}){
  const [editing,setEditing]=useState<Profile|null>(null),[name,setName]=useState(''),[target,setTarget]=useState<Profile|null>(null)
  const [confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false)
  const update=async(user:Profile,values:{p_name?:string;p_status?:string})=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('')
    try{
      const {error}=await sb.rpc('qa_admin_update_profile',{p_user:user.id,...values});if(error)throw error
      setEditing(null);toast('تم تحديث العضو');onChanged()
    }catch{setError('تعذر تحديث العضو، حاول مرة أخرى')}
    finally{lock.current=false;setBusy(false)}
  }
  const remove=async()=>{
    if(!target||confirmation!==target.username||lock.current)return
    lock.current=true;setBusy(true);setError('')
    try{
      const {data:{session}}=await sb.auth.getSession()
      if(!session)throw new Error('انتهت الجلسة')
      const {data,error}=await sb.functions.invoke('delete-member',{body:{user_id:target.id,confirmation},headers:{Authorization:`Bearer ${session.access_token}`}})
      if(error||!data?.deleted)throw new Error('Deletion failed')
      setTarget(null);setConfirmation('');toast('تم حذف حساب العضو وطلباته نهائيًا');onChanged()
    }catch{setError('تعذر حذف الحساب. تأكد من نشر دالة delete-member وإعدادها، ثم أعد المحاولة. لم نؤكد نجاح الحذف.')}
    finally{lock.current=false;setBusy(false)}
  }
  return <div className="space-y-3">
    {error&&!target&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {users.map(u=><div key={u.id} className={card+' space-y-3'}>
      <div className="flex flex-wrap items-center justify-between gap-2"><div><b>{u.full_name}</b> <span className="text-xs text-stone-500" dir="ltr">@{u.username}</span>{u.role==='admin'&&<span className="mr-2 text-xs text-amber-800">مدير</span>}</div><span className="text-xs">{({pending:'قيد المراجعة',approved:'مفعّل',rejected:'مرفوض',suspended:'موقوف'} as Record<string,string>)[u.status]}</span></div>
      {editing?.id===u.id?<form className="space-y-2" onSubmit={e=>{e.preventDefault();if(name.trim())update(u,{p_name:name.trim()})}}><label className="block text-sm">الاسم الظاهر<input className={inp} value={name} maxLength={120} required disabled={busy} onChange={e=>setName(e.target.value)}/></label><div className="flex gap-2"><button className={btn2} disabled={busy||!name.trim()}>حفظ الاسم</button><button className={btn2} type="button" disabled={busy} onClick={()=>setEditing(null)}>إلغاء</button></div></form>:<button className={btn2} disabled={busy} onClick={()=>{setEditing(u);setName(u.full_name);setError('')}}>تعديل الاسم</button>}
      {u.role!=='admin'&&<div className="flex flex-wrap gap-2">
        {(u.status==='pending'||u.status==='rejected')&&<button className={btn2} disabled={busy} onClick={()=>update(u,{p_status:'approved'})}>قبول</button>}
        {u.status==='pending'&&<button className={btn2} disabled={busy} onClick={()=>update(u,{p_status:'rejected'})}>رفض</button>}
        {u.status==='approved'&&<button className={btn2} disabled={busy} onClick={()=>update(u,{p_status:'suspended'})}>إيقاف</button>}
        {u.status==='suspended'&&<button className={btn2} disabled={busy} onClick={()=>update(u,{p_status:'approved'})}>إعادة تفعيل</button>}
        <button className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-50" disabled={busy} onClick={()=>{setTarget(u);setConfirmation('');setError('')}}>حذف نهائي</button>
      </div>}
    </div>)}
    {target&&<div className="fixed inset-0 z-30 flex items-center justify-center overflow-auto bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="delete-member-title" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5">
      <h2 id="delete-member-title" className="text-xl font-bold text-red-700">حذف {target.full_name} نهائيًا؟</h2>
      <p className="text-sm">سيُحذف حساب الدخول وملف العضو وجميع طلباته في كل القعدات وإشعاراتها. ستتغير إجماليات الفواتير القديمة المرتبطة به. لن تُحذف القعدات أو حسابات الأعضاء الآخرين. لا يمكن التراجع.</p>
      <label className="block text-sm">للتأكيد اكتب اسم المستخدم: <b dir="ltr">{target.username}</b><input autoFocus className={inp} dir="ltr" autoComplete="off" value={confirmation} disabled={busy} onChange={e=>setConfirmation(e.target.value)}/></label>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2"><button className={btn+' !bg-red-700'} disabled={busy||confirmation!==target.username} onClick={remove}>{busy?'جاري الحذف...':'تأكيد الحذف النهائي'}</button><button className={btn2} disabled={busy} onClick={()=>{setTarget(null);setError('')}}>إلغاء</button></div>
    </section></div>}
  </div>
}
