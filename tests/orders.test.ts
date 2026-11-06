import {expect,it} from 'vitest'
import {dateKey,invoiceGroups,orderTotal,received,sumOrders} from '../src/orders'
const line=(user:string,status?:'pending'|'received',price=10,quantity=2):any=>({user_id:user,delivery_status:status,unit_price_snapshot:price,quantity,total_price:9999})
it('counts received and legacy orders, excludes pending and stale stored totals',()=>{
  expect(sumOrders([line('m','received'),line('m','pending'),line('m')])).toBe(40)
  expect(received(line('m'))).toBe(true)
  expect(orderTotal(line('m','received',0.1,3))).toBe(0.3)
})
it('does not invent a zero-balance admin and retains actual orders of suspended members',()=>{
  const users:any=[{id:'a',full_name:'Admin',role:'admin',status:'approved'},{id:'m',full_name:'Member',status:'suspended'}]
  const groups=invoiceGroups([line('m','received'),line('m','pending')],users)
  expect(groups).toHaveLength(1);expect(groups[0]).toMatchObject({name:'Member',due:20,pending:20})
  expect(invoiceGroups([line('a','pending')],users)[0]).toMatchObject({name:'Admin',due:0,pending:20})
})
it('filters dates in Cairo rather than slicing UTC, including summer time',()=>{
  expect(dateKey('2026-11-06T22:30:00Z')).toBe('2026-11-07')
  expect(dateKey('2026-07-01T21:30:00Z')).toBe('2026-07-02')
  expect(dateKey('bad-date')).toBe('')
})
