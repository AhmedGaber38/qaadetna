import type {Order,Profile} from './lib'
export const APP_TIME_ZONE='Africa/Cairo'
export const received=(o:Pick<Order,'delivery_status'>)=>!o.delivery_status||o.delivery_status==='received'
export const orderTotal=(o:Pick<Order,'unit_price_snapshot'|'quantity'>)=>Math.round((Number(o.unit_price_snapshot)*o.quantity+Number.EPSILON)*100)/100
export const sumOrders=(orders:Order[],completedOnly=true)=>Math.round(orders.filter(o=>!completedOnly||received(o)).reduce((s,o)=>s+Math.round(orderTotal(o)*100),0))/100
export function invoiceGroups(orders:Order[],profiles:Profile[]){
  const groups=new Map<string,{id:string;name:string;orders:Order[];due:number;pending:number}>()
  for(const order of orders){
    let group=groups.get(order.user_id)
    if(!group){group={id:order.user_id,name:profiles.find(p=>p.id===order.user_id)?.full_name||'عضو غير متاح',orders:[],due:0,pending:0};groups.set(order.user_id,group)}
    group.orders.push(order)
  }
  return [...groups.values()].map(g=>({...g,due:sumOrders(g.orders),pending:sumOrders(g.orders.filter(o=>!received(o)),false)}))
}
export function dateKey(value:string){
  const date=new Date(value)
  if(!Number.isFinite(date.getTime()))return ''
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:APP_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
  const get=(key:string)=>parts.find(p=>p.type===key)?.value||''
  return `${get('year')}-${get('month')}-${get('day')}`
}
export const formatDate=(value:string)=>new Intl.DateTimeFormat('ar-EG',{timeZone:APP_TIME_ZONE,dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
