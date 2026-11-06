import React from 'react'
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),toast:vi.fn(),refresh:()=>{},order:null as any}))
vi.mock('../src/lib',()=>({sb:{rpc:mocks.rpc,from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:mocks.order,error:null})})})})},toast:mocks.toast,useRealtime:(_:string,fn:()=>void)=>{mocks.refresh=fn}}))
vi.mock('../src/ui',()=>({btn:'',btn2:''}))
import OrderReminders from '../src/OrderReminders'
const reminder={order_id:'o',item_name:'شاي',quantity:2,claim_token:'token'}
beforeEach(()=>{vi.clearAllMocks();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'})})
afterEach(()=>{cleanup();vi.useRealTimers()})
it('shows a server-claimed reminder and persists a 15-minute snooze',async()=>{
  mocks.rpc.mockImplementation(async(name:string)=>({data:name==='qa_claim_reminder'?[reminder]:null,error:null}))
  render(<OrderReminders userId="member"/>);await screen.findByRole('dialog')
  fireEvent.click(screen.getByRole('button',{name:'لسه'}))
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
  expect(mocks.rpc).toHaveBeenCalledWith('qa_snooze_order',{p_order:'o',p_token:'token'})
})
it('does not acknowledge locally when the server fails',async()=>{
  mocks.rpc.mockImplementation(async(name:string)=>name==='qa_claim_reminder'?{data:[reminder],error:null}:{error:{message:'offline'}})
  render(<OrderReminders userId="member"/>);await screen.findByRole('dialog')
  fireEvent.click(screen.getByRole('button',{name:'وصل'}))
  await waitFor(()=>expect(mocks.toast).toHaveBeenCalled())
  expect(screen.getByRole('dialog')).toBeTruthy()
})
it('uses a read-only Realtime check and dismisses a reminder confirmed in another tab',async()=>{
  mocks.rpc.mockImplementation(async(name:string)=>({data:name==='qa_claim_reminder'?[reminder]:false,error:null}))
  render(<OrderReminders userId="member"/>);await screen.findByRole('dialog')
  await act(async()=>{mocks.refresh()})
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
  expect(mocks.rpc).not.toHaveBeenCalledWith('qa_renew_reminder',expect.anything())
})
it('does not poll while hidden',async()=>{
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'})
  render(<OrderReminders userId="member"/>);await act(async()=>{})
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('renews its server lease every 30 seconds while the dialog stays visible',async()=>{
  vi.useFakeTimers()
  mocks.rpc.mockImplementation(async(name:string)=>({data:name==='qa_claim_reminder'?[reminder]:true,error:null}))
  await act(async()=>{render(<OrderReminders userId="member"/>)})
  expect(screen.getByRole('dialog')).toBeTruthy()
  await act(async()=>{await vi.advanceTimersByTimeAsync(30000)})
  expect(mocks.rpc).toHaveBeenCalledWith('qa_renew_reminder',{p_order:'o',p_token:'token'})
})
it('hides a stale popup before the server lease can expire when heartbeat hangs',async()=>{
  vi.useFakeTimers()
  mocks.rpc.mockImplementation((name:string)=>name==='qa_claim_reminder'?Promise.resolve({data:[reminder],error:null}):new Promise(()=>{}))
  await act(async()=>{render(<OrderReminders userId="member"/>)})
  expect(screen.getByRole('dialog')).toBeTruthy()
  await act(async()=>{await vi.advanceTimersByTimeAsync(61000)})
  expect(screen.queryByRole('dialog')).toBeNull()
})
