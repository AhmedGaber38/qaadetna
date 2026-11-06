// Supabase's REST response is capped (usually 1,000 rows). Financial totals must
// not silently stop at that cap. Every caller supplies a deterministic ordering.
export async function allRows<T>(build:()=>any,pageSize=500):Promise<{data:T[];error:any}>{
  const rows:T[]=[]
  try{
    for(let from=0;;){
      const {data,error}=await build().range(from,from+pageSize-1)
      if(error)return {data:[],error}
      rows.push(...(data||[]))
      if(!data?.length)return {data:rows,error:null}
      // Advance by the returned size: projects may configure a cap below ours.
      from+=data.length
    }
  }catch(error){return {data:[],error}}
}
