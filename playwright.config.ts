import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e', timeout:150000, expect:{timeout:20000}, fullyParallel:false, workers:1, retries:0,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1440,height:1050},screenshot:'only-on-failure',trace:'retain-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1050},launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}}}],
  webServer:{command:'npm run build && npm run preview -- --host 127.0.0.1',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,timeout:120000},
});
