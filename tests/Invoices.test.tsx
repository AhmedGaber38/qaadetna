import React from 'react'
import {cleanup,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
vi.mock('../src/lib',()=>({egp:(n:number)=>`${n} جنيه`,dt:(s:string)=>s}))
vi.mock('../src/ui',()=>({btn2:'',card:''}))
import Invoices from '../src/Invoices'
afterEach(cleanup)
it('shows expandable mobile details, delivery states and received-only totals without an idle admin',()=>{
  const users:any=[{id:'admin',full_name:'المدير',role:'admin',status:'approved'},{id:'m',full_name:'محمد',role:'user'}]
  const orders:any=[{id:'1',user_id:'m',item_name_snapshot:'شاي',quantity:2,unit_price_snapshot:10,delivery_status:'received',created_at:'date'},{id:'2',user_id:'m',item_name_snapshot:'قهوة',quantity:1,unit_price_snapshot:25,delivery_status:'pending',created_at:'date'}]
  const {container}=render(<Invoices users={users} orders={orders} onEdit={vi.fn()} onDelete={vi.fn()}/>)
  expect(screen.queryByText('المدير')).toBeNull();expect(screen.getByText('محمد')).toBeTruthy()
  expect(container.querySelectorAll('details')).toHaveLength(1)
  expect(container.querySelector('summary')?.textContent).toContain('20 جنيه');expect(screen.getByText(/قيد التحضير: 25 جنيه/)).toBeTruthy()
  expect(screen.getByText('تم الاستلام')).toBeTruthy();expect(screen.getByText('قيد التحضير')).toBeTruthy()
})
