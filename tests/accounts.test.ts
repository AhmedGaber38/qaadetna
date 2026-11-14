import {expect,it} from 'vitest'
import {accountPending,accountTotal,receiptFromOrders,receiptText,sessionStats,stateLabel,walletTotals} from '../src/accounts'
const acc=(id:string,user:string,seq:number,status:'open'|'pending'|'paid'):any=>({id,gathering_id:'g',user_id:user,seq,status,opened_at:'2026-11-14T10:00:00Z',closed_at:null})
const ord=(account:string,user:string,name:string,qty:number,price:number,status:'pending'|'received'='received',at='2026-11-14T10:00:00Z'):any=>({id:account+name+qty,account_id:account,user_id:user,item_name_snapshot:name,quantity:qty,unit_price_snapshot:price,delivery_status:status,created_at:at})
it('totals count only received drinks and report drinks still being prepared',()=>{
  const a=acc('a1','m',1,'open'),orders=[ord('a1','m','شاي',2,10),ord('a1','m','قهوة',1,25,'pending'),ord('a2','x','شاي',9,10)]
  expect(accountTotal(orders,a)).toBe(20);expect(accountPending(orders,a)).toBe(1)
})
it('derives presence: open, pending, left after paying, and returned with a newer account',()=>{
  const all=[acc('a1','m',1,'paid'),acc('a2','m',2,'open'),acc('b1','n',1,'paid'),acc('c1','o',1,'pending')]
  expect(stateLabel(all[0],all)).toContain('عاد');expect(stateLabel(all[1],all)).toContain('مفتوح')
  expect(stateLabel(all[2],all)).toBe('غادر بعد الدفع');expect(stateLabel(all[3],all)).toContain('انتظار')
})
it('wallet balance equals collected minus expenses plus documented adjustments',()=>{
  const e=(kind:any,amount:number):any=>({kind,amount})
  const w=walletTotals([e('payment',100),e('payment',150),e('payment',80),e('expense',-200),e('adjustment',-10)])
  expect(w).toEqual({collected:330,expenses:200,other:-10,balance:120})
  expect(walletTotals([e('payment',100),e('payment',150),e('payment',80),e('expense',-200)]).balance).toBe(130)
})
it('session stats separate paid and unpaid members and keep owner-based totals',()=>{
  const accounts=[acc('a1','m',1,'paid'),acc('b1','n',1,'open'),acc('c1','o',1,'paid'),acc('c2','o',2,'open')]
  const orders=[ord('a1','m','شاي',2,10),ord('b1','n','قهوة',1,25),ord('c1','o','شاي',1,10),ord('c2','o','شاي',3,10)]
  const s=sessionStats(orders,accounts,[{kind:'payment',amount:20} as any])
  expect(s).toMatchObject({present:2,drinks:7,accountsTotal:85,due:55,paidMembers:1,unpaidMembers:2,collected:20,balance:20})
})
it('builds an itemised receipt and share text with the payment state',()=>{
  const a=acc('a1','m',2,'open'),orders=[ord('a1','m','شاي',2,10),ord('a1','m','قهوة',1,25,'pending')]
  const r=receiptFromOrders(a,orders,'محمد',{title:'قعدة',started_at:'2026-11-14T10:00:00Z'})
  expect(r.total).toBe(20);expect(r.items).toHaveLength(2);expect(r.items[1].pending).toBe(true)
  const text=receiptText(r,'open',n=>`${n} ج`,s=>s)
  expect(text).toContain('شاي × 2 × 10 ج = 20 ج');expect(text).toContain('حساب رقم 2');expect(text).toContain('لم يدفع')
})
