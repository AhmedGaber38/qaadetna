import type {Order} from './lib'
import {received,sumOrders} from './orders'
export type AccountStatus='open'|'pending'|'paid'
export type Account={id:string;gathering_id:string;user_id:string;seq:number;status:AccountStatus;opened_at:string;closed_at:string|null}
export type ReceiptItem={name:string;qty:number;unit_price:number;total:number;pending?:boolean}
export type ReceiptData={member:string;gathering:string;started_at:string;account_no:number;items:ReceiptItem[];total:number;paid_at?:string|null;confirmed_by?:string|null}
export type Payment={id:string;account_id:string;gathering_id:string;user_id:string;member_name:string;amount:number;status:'pending'|'confirmed'|'cancelled';requested_at:string;confirmed_at:string|null;confirmed_by_name:string|null;receipt:ReceiptData|null}
export type LedgerKind='payment'|'expense'|'adjustment'|'correction'
export type LedgerEntry={id:string;gathering_id:string;kind:LedgerKind;amount:number;description:string;member_name:string|null;created_by_name:string|null;confirmed_by_name:string|null;created_at:string}
export type Custody={id:string;gathering_id:string;from_name:string|null;to_user:string;to_name:string;amount:number;status:'pending'|'confirmed'|'cancelled';handed_at:string;confirmed_at:string|null;confirmed_by_name:string|null}

export const PAY_LABEL:Record<AccountStatus,string>={open:'لم يدفع',pending:'في انتظار تأكيد الدفع',paid:'مدفوع بالكامل'}
export const KIND_LABEL:Record<LedgerKind,string>={payment:'دفعة مؤكدة',expense:'مصروف',adjustment:'تسوية',correction:'تصحيح'}
const cents=(n:number)=>Math.round(Number(n)*100)

export const accountOrders=(orders:Order[],a:Account)=>orders.filter(o=>o.account_id===a.id)
export const accountTotal=(orders:Order[],a:Account)=>sumOrders(accountOrders(orders,a))
export const accountPending=(orders:Order[],a:Account)=>accountOrders(orders,a).filter(o=>!received(o)).length

// Presence is derived: an unpaid account means the member is still here; a paid account that is
// the member's latest means they left after settling; an older paid account means they came back.
export function stateLabel(a:Account,all:Account[]){
  if(a.status==='open')return 'حساب مفتوح ولم يدفع'
  if(a.status==='pending')return 'في انتظار تأكيد الدفع'
  const later=all.some(x=>x.user_id===a.user_id&&x.gathering_id===a.gathering_id&&x.seq>a.seq)
  return later?'حساب سابق (عاد بعد الدفع)':'غادر بعد الدفع'
}

export function receiptFromOrders(a:Account,orders:Order[],member:string,g:{title:string;started_at:string}):ReceiptData{
  const mine=accountOrders(orders,a).slice().sort((x,y)=>x.created_at.localeCompare(y.created_at))
  return {member,gathering:g.title,started_at:g.started_at,account_no:a.seq,total:sumOrders(mine),
    items:mine.map(o=>({name:o.item_name_snapshot,qty:o.quantity,unit_price:Number(o.unit_price_snapshot),total:cents(Number(o.unit_price_snapshot)*o.quantity)/100,pending:!received(o)}))}
}

export function walletTotals(ledger:LedgerEntry[]){
  const sum=(f:(e:LedgerEntry)=>boolean)=>ledger.filter(f).reduce((s,e)=>s+cents(e.amount),0)/100
  return {collected:sum(e=>e.kind==='payment'),expenses:-sum(e=>e.kind==='expense'),other:sum(e=>e.kind==='adjustment'||e.kind==='correction'),balance:sum(()=>true)}
}

export function sessionStats(orders:Order[],accounts:Account[],ledger:LedgerEntry[]){
  const unpaid=accounts.filter(a=>a.status!=='paid'),unpaidUsers=new Set(unpaid.map(a=>a.user_id))
  const paidUsers=new Set(accounts.filter(a=>a.status==='paid'&&!unpaidUsers.has(a.user_id)).map(a=>a.user_id))
  const w=walletTotals(ledger)
  return {present:unpaidUsers.size,drinks:orders.reduce((s,o)=>s+o.quantity,0),accountsTotal:sumOrders(orders),
    due:Math.round(unpaid.reduce((s,a)=>s+cents(accountTotal(orders,a)),0))/100,paidMembers:paidUsers.size,unpaidMembers:unpaidUsers.size,...w}
}

export function receiptText(r:ReceiptData,status:AccountStatus,fmt:(n:number)=>string,date:(s:string)=>string){
  return [`إيصال قعدتنا — ${r.member}`,`${r.gathering} · ${date(r.started_at)}`,...(r.account_no>1?[`حساب رقم ${r.account_no}`]:[]),'',
    ...r.items.map(i=>`${i.name} × ${i.qty} × ${fmt(i.unit_price)} = ${fmt(i.total)}${i.pending?' (قيد التحضير — غير محسوب)':''}`),'',
    `إجمالي الحساب: ${fmt(r.total)}`,`الحالة: ${PAY_LABEL[status]}`,...(r.paid_at?[`تاريخ الدفع: ${date(r.paid_at)}`]:[]),...(r.confirmed_by?[`أكّد الاستلام: ${r.confirmed_by}`]:[])].join('\n')
}
