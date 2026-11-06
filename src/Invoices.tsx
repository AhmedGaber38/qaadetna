import {Pencil,Trash2} from 'lucide-react'
import {Order,Profile,egp,dt} from './lib'
import {invoiceGroups,orderTotal} from './orders'
import {btn2,card} from './ui'
import OrderStatus from './OrderStatus'
export default function Invoices({orders,users,onEdit,onDelete,busy=false}:{orders:Order[];users:Profile[];onEdit:(o:Order)=>void;onDelete:(o:Order)=>void;busy?:boolean}){
  const groups=invoiceGroups(orders,users)
  if(!groups.length)return <p className={card+' text-center'}>لا توجد طلبات في هذا العرض</p>
  return <div className="space-y-3">{groups.map(g=><details key={g.id} className={card}>
    <summary className="cursor-pointer space-y-1"><span className="font-bold">{g.name}</span><span className="mr-2 text-sm">المستحق: <b>{egp(g.due)}</b></span><span className="block text-xs text-stone-500">{g.orders.length} طلب · قيد التحضير: {egp(g.pending)}</span></summary>
    <div className="mt-3 space-y-3">{g.orders.map(o=><article key={o.id} className="space-y-2 border-t border-amber-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><b>{o.item_name_snapshot}</b><OrderStatus order={o}/></div>
      <p className="text-sm">{o.quantity} × {egp(o.unit_price_snapshot)} = <b>{egp(orderTotal(o))}</b></p>
      <p className="text-xs text-stone-500">الطلب: {dt(o.created_at)}{o.received_at&&<> · الاستلام: {dt(o.received_at)}</>}</p>
      <div className="flex gap-2"><button className={btn2} disabled={busy} aria-label={`تعديل طلب ${o.item_name_snapshot}`} onClick={()=>onEdit(o)}><Pencil size={16}/></button><button className={btn2} disabled={busy} aria-label={`حذف طلب ${o.item_name_snapshot}`} onClick={()=>onDelete(o)}><Trash2 size={16}/></button></div>
    </article>)}</div>
  </details>)}</div>
}
