import {test,expect,Page} from '@playwright/test'
// Browser integration tests against a deterministic fake Supabase API. These do
// not assert live credentials, deployed Edge Functions, email or real Realtime.
const admin='10000000-0000-4000-8000-000000000001',member='10000000-0000-4000-8000-000000000002'
const g='20000000-0000-4000-8000-000000000001',item='30000000-0000-4000-8000-000000000001'
async function setup(page:Page,role:'admin'|'user',pending=false,reminder=false){
  const uid=role==='admin'?admin:member
  const now=new Date().toISOString()
  const profiles=[{id:admin,full_name:'المدير',username:'admin',role:'admin',status:'approved',created_at:now},{id:member,full_name:'محمد',username:'member',role:'user',status:'approved',created_at:now}]
  const orders:any[]=pending?[{id:'50000000-0000-4000-8000-000000000001',user_id:uid,gathering_id:'previous-gathering',item_name_snapshot:'شاي',unit_price_snapshot:10,quantity:2,total_price:20,delivery_status:'pending',created_at:now}]:[]
  let reminderClaimed=false
  const notices:any[]=[]
  const calls:any[]=[]
  await page.addInitScript(({uid,role})=>{
    const b64=(obj:any)=>btoa(JSON.stringify(obj)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
    const token=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:uid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.local-test'
    localStorage.setItem('sb-qaadetna-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id:uid,aud:'authenticated',role:'authenticated',email:'test@example.com',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}}))
    localStorage.setItem('qaadetna_sound','off')
  },{uid,role})
  await page.routeWebSocket('**/realtime/v1/**',ws=>{ws.close()})
  await page.route('https://qaadetna-test.supabase.co/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname
    const ok=(body:any)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)})
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}})
    if(path.includes('/auth/'))return ok({user:{id:uid}})
    if(path.includes('/functions/v1/delete-member')){const body=req.postDataJSON();calls.push({name:'delete-member',body});return ok({deleted:true})}
    if(path.includes('/rpc/')){
      const name=path.split('/').pop(),body=req.postData()?req.postDataJSON():{};calls.push({name,body})
      if(name==='qa_submit_order_batch')for(const line of body.p_items){
        const order={id:crypto.randomUUID(),user_id:uid,gathering_id:g,item_name_snapshot:'شاي',unit_price_snapshot:10,quantity:line.quantity,total_price:10*line.quantity,delivery_status:'pending',created_at:now};orders.unshift(order)
        notices.push({id:crypto.randomUUID(),admin_id:admin,order_id:order.id,member_name:profiles.find(p=>p.id===uid)?.full_name,item_name:'شاي',quantity:line.quantity,read_at:null,created_at:now})
      }
      if(name==='qa_confirm_order'){const order=orders.find(o=>o.id===body.p_order);if(order){order.delivery_status='received';order.received_at=now}}
      if(name==='qa_admin_update_profile'){const p=profiles.find(p=>p.id===body.p_user);if(p&&body.p_name)p.full_name=body.p_name}
      if(name==='qa_claim_reminder'&&reminder&&!reminderClaimed){reminderClaimed=true;return ok([{order_id:orders[0].id,item_name:'شاي',quantity:2,claim_token:'token'}])}
      if(name==='qa_claim_reminder')return ok([])
      if(name==='qa_renew_reminder')return ok(true)
      if(name==='qa_read_notifications')for(const n of notices)if(body.p_ids.includes(n.id))n.read_at=now
      return ok(null)
    }
    let data:any[]=[]
    if(path.endsWith('/profiles'))data=profiles
    if(path.endsWith('/orders'))data=orders
    if(path.endsWith('/menu_items'))data=[{id:item,name:'شاي',price:10,is_active:true,is_archived:false}]
    if(path.endsWith('/gatherings'))data=[{id:g,title:'قعدة الاختبار',status:'active',started_at:now,closed_at:null}]
    if(path.endsWith('/admin_order_notifications'))data=notices
    for(const [key,value] of url.searchParams)if(value.startsWith('eq.'))data=data.filter(row=>String(row[key])===value.slice(3));else if(value==='is.null')data=data.filter(row=>row[key]==null)
    const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000)
    return ok(data.slice(offset,offset+limit))
  })
  await page.goto('/')
  return {orders,calls,notices}
}
test('admin orders for themselves, confirms delivery and appears in the detailed invoice only after ordering',async({page})=>{
  await setup(page,'admin')
  await expect(page.getByRole('button',{name:'اطلب لنفسي'})).toBeVisible()
  await expect(page.locator('details')).toHaveCount(0)
  await page.getByRole('button',{name:'اطلب لنفسي'}).click()
  await page.getByRole('button',{name:'زيادة شاي'}).click()
  await page.getByRole('button',{name:'زيادة شاي'}).click()
  await page.getByRole('button',{name:'إرسال الطلبات للمدير'}).click()
  await expect(page.getByText('قيد التحضير',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'وصل شاي'}).click()
  await expect(page.getByText('تم الاستلام',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'الفواتير',exact:true}).click()
  // Reload ensures a fetch after confirmation even with fake Realtime disabled.
  await page.reload()
  await expect(page.locator('summary')).toContainText('المدير')
  await page.locator('summary').click()
  await expect(page.getByText('تم الاستلام',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'تعديل طلب شاي'})).toBeVisible()
  await page.getByRole('button',{name:'تم الاطلاع',exact:true}).click()
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await page.locator('summary').click()
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth',page.viewportSize()!.width)
  await page.screenshot({path:'test-results/admin-mobile.png',fullPage:true})
})
test('member can receive an order from a previous/closed gathering and gets a server-backed reminder',async({page})=>{
  const state=await setup(page,'user',true,true)
  await expect(page.getByRole('dialog')).toContainText('مشروبك وصل؟')
  await page.getByRole('button',{name:'لسه',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.calls.some(c=>c.name==='qa_snooze_order')).toBeTruthy()
  await page.getByRole('button',{name:'طلباتي',exact:true}).click()
  await expect(page.getByText('قيد التحضير',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'وصل شاي'}).click()
  await expect(page.getByText('تم الاستلام',{exact:true})).toBeVisible()
  expect(state.orders[0].delivery_status).toBe('received')
  await page.screenshot({path:'test-results/member-mobile.png',fullPage:true})
})
test('admin renames a member and permanent deletion requires typing the username',async({page})=>{
  const state=await setup(page,'admin')
  await page.getByRole('button',{name:'الأعضاء',exact:true}).click()
  const memberCard=page.locator('div.rounded-2xl').filter({has:page.getByText('@member',{exact:true})}).last()
  await memberCard.getByRole('button',{name:'تعديل الاسم',exact:true}).click()
  await memberCard.getByLabel('الاسم الظاهر').fill('محمد الجديد')
  await memberCard.getByRole('button',{name:'حفظ الاسم'}).click()
  await expect(memberCard.getByText('محمد الجديد',{exact:true})).toBeVisible()
  await memberCard.getByRole('button',{name:'حذف نهائي',exact:true}).click()
  const modal=page.getByRole('dialog')
  await expect(modal.getByRole('button',{name:'تأكيد الحذف النهائي'})).toBeDisabled()
  await modal.getByRole('textbox').fill('member')
  await modal.getByRole('button',{name:'تأكيد الحذف النهائي'}).click()
  await expect(modal).toHaveCount(0)
  expect(state.calls.some(c=>c.name==='delete-member'&&c.body.confirmation==='member')).toBeTruthy()
})
