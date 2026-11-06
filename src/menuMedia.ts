import {sb} from './lib'
export const MEDIA_BUCKET='menu-media'
export const IMAGE_MAX=5*1024*1024
export const AUDIO_MAX=10*1024*1024
const imageTypes:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
export function validateMedia(file:File,kind:'image'|'audio'){
  if(kind==='image'&&!imageTypes[file.type])throw new Error('اختار صورة JPG أو PNG أو WebP')
  if(kind==='audio'&&(!/\.mp3$/i.test(file.name)||!['audio/mpeg','audio/mp3',''].includes(file.type)))throw new Error('اختار ملف صوت MP3')
  if(!file.size||file.size>(kind==='image'?IMAGE_MAX:AUDIO_MAX))throw new Error(kind==='image'?'الصورة لازم تكون أقل من ٥ ميجا':'الصوت لازم يكون أقل من ١٠ ميجا')
}
export async function uploadMedia(file:File,kind:'image'|'audio'){
  validateMedia(file,kind)
  const {data:{user},error:authError}=await sb.auth.getUser()
  if(authError||!user)throw new Error('سجل دخولك مرة تانية')
  const path=`${user.id}/${crypto.randomUUID()}.${kind==='image'?imageTypes[file.type]:'mp3'}`
  const {error}=await sb.storage.from(MEDIA_BUCKET).upload(path,file,{contentType:kind==='audio'?'audio/mpeg':file.type,upsert:false})
  if(error)throw new Error('تعذر رفع الملف. راجع الاتصال وإعداد تخزين المنيو.')
  return {path,url:sb.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl}
}
export async function removeUploads(paths:string[]){
  if(paths.length)await sb.storage.from(MEDIA_BUCKET).remove(paths).catch(()=>{})
}
