import React from 'react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
const mocks=vi.hoisted(()=>({save:vi.fn(),upload:vi.fn(),remove:vi.fn(),toast:vi.fn()}))
vi.mock('../src/lib',()=>({sb:{from:()=>({insert:mocks.save,update:(value:any)=>({eq:()=>mocks.save(value)})})},toast:mocks.toast}))
vi.mock('../src/ui',()=>({btn:'',btn2:'',card:'',inp:''}))
vi.mock('../src/menuMedia',async()=>{
  const original=await vi.importActual<any>('../src/menuMedia')
  return {...original,uploadMedia:mocks.upload,removeUploads:mocks.remove}
})
import MenuItemEditor from '../src/MenuItemEditor'
beforeEach(()=>{vi.clearAllMocks();mocks.save.mockResolvedValue({error:null});mocks.remove.mockResolvedValue(undefined);URL.createObjectURL=vi.fn(()=> 'blob:preview');URL.revokeObjectURL=vi.fn()})
afterEach(cleanup)
it('uploads both files before saving their public URLs with the item',async()=>{
  const done=vi.fn()
  mocks.upload.mockResolvedValueOnce({path:'image',url:'https://media/image.jpg'}).mockResolvedValueOnce({path:'audio',url:'https://media/audio.mp3'})
  render(<MenuItemEditor onSaved={done}/>)
  fireEvent.change(screen.getByLabelText('اسم الصنف'),{target:{value:'شاي'}})
  fireEvent.change(screen.getByLabelText('السعر بالجنيه'),{target:{value:'15'}})
  fireEvent.change(screen.getByLabelText(/صورة الصنف/),{target:{files:[new File(['image'],'tea.jpg',{type:'image/jpeg'})]}})
  fireEvent.change(screen.getByLabelText(/صوت الصنف MP3/),{target:{files:[new File(['audio'],'tea.mp3',{type:'audio/mpeg'})]}})
  fireEvent.click(screen.getByRole('button',{name:'إضافة الصنف'}))
  await waitFor(()=>expect(done).toHaveBeenCalledOnce())
  expect(mocks.save).toHaveBeenCalledWith({name:'شاي',price:15,image_url:'https://media/image.jpg',audio_url:'https://media/audio.mp3'})
})
it('cleans a completed image upload if the later audio upload fails',async()=>{
  mocks.upload.mockResolvedValueOnce({path:'image',url:'https://media/image.jpg'}).mockRejectedValueOnce(new Error('تعذر رفع الصوت'))
  const done=vi.fn()
  render(<MenuItemEditor item={{id:'a',name:'شاي',price:15,is_active:true,is_archived:false}} onSaved={done}/>)
  fireEvent.change(screen.getByLabelText(/صورة الصنف/),{target:{files:[new File(['image'],'tea.jpg',{type:'image/jpeg'})]}})
  fireEvent.change(screen.getByLabelText(/صوت الصنف MP3/),{target:{files:[new File(['audio'],'tea.mp3',{type:'audio/mpeg'})]}})
  fireEvent.click(screen.getByRole('button',{name:'حفظ التعديل'}))
  await screen.findByRole('alert')
  expect(mocks.remove).toHaveBeenCalledWith(['image']);expect(mocks.save).not.toHaveBeenCalled();expect(done).not.toHaveBeenCalled()
})
it('rejects non-MP3 audio before uploading',async()=>{
  render(<MenuItemEditor onSaved={vi.fn()}/>)
  fireEvent.change(screen.getByLabelText(/صوت الصنف MP3/),{target:{files:[new File(['audio'],'file.wav',{type:'audio/wav'})]}})
  expect((await screen.findByRole('alert')).textContent).toContain('MP3');expect(mocks.upload).not.toHaveBeenCalled()
})
