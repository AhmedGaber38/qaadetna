// Dependency injection keeps authorization behavior testable without Deno or secrets.
type Profile={id:string;role:string;status:string;username:string}
export type DeleteDependencies={
  origin:string;
  getUser:(token:string)=>Promise<{id:string}|null>;
  getProfile:(id:string)=>Promise<Profile|null>;
  deleteUser:(id:string)=>Promise<boolean>;
}
export function createDeleteMemberHandler(deps:DeleteDependencies){
  return async(req:Request):Promise<Response>=>{
    const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':deps.origin,'Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'}
    const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers})
    if(req.headers.get('origin')&&req.headers.get('origin')!==deps.origin)return reply(403,{error:'Origin not allowed'})
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
    if(req.method!=='POST')return reply(405,{error:'Method not allowed'})
    const authorization=req.headers.get('authorization')||''
    if(!/^Bearer\s+\S+$/i.test(authorization))return reply(401,{error:'Authentication required'})
    try{
      // Validate the token with Supabase Auth; never trust JWT decoding or body roles.
      const actor=await deps.getUser(authorization.replace(/^Bearer\s+/i,''))
      if(!actor)return reply(401,{error:'Invalid session'})
      const admin=await deps.getProfile(actor.id)
      if(!admin||admin.role!=='admin'||admin.status!=='approved')return reply(403,{error:'Approved admin required'})
      let body:any
      try{body=await req.json()}catch{return reply(400,{error:'Invalid JSON'})}
      if(typeof body?.user_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.user_id)||typeof body.confirmation!=='string')return reply(400,{error:'Invalid request'})
      if(body.user_id===actor.id)return reply(403,{error:'Self deletion is not allowed'})
      const target=await deps.getProfile(body.user_id)
      if(!target)return reply(404,{error:'Member not found'})
      if(target.role==='admin')return reply(403,{error:'Admin deletion is not allowed'})
      if(body.confirmation!==target.username)return reply(400,{error:'Username confirmation does not match'})
      // Auth Admin API + BEFORE DELETE trigger are one database transaction.
      // If a foreign key/storage dependency blocks deletion, no partial cleanup commits.
      if(!await deps.deleteUser(target.id))return reply(409,{error:'Account could not be deleted; inspect server logs and database dependencies'})
      return reply(200,{deleted:true})
    }catch{return reply(503,{error:'Deletion service unavailable'})}
  }
}
