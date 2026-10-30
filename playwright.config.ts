import { defineConfig } from '@playwright/test'
export default defineConfig({testDir:'./e2e',timeout:30000,workers:1,use:{baseURL:'http://localhost:5173',channel:'chrome',headless:true,launchOptions:{args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']},viewport:{width:1280,height:900}},reporter:'list'})
