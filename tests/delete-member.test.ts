// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest'
import {createDeleteMemberHandler} from '../supabase/functions/delete-member/handler'
const admin='10000000-0000-4000-8000-000000000001',member='10000000-0000-4000-8000-000000000002'
let actor:any,profiles:Record<string,any>,deleted:ReturnType<typeof vi.fn>
const origin='https://qaadetna.vercel.app'
const invoke=(body:any={user_id:member,confirmation:'member'},authorization='Bearer valid',method='POST',requestOrigin=origin)=>createDeleteMemberHandler({origin,getUser:async token=>token==='valid'?actor:null,getProfile:async id=>profiles[id]||null,deleteUser:deleted})(new Request(origin+'/delete-member',{method,headers:{authorization,origin:requestOrigin,'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(body):undefined}))
beforeEach(()=>{actor={id:admin};profiles={[admin]:{id:admin,role:'admin',status:'approved',username:'admin'},[member]:{id:member,role:'user',status:'approved',username:'member'}};deleted=vi.fn(async()=>true)})
it('deletes only after verified auth, current admin role and exact username confirmation',async()=>{
  const response=await invoke();expect(response.status).toBe(200);expect(await response.json()).toEqual({deleted:true});expect(deleted).toHaveBeenCalledWith(member)
})
it('rejects unauthenticated/invalid tokens and members spoofing a body role',async()=>{
  expect((await invoke({},'')).status).toBe(401)
  expect((await invoke({},'Bearer forged')).status).toBe(401)
  actor={id:member};expect((await invoke({user_id:admin,confirmation:'admin',role:'admin'})).status).toBe(403)
  expect(deleted).not.toHaveBeenCalled()
})
it('rejects suspended admins, self-deletion, other admins and incorrect confirmation',async()=>{
  profiles[admin].status='suspended';expect((await invoke()).status).toBe(403)
  profiles[admin].status='approved';expect((await invoke({user_id:admin,confirmation:'admin'})).status).toBe(403)
  profiles[member].role='admin';expect((await invoke()).status).toBe(403)
  profiles[member].role='user';expect((await invoke({user_id:member,confirmation:'wrong'})).status).toBe(400)
  expect(deleted).not.toHaveBeenCalled()
})
it('reports a failed Auth deletion without claiming success; enforces methods and origin',async()=>{
  deleted.mockResolvedValue(false);expect((await invoke()).status).toBe(409)
  expect((await invoke({},'Bearer valid','GET')).status).toBe(405)
  expect((await invoke({},'Bearer valid','OPTIONS')).status).toBe(204)
  expect((await invoke({},'Bearer valid','POST','https://untrusted.example')).status).toBe(403)
})
