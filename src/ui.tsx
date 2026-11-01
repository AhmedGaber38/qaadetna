import {Coffee,LogOut} from 'lucide-react'
import {sb} from './lib'
export const btn='rounded-xl bg-amber-800 px-4 py-3 font-bold text-white active:bg-amber-900 disabled:opacity-50'
export const btn2='rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900'
export const inp='w-full rounded-xl border border-amber-200 bg-white px-3 py-3'
export const card='rounded-2xl bg-white p-4 shadow-sm'
export function Shell({title,children}:{title:string;children:any}){
  return <div className="min-h-screen bg-amber-50 text-stone-800"><header className="sticky top-0 z-10 flex items-center justify-between bg-amber-900 px-4 py-3 text-white"><div className="flex items-center gap-2 font-bold"><Coffee size={22}/>{title}</div><button onClick={()=>sb.auth.signOut()} className="flex items-center gap-1 rounded-lg bg-amber-800 px-3 py-2 text-sm"><LogOut size={16}/>خروج</button></header><main className="mx-auto max-w-3xl space-y-4 p-4">{children}</main></div>
}
