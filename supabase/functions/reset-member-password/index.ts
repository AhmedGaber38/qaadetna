import {createClient} from 'npm:@supabase/supabase-js@2.119.0'
import {createResetPasswordHandler} from './handler.ts'
const url=Deno.env.get('SUPABASE_URL')
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const origin=Deno.env.get('APP_ORIGIN')||'https://qaadetna.vercel.app'
if(!url||!serviceKey)throw new Error('Missing server-side Supabase environment')
const client=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
Deno.serve(createResetPasswordHandler({
  origin,
  getUser:async(token)=>{const {data,error}=await client.auth.getUser(token);return error?null:data.user},
  getProfile:async(id)=>{const {data,error}=await client.from('profiles').select('id,role,status,username').eq('id',id).maybeSingle();if(error)throw error;return data},
  setPassword:async(id,password)=>{const {error}=await client.auth.admin.updateUserById(id,{password});if(error)console.error('Password update failed:',error.code||error.status);return !error}
}))
