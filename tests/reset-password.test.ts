// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest'
import {createResetPasswordHandler} from '../supabase/functions/reset-member-password/handler'
const admin='10000000-0000-4000-8000-000000000001',member='10000000-0000-4000-8000-000000000002'
let actor:any,profiles:Record<string,any>,setPassword:ReturnType<typeof vi.fn>
const origin='https://qaadetna.vercel.app'
const invoke=(body:any={user_id:member,password:'newpass1'},authorization='Bearer valid',method='POST',requestOrigin=origin)=>createResetPasswordHandler({origin,getUser:async token=>token==='valid'?actor:null,getProfile:async id=>profiles[id]||null,setPassword})(new Request(origin+'/reset-member-password',{method,headers:{authorization,origin:requestOrigin,'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(body):undefined}))
beforeEach(()=>{actor={id:admin};profiles={[admin]:{id:admin,role:'admin',status:'approved',username:'admin'},[member]:{id:member,role:'user',status:'approved',username:'member'}};setPassword=vi.fn(async()=>true)})
it('sets a new password only after verified auth and current approved-admin role',async()=>{
  const response=await invoke();expect(response.status).toBe(200);expect(await response.json()).toEqual({updated:true});expect(setPassword).toHaveBeenCalledWith(member,'newpass1')
})
it('rejects invalid tokens, members and suspended admins',async()=>{
  expect((await invoke({},'')).status).toBe(401)
  expect((await invoke({},'Bearer forged')).status).toBe(401)
  actor={id:member};expect((await invoke({user_id:admin,password:'newpass1'})).status).toBe(403)
  actor={id:admin};profiles[admin].status='suspended';expect((await invoke()).status).toBe(403)
  expect(setPassword).not.toHaveBeenCalled()
})
it('validates password length, refuses self and admin targets, reports failures honestly',async()=>{
  expect((await invoke({user_id:member,password:'12345'})).status).toBe(400)
  expect((await invoke({user_id:member,password:'x'.repeat(73)})).status).toBe(400)
  expect((await invoke({user_id:admin,password:'newpass1'})).status).toBe(403)
  profiles[member].role='admin';expect((await invoke()).status).toBe(403)
  profiles[member].role='user';expect((await invoke({user_id:'10000000-0000-4000-8000-000000000009',password:'newpass1'})).status).toBe(404)
  expect(setPassword).not.toHaveBeenCalled()
  setPassword.mockResolvedValue(false);expect((await invoke()).status).toBe(409)
})
it('enforces methods and origin',async()=>{
  expect((await invoke({},'Bearer valid','GET')).status).toBe(405)
  expect((await invoke({},'Bearer valid','OPTIONS')).status).toBe(204)
  expect((await invoke({},'Bearer valid','POST','https://untrusted.example')).status).toBe(403)
})
