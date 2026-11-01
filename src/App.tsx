import {useEffect,useState,FormEvent} from 'react'
import {sb,Profile,email,useRealtime} from './lib'
import {Shell,DebugPanel,btn,inp,card} from './ui'
import User from './User'
import Admin from './Admin'

const Art=()=><svg viewBox="0 0 240 150" className="mx-auto h-36 w-auto" aria-hidden="true">
  <ellipse cx="120" cy="132" rx="100" ry="8" fill="#d9a441" opacity=".5"/>
  <g stroke="#134e4a" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".55"><path d="M108 34c-8 8 8 14 0 22"/><path d="M120 28c-8 8 8 14 0 22"/><path d="M132 34c-8 8 8 14 0 22"/></g>
  <path d="M92 62h56l-7 62q-21 6-42 0z" fill="#fbf1dc" stroke="#134e4a" strokeWidth="3"/>
  <path d="M97 84h46l-4 38q-19 5-38 0z" fill="#b3441e"/>
  <rect x="88" y="58" width="64" height="7" rx="3" fill="#d9a441"/>
  <path d="M26 100h42q0 22-21 22t-21-22z" fill="#fbf1dc" stroke="#134e4a" strokeWidth="3"/>
  <path d="M68 104q12 0 12 8t-12 6" fill="none" stroke="#134e4a" strokeWidth="3"/>
  <ellipse cx="47" cy="124" rx="28" ry="5" fill="#d9a441"/>
  <g transform="rotate(-14 186 106)"><rect x="168" y="82" width="36" height="64" rx="6" fill="#fbf1dc" stroke="#134e4a" strokeWidth="3"/><path d="M168 114h36" stroke="#134e4a" strokeWidth="3"/>
  <g fill="#b3441e"><circle cx="178" cy="92" r="3.5"/><circle cx="194" cy="104" r="3.5"/><circle cx="178" cy="124" r="3.5"/><circle cx="186" cy="134" r="3.5"/><circle cx="194" cy="124" r="3.5"/></g></g>
</svg>

function Auth(){
  const [reg,setReg]=useState(false),[f,setF]=useState({name:'',user:'',pass:''}),[busy,setBusy]=useState(false),[err,setErr]=useState('')
  const submit=async(e:FormEvent)=>{
    e.preventDefault();if(busy)return;setErr('')
    const u=f.user.trim().toLowerCase()
    if(!/^[a-z0-9_]{3,30}$/.test(u))return setErr('اسم المستخدم: حروف إنجليزية وأرقام و _ (من ٣ إلى ٣٠)')
    if(f.pass.length<6)return setErr('كلمة المرور ٦ أحرف على الأقل')
    if(reg&&!f.name.trim())return setErr('اكتب اسمك')
    setBusy(true)
    const r=reg?await sb.auth.signUp({email:email(u),password:f.pass,options:{data:{full_name:f.name.trim(),username:u}}}):await sb.auth.signInWithPassword({email:email(u),password:f.pass})
    setBusy(false)
    if(r.error){
      const m=(r.error.message||'').toLowerCase()
      if(!reg)setErr('اسم المستخدم أو كلمة المرور غير صحيحة')
      else if(m.includes('already')||m.includes('registered'))setErr('اسم المستخدم مستخدم بالفعل، اختر اسماً آخر')
      else if(m.includes('rate')||m.includes('seconds'))setErr('محاولات كثيرة، انتظر قليلاً ثم حاول مرة أخرى')
      else if(m.includes('email'))setErr('تعذر التسجيل: إعدادات البريد في Supabase تحتاج مراجعة (راجع README)')
      else setErr('تعذر التسجيل، حاول مرة أخرى')
    }
  }
  return <div className="min-h-screen ahwa-bg p-6"><form onSubmit={submit} className="mx-auto mt-10 max-w-sm space-y-3">
    <Art/><h1 className="text-center text-4xl font-bold text-amber-900">قعدتنا</h1><p className="text-center text-sm text-amber-800">قعدة أصحاب على القهوة البلدي</p>
    <p className="text-center text-stone-500">{reg?'إنشاء حساب جديد':'تسجيل الدخول'}</p>
    {reg&&<input className={inp} placeholder="الاسم" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/>}
    <input className={inp} dir="ltr" placeholder="username" autoCapitalize="none" value={f.user} onChange={e=>setF({...f,user:e.target.value})}/>
    <input className={inp} dir="ltr" type="password" placeholder="كلمة المرور" value={f.pass} onChange={e=>setF({...f,pass:e.target.value})}/>
    {err&&<p className="text-sm text-red-600">{err}</p>}
    <button className={btn+' w-full'} disabled={busy}>{busy?'...':reg?'تسجيل':'دخول'}</button>
    <button type="button" className="w-full text-amber-800" onClick={()=>{setReg(!reg);setErr('')}}>{reg?'عندي حساب':'حساب جديد'}</button>
    <details className={card+' text-sm'}><summary className="font-bold">تثبيت التطبيق</summary>
      <p className="mt-2">أندرويد (Chrome): القائمة ⋮ ثم «تثبيت التطبيق».</p><p>آيفون (Safari): زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».</p></details>
  </form></div>
}

export default function App(){
  const [p,setP]=useState<Profile|null>(null),[ready,setReady]=useState(false),[msg,setMsg]=useState('')
  const load=async()=>{
    const {data:{session}}=await sb.auth.getSession()
    if(!session){setP(null);setReady(true);return}
    const {data}=await sb.from('profiles').select('*').eq('id',session.user.id).maybeSingle()
    setP(data);setReady(true)
  }
  useEffect(()=>{
    load();const {data:s}=sb.auth.onAuthStateChange(()=>{load()})
    const h=(e:any)=>{setMsg(e.detail);setTimeout(()=>setMsg(''),3000)}
    window.addEventListener('toast',h)
    return()=>{s.subscription.unsubscribe();window.removeEventListener('toast',h)}
  },[])
  useRealtime('profiles',load)
  let body
  if(!ready)body=<p className="p-10 text-center">جاري التحميل...</p>
  else if(!p)body=<Auth/>
  else if(p.status==='pending')body=<Shell title="قعدتنا"><div className={card+' text-center'}><p className="text-xl font-bold">طلبك قيد المراجعة ⏳</p><p className="mt-2 text-stone-500">سيتم فتح حسابك بعد موافقة المدير.</p></div></Shell>
  else if(p.status!=='approved')body=<Shell title="قعدتنا"><div className={card+' text-center'}>{p.status==='rejected'?'تم رفض طلب التسجيل.':'تم إيقاف حسابك. تواصل مع المدير.'}</div></Shell>
  else body=p.role==='admin'?<Admin/>:<User p={p}/>
  return <>{msg&&<div className="fixed inset-x-4 top-16 z-50 rounded-xl bg-stone-900 p-3 text-center text-white shadow-lg">{msg}</div>}{body}<DebugPanel/></>
}
