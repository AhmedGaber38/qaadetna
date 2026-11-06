import React from 'react'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),rows:[] as any[],eq:vi.fn()}))
vi.mock('../src/lib',()=>({sb:{rpc:mocks.rpc,from:()=>{const q:any={select:()=>q,eq:(...args:any[])=>{mocks.eq(...args);return q},is:()=>q,order:()=>q,limit:async()=>({data:mocks.rows,error:null})};return q}},toast:vi.fn(),useRealtime:vi.fn()}))
vi.mock('../src/ui',()=>({btn2:''}))
import AdminNotifications from '../src/AdminNotifications'
afterEach(cleanup)
beforeEach(()=>{vi.clearAllMocks();mocks.rows=[{id:'n1',order_id:'o',member_name:'محمد',item_name:'شاي',quantity:2},{id:'n2',order_id:'o',member_name:'محمد',item_name:'شاي',quantity:2}]})
it('deduplicates a new order and persists read state before hiding it',async()=>{
  mocks.rpc.mockImplementation(async()=>{mocks.rows=[];return {error:null}})
  render(<AdminNotifications userId="admin"/>);await screen.findByRole('complementary')
  expect(screen.getAllByText('محمد: شاي × 2')).toHaveLength(1)
  expect(mocks.eq).toHaveBeenCalledWith('admin_id','admin')
  fireEvent.click(screen.getByRole('button',{name:'تم الاطلاع'}))
  await waitFor(()=>expect(screen.queryByRole('complementary')).toBeNull())
  expect(mocks.rpc).toHaveBeenCalledWith('qa_read_notifications',{p_ids:['n2']})
})
