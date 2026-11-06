import {defineConfig,devices} from '@playwright/test'
export default defineConfig({
  testDir:'./e2e',fullyParallel:false,workers:1,retries:0,
  reporter:[['list'],['html',{open:'never',outputFolder:'playwright-report'}]],
  use:{baseURL:'http://127.0.0.1:4173',...devices['Pixel 7'],trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:false,env:{VITE_SUPABASE_URL:'https://qaadetna-test.supabase.co',VITE_SUPABASE_ANON_KEY:'local-test-anon'},timeout:30000}
})
