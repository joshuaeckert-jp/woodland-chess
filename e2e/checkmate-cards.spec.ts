import{expect,test,type Page}from'@playwright/test'
async function boot(page:Page){await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/?mode=checkmate&new=1');await page.locator('#cm-board').waitFor();await page.locator('#cm-loading').waitFor({state:'hidden'});await page.selectOption('#cm-match-kind','skirmish');await page.selectOption('#cm-play-mode','local');await page.locator('#cm-seed').fill('1');await page.locator('#cm-start-deployment').click();if(await page.locator('#cm-auto-deploy').isVisible())await page.locator('#cm-auto-deploy').click()}
const state=(page:Page)=>page.evaluate(()=>(window as any).checkmate.state)
async function readFirst(page:Page){const card=page.locator('#cm-hand [data-card-id]').first();await card.press('Enter');await expect(page.locator('#cm-card-reader')).toBeVisible()}
async function install(page:Page){const card=page.locator('#cm-hand [data-card-id],#cm-card-view [data-card-id]').first();await card.press(' ');await expect(page.locator('#cm-preview')).toBeVisible();await page.locator('#cm-confirm').click();await expect.poll(()=>page.evaluate(()=>(window as any).checkmate.busy)).toBe(false)}
async function drag(page:Page,target: {x:number;y:number},cancel=false){let card=page.locator('#cm-hand [data-card-id]').first(),rect=(await card.boundingBox())!;await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height*.35);await page.waitForTimeout(180);if(await page.locator('#cm-card-view [data-card-id]').count())card=page.locator('#cm-card-view [data-card-id]').first();rect=(await card.boundingBox())!;await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height*.35);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:12});await expect(page.locator('.cm-card-ghost')).toBeVisible();if(cancel)await page.keyboard.press('Escape');await page.mouse.up()}

test('cards enlarge with complete rules, unit cards show stats, and each player has three slots',async({page})=>{
 await boot(page);await expect(page.locator('[data-support-side="w"] [data-slot]')).toHaveCount(3);await expect(page.locator('[data-support-side="b"] [data-slot]')).toHaveCount(3)
 await readFirst(page);const face=page.locator('#cm-card-view .tcg-card--preview');expect((await face.boundingBox())!.width).toBeGreaterThan(260);await expect(face.locator('.tcg-card__effect')).toContainText('Expires after its next own turn');await expect(page.locator('#cm-card-reader button.primary')).toHaveCount(0)
 await page.keyboard.press('Escape');await page.locator('[data-square="e1"]').click();await expect(page.locator('#cm-unit-copy .tcg-unit-card')).toBeVisible();await expect(page.locator('.tcg-unit-card__stats')).toContainText('HP 8/8')
})

test('dragging to the support row installs once; opponent and cancelled drops spend nothing',async({page})=>{
 await boot(page);const before=await page.evaluate(()=>localStorage.getItem('project-checkmate-save-v1'));let box=(await page.locator('#cm-opponent-support').boundingBox())!;await drag(page,{x:box.x+box.width/2,y:box.y+box.height/2});expect(await page.evaluate(()=>localStorage.getItem('project-checkmate-save-v1'))).toBe(before)
 await page.waitForTimeout(360);box=(await page.locator('#cm-support').boundingBox())!;await drag(page,{x:box.x+box.width/2,y:box.y+box.height/2},true);expect(await page.evaluate(()=>localStorage.getItem('project-checkmate-save-v1'))).toBe(before)
 await page.waitForTimeout(360);await drag(page,{x:box.x+box.width/2,y:box.y+box.height/2});await expect.poll(async()=>(await state(page)).log.length).toBe(33);await expect(page.locator('.cm-card-ghost')).toHaveCount(0);expect((await state(page)).players.w.support).toHaveLength(1)
 await expect.poll(()=>page.evaluate(()=>(window as any).checkmate.busy)).toBe(false);await install(page);await page.locator('#cm-support [data-card-id]').first().press('Enter');await expect(page.locator('#cm-card-reader')).toBeVisible()
})

