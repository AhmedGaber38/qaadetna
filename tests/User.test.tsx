import React from 'react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),toast:vi.fn(),play:vi.fn(),callbacks:new Map<string,()=>void>(),active:{id:'g1',title:'قعدتنا',status:'active'},items:[{id:'a',name:'شاي',price:10,audio_url:'/tea.mp3'},{id:'b',name:'قهوة',price:20}],queries:[] as any[]}))
vi.mock('../src/lib',()=>({
  sb:{from:(table:string)=>{const query:any={select:()=>query,eq:(...args:any[])=>{mocks.queries.push([table,...args]);return query},order:()=>query,range:async(from:number)=>({data:from===0&&table==='menu_items'?mocks.items:[]}),maybeSingle:async()=>({data:mocks.active})};return query},rpc:mocks.rpc},
  egp:(n:number)=>`${n} جنيه`,dt:(s:string)=>s,toast:mocks.toast,useRealtime:(table:string,cb:()=>void)=>mocks.callbacks.set(table,cb)
}))
vi.mock('../src/ui',()=>({Shell:({children}:any)=><div>{children}</div>,btn:'',card:''}))
vi.mock('../src/sound',()=>({playTea:vi.fn(),playItem:mocks.play}))
import User from '../src/User'
const profile:any={id:'member',full_name:'محمد'}
beforeEach(()=>{mocks.rpc.mockReset();mocks.toast.mockReset();mocks.play.mockReset();mocks.queries=[];mocks.active={id:'g1',title:'قعدتنا',status:'active'}})
afterEach(cleanup)
it('builds several item quantities and sends one batch only after submit',async()=>{
  mocks.rpc.mockResolvedValue({error:null})
  render(<User p={profile}/>);await screen.findByRole('button',{name:'زيادة شاي'})
  fireEvent.click(screen.getByRole('button',{name:'زيادة شاي'}));fireEvent.click(screen.getByRole('button',{name:'زيادة شاي'}))
  fireEvent.click(screen.getByRole('button',{name:'زيادة قهوة'}));fireEvent.click(screen.getByRole('button',{name:'تقليل شاي'}))
  expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.play).toHaveBeenCalledWith('/tea.mp3')
  expect(screen.getByText('30 جنيه')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'إرسال الطلبات للمدير'}))
  await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledTimes(1))
  expect(mocks.rpc.mock.calls[0][0]).toBe('qa_submit_order_batch')
  expect(mocks.rpc.mock.calls[0][1]).toMatchObject({p_gathering:'g1',p_items:[{item_id:'a',quantity:1},{item_id:'b',quantity:1}]})
  await waitFor(()=>expect(screen.queryByRole('button',{name:'إرسال الطلبات للمدير'})).toBeNull())
  expect(mocks.queries).toContainEqual(['orders','user_id','member'])
})
it('keeps a failed cart and reuses the same request ID on retry',async()=>{
  mocks.rpc.mockResolvedValueOnce({error:{message:'network'}}).mockResolvedValueOnce({error:null})
  render(<User p={profile}/>);await screen.findByRole('button',{name:'زيادة شاي'})
  fireEvent.click(screen.getByRole('button',{name:'زيادة شاي'}));fireEvent.click(screen.getByRole('button',{name:'إرسال الطلبات للمدير'}))
  await waitFor(()=>expect(mocks.toast).toHaveBeenCalled())
  const first=mocks.rpc.mock.calls[0][1]
  fireEvent.click(screen.getByRole('button',{name:'إرسال الطلبات للمدير'}))
  await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledTimes(2))
  expect(mocks.rpc.mock.calls[1][1]).toEqual(first)
})
it('blocks a double submit while the RPC is pending',async()=>{
  let finish:any;mocks.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  render(<User p={profile}/>);await screen.findByRole('button',{name:'زيادة قهوة'})
  fireEvent.click(screen.getByRole('button',{name:'زيادة قهوة'}))
  const submit=screen.getByRole('button',{name:'إرسال الطلبات للمدير'})
  fireEvent.click(submit);fireEvent.click(submit)
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
  expect((screen.getByRole('button',{name:'زيادة قهوة'}) as HTMLButtonElement).disabled).toBe(true)
  finish({error:null});await waitFor(()=>expect(screen.queryByText('جاري الإرسال...')).toBeNull())
})
