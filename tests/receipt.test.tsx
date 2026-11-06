import React from 'react'
import {cleanup,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
vi.mock('../src/lib',()=>({egp:(n:number)=>`${n} جنيه`,dt:(s:string)=>s}))
vi.mock('../src/ui',()=>({btn2:'',card:''}))
import GatheringReceipt from '../src/GatheringReceipt'
import {drinkSummary} from '../src/orders'
afterEach(cleanup)
const line=(name:string,quantity:number,price:number,status?:'pending'|'received'):any=>({item_name_snapshot:name,quantity,unit_price_snapshot:price,delivery_status:status})
it('groups drinks by name and price with counts, line totals and a grand total of everything ordered',()=>{
  const s=drinkSummary([line('شاي',2,10,'received'),line('شاي',1,10,'pending'),line('قهوة',1,25,'pending'),line('شاي',1,12,'received')])
  expect(s.rows).toEqual([{name:'شاي',price:10,qty:3,total:30},{name:'شاي',price:12,qty:1,total:12},{name:'قهوة',price:25,qty:1,total:25}].sort((a,b)=>b.qty-a.qty||a.name.localeCompare(b.name,'ar')))
  expect(s.totalQty).toBe(5);expect(s.total).toBe(67);expect(s.receivedTotal).toBe(32);expect(s.pendingTotal).toBe(35)
})
it('uses exact cents',()=>{expect(drinkSummary([line('x',3,0.1),line('x',3,0.1)]).total).toBe(0.6)})
it('renders each drink, its count and the final total; handles an empty gathering',()=>{
  render(<GatheringReceipt title="قعدة الخميس" orders={[line('شاي',2,10,'received'),line('قهوة',1,25,'pending')]}/>)
  expect(screen.getByText('شاي')).toBeTruthy();expect(screen.getByText('قهوة')).toBeTruthy();expect(screen.getByText('45 جنيه')).toBeTruthy();expect(screen.getByText('إجمالي 3 مشروب')).toBeTruthy()
  cleanup();render(<GatheringReceipt title="x" orders={[]}/>);expect(screen.getByText(/لا توجد مشروبات/)).toBeTruthy()
})
