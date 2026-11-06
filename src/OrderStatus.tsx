import type {Order} from './lib'
import {received} from './orders'
export default function OrderStatus({order}:{order:Order}){
  const done=received(order)
  return <span className={'inline-block rounded-full px-3 py-1 text-xs font-bold '+(done?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-900')}>{done?'تم الاستلام':'قيد التحضير'}</span>
}
