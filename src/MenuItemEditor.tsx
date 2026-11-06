import {FormEvent,useEffect,useRef,useState} from 'react'
import {Item,sb,toast} from './lib'
import {btn,btn2,card,inp} from './ui'
import {uploadMedia,removeUploads,validateMedia} from './menuMedia'

function usePreview(file:File|null,existing?:string|null){
  const [url,setUrl]=useState('')
  useEffect(()=>{if(!file){setUrl('');return}const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next)},[file])
  return file?url:existing||''
}
export default function MenuItemEditor({item,onSaved,onCancel}:{item?:Item;onSaved:()=>void;onCancel?:()=>void}){
  const [name,setName]=useState(item?.name||''),[price,setPrice]=useState(item?String(item.price):'')
  const [image,setImage]=useState<File|null>(null),[audio,setAudio]=useState<File|null>(null)
  const [removeImage,setRemoveImage]=useState(false),[removeAudio,setRemoveAudio]=useState(false)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false),form=useRef<HTMLFormElement>(null)
  const imageUrl=usePreview(image,removeImage?null:item?.image_url),audioUrl=usePreview(audio,removeAudio?null:item?.audio_url)
  const select=(file:File|undefined,kind:'image'|'audio',input:HTMLInputElement)=>{
    if(!file)return
    try{validateMedia(file,kind);setError('');if(kind==='image'){setImage(file);setRemoveImage(false)}else{setAudio(file);setRemoveAudio(false)}}catch(e){input.value='';setError((e as Error).message)}
  }
  const save=async(e:FormEvent)=>{
    e.preventDefault();if(lock.current)return
    const value=Number(price)
    if(!name.trim()||price.trim()===''||!Number.isFinite(value)||value<0){setError('اكتب اسم الصنف وسعر صحيح');return}
    lock.current=true;setBusy(true);setError('')
    const uploaded:string[]=[]
    try{
      let image_url=removeImage?null:item?.image_url||null,audio_url=removeAudio?null:item?.audio_url||null
      if(image){const media=await uploadMedia(image,'image');uploaded.push(media.path);image_url=media.url}
      if(audio){const media=await uploadMedia(audio,'audio');uploaded.push(media.path);audio_url=media.url}
      const values={name:name.trim(),price:value,image_url,audio_url}
      const {error:saveError}=item?await sb.from('menu_items').update(values).eq('id',item.id):await sb.from('menu_items').insert(values)
      if(saveError)throw new Error('تعذر حفظ الصنف. راجع الاتصال وإعداد قاعدة البيانات.')
      toast(item?'تم تعديل الصنف':'تمت إضافة الصنف')
      if(!item){setName('');setPrice('');setImage(null);setAudio(null);setRemoveImage(false);setRemoveAudio(false);form.current?.reset()}
      onSaved()
    }catch(e){await removeUploads(uploaded);setError(e instanceof Error?e.message:'تعذر حفظ الصنف')}
    finally{lock.current=false;setBusy(false)}
  }
  return <form ref={form} onSubmit={save} className={card+' space-y-3'}>
    <h2 className="font-bold">{item?'تعديل الصنف':'إضافة صنف جديد'}</h2>
    <fieldset disabled={busy} className="space-y-3 disabled:opacity-60">
      <div className="grid grid-cols-2 gap-2"><label className="space-y-1 text-sm">اسم الصنف<input className={inp} required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><label className="space-y-1 text-sm">السعر بالجنيه<input className={inp} type="number" min="0" step="0.01" required value={price} onChange={e=>setPrice(e.target.value)}/></label></div>
      <label className="block space-y-1 text-sm"><span>صورة الصنف (اختياري، حتى ٥ ميجا)</span><input className={inp} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>select(e.target.files?.[0],'image',e.target)}/></label>
      {imageUrl&&<div className="flex items-center gap-3"><img src={imageUrl} alt="معاينة صورة الصنف" className="h-24 w-24 rounded-xl object-cover"/><button type="button" className={btn2} onClick={()=>{setImage(null);setRemoveImage(true)}}>إزالة الصورة</button></div>}
      <label className="block space-y-1 text-sm"><span>صوت الصنف MP3 (اختياري، حتى ١٠ ميجا)</span><input className={inp} type="file" accept=".mp3,audio/mpeg" onChange={e=>select(e.target.files?.[0],'audio',e.target)}/></label>
      <p className="text-xs text-stone-500">الصوت بيشتغل لما العضو يضغط + جنب الصنف.</p>
      {audioUrl&&<div className="space-y-2"><audio key={audioUrl} controls preload="none" src={audioUrl} className="w-full"/><button type="button" className={btn2} onClick={()=>{setAudio(null);setRemoveAudio(true)}}>إزالة الصوت</button></div>}
      {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2"><button className={btn} type="submit">{busy?'جاري الرفع والحفظ...':item?'حفظ التعديل':'إضافة الصنف'}</button>{onCancel&&<button className={btn2} type="button" onClick={onCancel}>إلغاء</button>}</div>
    </fieldset>
  </form>
}
