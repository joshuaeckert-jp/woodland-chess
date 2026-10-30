import {expect,test} from '@playwright/test'

async function start(page: import('@playwright/test').Page, mode:'ai'|'local'='ai'){
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.goto('/?mode=checkmate&new=1')
 await page.locator('#cm-loading').waitFor({state:'hidden'})
 await page.selectOption('#cm-match-kind','skirmish')
 await page.selectOption('#cm-play-mode',mode)
 await page.locator('#cm-start-deployment').click()
 await expect(page.locator('#cm-loading')).toBeHidden()
}

test('support shrines name the player and opponent, including after a board flip',async({page})=>{
 await start(page)
 await expect(page.locator('[data-owner="own"] header')).toContainText('Your cards')
 await expect(page.locator('[data-owner="opponent"] header')).toContainText('Opponent’s cards')
 await expect(page.locator('[data-owner="own"]')).toHaveAttribute('aria-label',/Your cards/)
 await expect(page.locator('#cm-near-bank [data-owner="own"]')).toHaveCount(1)
 await expect(page.locator('#cm-hand-label')).toContainText('Your hand')
 await page.locator('#cm-menu-button').click()
 await page.locator('#cm-flip').click()
 await expect(page.locator('[data-owner="own"] header')).toContainText('Your cards')
 await expect(page.locator('[data-owner="opponent"] header')).toContainText('Opponent’s cards')
 await expect(page.locator('#cm-near-bank [data-owner="own"]')).toHaveCount(1)
 await expect(page.locator('#cm-hand-label')).toContainText('Your hand')
})

test('local shrines name both sides and keep the active side visible on a phone',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'})
 const page=await context.newPage()
 await start(page,'local')
 await expect(page.locator('[data-owner="ivory"] header')).toContainText('Ivory cards')
 await expect(page.locator('[data-owner="charcoal"] header')).toContainText('Charcoal cards')
 const turnMark=await page.locator('.cm-support-bank[data-active="true"] header b').evaluate(node=>getComputedStyle(node,'::after').content)
 expect(turnMark).toContain('TURN')
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
 await context.close()
})

test('a legacy full-army deployment save is completed once and stays a battle after reload',async({page})=>{
 await page.goto('/?mode=checkmate&new=1')
 await page.locator('#cm-loading').waitFor({state:'hidden'})
 await page.waitForFunction(()=>Boolean((window as any).checkmate))
 await page.evaluate(()=>{
  const current=(window as any).checkmate.state
  const game={
   schema:1,
   ruleset:'project-checkmate-0.4',
   seed:current.options.seed,
   rosters:current.options.rosters,
   log:[
    {type:'deploy',player:'w',unitId:'w-unit-0',to:'e1'},
    {type:'deploy',player:'b',unitId:'b-unit-0',to:'e8'},
   ],
   supportLimit:3,
   armyMode:'full',
   combatRules:'hp',
  }
  localStorage.setItem('project-checkmate-save-v1',JSON.stringify({format:'checkmate-session-v1',game,play:{mode:'local',human:'w',difficulty:'normal'}}))
 })
 await page.goto('/?mode=checkmate')
 await page.locator('#cm-loading').waitFor({state:'hidden'})
 await page.waitForFunction(()=>Boolean((window as any).checkmate)&&((window as any).checkmate.state.phase==='battle'))
 const first=await page.evaluate(()=>{const state=(window as any).checkmate.state;return {white:state.units.find((unit:any)=>unit.id==='w-unit-0').square,black:state.units.find((unit:any)=>unit.id==='b-unit-0').square,log:state.log.length}})
 expect(first).toMatchObject({white:'e1',black:'e8',log:32})
 await expect(page.locator('#cm-auto-deploy')).toHaveCount(0)
 await expect(page.locator('#cm-panel [data-deploy]')).toHaveCount(0)
 await page.reload()
 await page.locator('#cm-loading').waitFor({state:'hidden'})
 await page.waitForFunction(()=>Boolean((window as any).checkmate)&&((window as any).checkmate.state.phase==='battle'))
 const second=await page.evaluate(()=>{const state=(window as any).checkmate.state;return {white:state.units.find((unit:any)=>unit.id==='w-unit-0').square,black:state.units.find((unit:any)=>unit.id==='b-unit-0').square,log:state.log.length}})
 expect(second).toEqual(first)
})
