import {useEffect,useState} from 'react'
import {Coffee,LogOut,Volume2,VolumeX} from 'lucide-react'
import {sb,getRecs,onRecs} from './lib'
import {soundOn,setSoundOn,unlock} from './sound'
export const btn='rounded-xl bg-amber-800 px-4 py-3 font-bold text-white active:bg-amber-900 disabled:opacity-50'
export const btn2='rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900'
export const inp='w-full rounded-xl border border-amber-200 bg-white px-3 py-3'
export const card='rounded-2xl bg-white p-4 shadow-sm'
export function Shell({title,children}:{title:string;children:any}){
  return <div className="min-h-screen ahwa-bg text-stone-800"><header className="ahwa-header sticky top-0 z-10 flex items-center justify-between bg-amber-900 px-4 py-3 text-white"><div className="flex items-center gap-2 font-bold"><Coffee size={22}/>{title}</div><div className="flex items-center gap-2"><SoundToggle className="bg-amber-800 text-white"/><button onClick={()=>sb.auth.signOut()} className="flex items-center gap-1 rounded-lg bg-amber-800 px-3 py-2 text-sm"><LogOut size={16}/>خروج</button></div></header><main className="mx-auto max-w-3xl space-y-4 p-4">{children}</main></div>
}

export function DebugPanel(){
  const [,tick]=useState(0),[ping,setPing]=useState('')
  useEffect(()=>onRecs(()=>tick(x=>x+1)),[])
  if(!location.search.includes('debug'))return null
  const doPing=async()=>{
    const u=import.meta.env.VITE_SUPABASE_URL as string,k=import.meta.env.VITE_SUPABASE_ANON_KEY as string,r:number[]=[]
    setPing('...')
    for(let i=0;i<4;i++){const t=performance.now();try{await fetch(u+'/auth/v1/health',{headers:{apikey:k},cache:'no-store'})}catch(e){}r.push(Math.round(performance.now()-t))}
    setPing(r.join(' / ')+' ms')
  }
  return <div dir="ltr" className="fixed inset-x-0 bottom-0 z-50 max-h-60 overflow-auto bg-black/85 p-2 text-xs text-white">
    <div className="mb-1 flex items-center gap-2"><button onClick={doPing} className="rounded bg-white px-2 py-1 font-bold text-black">Ping</button><span>{ping}</span></div>
    {getRecs().map((r,i)=><div key={i} className="flex justify-between gap-2"><span className="truncate">{r.n}</span><b className={r.ok?'':'text-red-400'}>{r.ms} ms</b></div>)}
  </div>
}

export function SoundToggle({className=''}:{className?:string}){
  const [on,setOn]=useState(soundOn())
  const flip=()=>{const v=!on;setOn(v);setSoundOn(v);if(v)unlock()}
  return <button type="button" data-sound-toggle="1" onClick={flip} aria-label={on?'إيقاف الصوت':'تشغيل الصوت'} title={on?'الصوت شغال':'الصوت مقفول'} className={'flex h-10 w-10 items-center justify-center rounded-full '+className}>{on?<Volume2 size={18}/>:<VolumeX size={18}/>}</button>
}
