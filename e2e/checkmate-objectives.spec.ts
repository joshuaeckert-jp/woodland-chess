import {expect,test,type Page} from '@playwright/test'
const state=(p:Page)=>p.evaluate(()=>(window as any).checkmate.state)
const settled=(p:Page)=>expect.poll(()=>p.evaluate(()=>(window as any).checkmate.busy)).toBe(false)
async function boot(p:Page){await p.emulateMedia({reducedMotion:'reduce'});await p.goto('/?mode=checkmate&encounter=tower&new=1');await p.locator('#cm-loading').waitFor({state:'hidden'});await p.locator('[data-encounter-id=tower]').click();await p.locator('#cm-start-deployment').click()}
async function move(p:Page,card:number,from:string,to:string){await p.locator(`[data-support-side=w] [data-card-id="w-enc-support-${card}"]`).press('Space');const a=(await p.locator(`[data-square=${from}]`).boundingBox())!,b=(await p.locator(`[data-square=${to}]`).boundingBox())!;await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await p.mouse.up();await settled(p)}
async function shot(p:Page){await p.locator('[data-card-id="w-enc-support-0"]').press('Space');await p.locator('#cm-tower-fire').click();await p.locator('[data-square=d5]').click();await settled(p)}

test('objectives check off from real actions, undo and reload restore their state',async({page})=>{
 await boot(page)
 const goals=page.locator('#cm-objectives')
 await expect(goals).toHaveAttribute('open','')
 await expect(goals.locator('[data-goal-id=defeat-sentinel]')).toHaveAttribute('data-active','true')
 await expect(goals.locator('[data-goal-id=reach-exit]')).toHaveAttribute('data-active','false')
 await expect(goals).toContainText('4 actions left')
 await move(page,1,'b2','d3');await shot(page)
 await expect(goals.locator('[data-goal-id=defeat-sentinel]')).toHaveAttribute('data-done','true')
 await expect(goals.locator('[data-goal-id=reach-exit]')).toHaveAttribute('data-active','true')
 await expect(goals).toContainText('2 actions left')
 await page.locator('#cm-menu-button').click();await page.locator('#cm-undo').click()
 await expect(goals.locator('[data-goal-id=defeat-sentinel]')).toHaveAttribute('data-done','false')
 await page.reload();await page.locator('#cm-loading').waitFor({state:'hidden'});await page.waitForFunction(()=>Boolean((window as any).checkmate))
 await expect(goals.locator('[data-goal-id=defeat-sentinel]')).toHaveAttribute('data-done','false')
 await shot(page);await move(page,2,'d2','e3');await move(page,1,'d3','e5')
 await expect(goals).toHaveAttribute('data-result','complete')
 await expect(goals.locator('li[data-done=true]')).toHaveCount(2)
})

test('phone checklist fits above the opponent altar; compact screens can expand it and request a hint',async({browser})=>{
 for(const [width,height] of [[390,844],[500,800],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),p=await context.newPage();await boot(p)
  const goals=p.locator('#cm-objectives'),box=(await goals.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width)
  expect(await p.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  if(width===390){await expect(goals).toHaveAttribute('open','');const owner=(await p.locator('[data-owner=opponent] header').boundingBox())!;expect(box.y+box.height).toBeLessThanOrEqual(owner.y)}else{await expect(goals).not.toHaveAttribute('open');await goals.locator('summary').press('Enter');await expect(goals).toHaveAttribute('open','')}
  await goals.locator('[data-objective-hint]').click();await expect(p.locator('#cm-encounter-brief')).toBeVisible();await expect(p.locator('#cm-encounter-brief details')).toHaveAttribute('open','')
  expect((await state(p)).log).toHaveLength(0)
  await p.locator('#cm-encounter-close').click();await p.screenshot({path:`review/checklist-${width}.png`});await context.close()
 }
})