test('three occupied slots reject another card without consuming the turn',async({page})=>{
 await boot(page);for(let i=0;i<6;i++)await install(page)
 expect((await state(page)).players.w.support).toHaveLength(3);const blocked=page.locator('#cm-hand [data-card-id]').first();await blocked.press(' ');await expect(page.locator('#cm-preview')).toBeHidden();await page.keyboard.press('Escape')
 const before=await page.evaluate(()=>localStorage.getItem('project-checkmate-save-v1')),box=(await page.locator('#cm-support').boundingBox())!;await drag(page,{x:box.x+box.width/2,y:box.y+box.height/2});expect(await page.evaluate(()=>localStorage.getItem('project-checkmate-save-v1'))).toBe(before)
})

test('an Order taps its card while an effect discards it and frees its slot',async({page})=>{
 await boot(page);await install(page);await install(page);const order=page.locator('#cm-support [data-card-id]').first();await order.press(' ');await page.locator('[data-square="e2"]').click();const from=(await page.locator('[data-square="e2"]').boundingBox())!,to=(await page.locator('[data-square="e4"]').boundingBox())!;await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12});await page.mouse.up();await expect.poll(()=>page.evaluate(()=>(window as any).checkmate.busy)).toBe(false)
 await expect(page.locator('[data-support-side="w"] .tcg-exhausted')).toHaveCount(1);expect((await state(page)).players.w.support).toHaveLength(1)
 const effect=page.locator('#cm-support [data-card-id]').first();await effect.press('E');await page.locator('[data-square="e8"]').click();await page.locator('#cm-confirm').click();await expect.poll(()=>page.evaluate(()=>(window as any).checkmate.busy)).toBe(false);expect((await state(page)).players.b.discard).toHaveLength(1);expect((await state(page)).players.b.support).toHaveLength(0)
})

test('real touch dragging on phone installs a card and bank ownership follows the board flip',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();await boot(page);const card=page.locator('#cm-hand [data-card-id]').last(),a=(await card.boundingBox())!,bank=(await page.locator('#cm-support').boundingBox())!,start={x:a.x+a.width/2,y:a.y+22},end={x:bank.x+bank.width/2,y:bank.y+bank.height/2},cdp=await context.newCDPSession(page)
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/8,y:start.y+(end.y-start.y)*i/8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(async()=>(await state(page)).log.length).toBe(33)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.locator('#cm-menu-button').click();await page.locator('#cm-flip').click();await page.locator('#cm-menu-close').click();await expect(page.locator('#cm-far-bank [data-support-side="w"]')).toHaveCount(1);await page.screenshot({path:'review/tcg-touch-phone.png'});const last=page.locator('#cm-hand [data-card-id]').last(),r=(await last.boundingBox())!;await page.touchscreen.tap(r.x+r.width*.6,r.y+22);await expect(page.locator('#cm-card-reader')).toBeVisible();await page.screenshot({path:'review/tcg-touch-reader.png'});await context.close()
})

test('the board remains dominant at portrait sizes and a stationary hover does not cycle cards',async({page})=>{
 await page.setViewportSize({width:652,height:1004});await boot(page);await page.emulateMedia({reducedMotion:'no-preference'})
 let board=await page.locator('#cm-board').boundingBox();expect(board?.width).toBeGreaterThanOrEqual(460)
 const card=page.locator('#cm-hand [data-card-id]').first(),id=await card.getAttribute('data-card-id'),box=await card.boundingBox();if(!box)throw new Error('Missing hand card')
 await page.evaluate(()=>{(window as any).__cmLiftMutations=0;new MutationObserver(records=>{(window as any).__cmLiftMutations+=records.length}).observe(document.querySelector('#cm-card-view')!,{childList:true,subtree:true})})
 await page.mouse.move(box.x+box.width*.5,box.y+22);await expect(page.locator('#cm-card-view [data-card-id]')).toHaveAttribute('data-card-id',id!)
 await page.waitForTimeout(3000);await expect(page.locator('#cm-card-view [data-card-id]')).toHaveAttribute('data-card-id',id!);expect(await page.evaluate(()=>(window as any).__cmLiftMutations)).toBeLessThanOrEqual(1)
 await page.screenshot({path:'review/checkmate-portrait-652x1004.png'})
 await page.setViewportSize({width:390,height:844});board=await page.locator('#cm-board').boundingBox();expect(board?.width).toBeGreaterThanOrEqual(350);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
