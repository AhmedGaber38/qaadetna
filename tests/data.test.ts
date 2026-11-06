import {expect,it,vi} from 'vitest'
import {allRows} from '../src/data'
it('reads every page for complete billing totals',async()=>{
  const range=vi.fn(async(from:number,to:number)=>({data:Array.from({length:Math.max(0,Math.min(to+1,1200)-from)},(_,i)=>({id:i+from})),error:null}))
  const result=await allRows(()=>({range}))
  expect(result.data).toHaveLength(1200);expect(range).toHaveBeenCalledTimes(4)
})
it('returns an error instead of silently returning partial invoice rows',async()=>{
  const range=vi.fn().mockResolvedValueOnce({data:[1,2],error:null}).mockResolvedValueOnce({data:null,error:{message:'offline'}})
  const result=await allRows(()=>({range}),2)
  expect(result.data).toEqual([]);expect(result.error.message).toBe('offline')
})
it('handles a Supabase server row cap lower than the requested page size',async()=>{
  const values=Array.from({length:120},(_,id)=>({id}))
  const result=await allRows(()=>({range:async(from:number)=>({data:values.slice(from,from+50),error:null})}))
  expect(result.data).toHaveLength(120)
})
