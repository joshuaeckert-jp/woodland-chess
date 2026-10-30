import {expect,test,type Page} from '@playwright/test'

async function setup(page:Page,mode='ai',side='w',difficulty='normal'){
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.goto('/?mode=checkmate&new=1');await page.locator('#cm-board').waitFor();await page.locator('#cm-loading').waitFor({state:'hidden'})
 await page.selectOption('#cm-match-kind','skirmish')
 await page.selectOption('#cm-human',side);await page.selectOption('#cm-difficulty',difficulty);await page.selectOption('#cm-play-mode',mode);await page.locator('#cm-seed').fill('1')
}
const state=(page:Page)=>page.evaluate(()=>(window as any).checkmate.state)
const settled=(page:Page)=>expect.poll(()=>page.evaluate(()=>(window as any).checkmate.busy),{timeout:15000}).toBe(false)
async function install(page:Page){const card=page.locator('#cm-hand [data-card-id],#cm-card-view [data-card-id]').first();await card.press(' ');await expect(page.locator('#cm-preview')).toBeVisible();await page.locator('#cm-confirm').click();await expect(page.locator('#cm-preview')).toBeHidden()}

test('selected opening deals exactly five and automatic draws are visible without spending another action',async({page})=>{
 await setup(page,'local');await page.selectOption('#cm-hand-mode','selected')
 const chosen=['banner','brace','smoke','field-dressing','aimed-shot']
 await expect(page.locator('#cm-opening-count')).toContainText('5/5')
 await page.locator('input[name="opening-card"][value="smoke"]').uncheck();await expect(page.locator('#cm-start-deployment')).toBeDisabled()
 await page.locator('input[name="opening-card"][value="vines"]').check();await expect(page.locator('#cm-opening-count')).toContainText('5/5')
 await page.locator('#cm-start-deployment').click();if(await page.locator('#cm-auto-deploy').isVisible())await page.locator('#cm-auto-deploy').click()
 let game=await state(page);expect(game.players.w.hand.map((c:any)=>c.definitionId)).toEqual(['banner','brace','field-dressing','aimed-shot','vines'])
 await expect(page.locator('#cm-draw-note')).toContainText('Opening hands dealt')
 for(let i=0;i<4;i++){await install(page);await settled(page)}
 game=await state(page);expect(game.log).toHaveLength(36);expect(game.players.w.ownTurn).toBe(3);expect(game.players.w.deck).toHaveLength(6)
 await expect(page.locator('#cm-draw-note')).toContainText('Ivory drew')
 await expect(page.locator('#cm-hand .tcg-card--new')).toHaveCount(1)
 await expect(page.locator('.cm-deck-summary')).toContainText('6 in deck')
 await page.reload();await page.locator('#cm-board').waitFor();await page.locator('#cm-loading').waitFor({state:'hidden'});expect((await state(page)).log).toEqual(game.log)
 void chosen
})

for(const difficulty of ['easy','normal','hard'])test(`woodland ${difficulty} responds once, draws, and undoes a human decision with its reply`,async({page})=>{
 await setup(page,'ai','w',difficulty);await page.locator('#cm-start-deployment').click();if(await page.locator('#cm-auto-deploy').isVisible())await page.locator('#cm-auto-deploy').click();await install(page);await settled(page)
 let game=await state(page);expect(game.turn).toBe('w');expect(game.log).toHaveLength(34);expect(game.log.at(-1).player).toBe('b')
 const support=page.locator('#cm-support .ready').first();await support.press(' ');await page.locator('[data-square="e2"]').click();const from=await page.locator('[data-square="e2"]').boundingBox(),to=await page.locator('[data-square="e4"]').boundingBox();if(!from||!to)throw new Error('Missing ordered move squares');await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12});await page.mouse.up();await settled(page)
 game=await state(page);expect(game.log).toHaveLength(36);expect(game.turn).toBe('w');expect(game.players.w.ownTurn).toBe(3);expect(game.players.w.deck).toHaveLength(6)
 await expect(page.locator('#cm-draw-note')).toContainText('Ivory drew')
 await page.locator('#cm-menu-button').click();await page.locator('#cm-undo').click();expect((await state(page)).log).toHaveLength(34);expect((await state(page)).players.w.deck).toHaveLength(7)
 await page.locator('#cm-menu-close').click();await page.reload();await page.locator('#cm-board').waitFor();await page.locator('#cm-loading').waitFor({state:'hidden'});expect(await page.evaluate(()=>(window as any).checkmate.play)).toMatchObject({mode:'ai',human:'w',difficulty});await settled(page);expect((await state(page)).log).toHaveLength(34)
})

test('the opponent deploys when playing Ivory and new game cancels a pending response',async({page})=>{
 await setup(page,'ai','b','hard');await page.locator('#cm-start-deployment').click();await settled(page)
 let game=await state(page);expect(game.phase).toBe('battle');expect(game.turn).toBe('b');expect(game.log).toHaveLength(33)
 await install(page);await page.locator('#cm-menu-button').click();await page.locator('#cm-new').click();await page.selectOption('#cm-match-kind','skirmish');await page.selectOption('#cm-play-mode','local');await page.locator('#cm-start-deployment').click();await page.waitForTimeout(1700)
 game=await state(page);expect(game.phase).toBe('battle');expect(game.log).toHaveLength(32)
})

test('phone setup and the dealt hand fit and retain keyboard controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page,'local');await page.selectOption('#cm-hand-mode','selected');await expect(page.locator('#cm-opening-builder')).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390)
 await page.locator('#cm-start-deployment').click();if(await page.locator('#cm-auto-deploy').isVisible())await page.locator('#cm-auto-deploy').click();await page.locator('[data-square="e2"]').focus();await page.keyboard.press('ArrowRight');await expect(page.locator('[data-square="f2"]')).toBeFocused()
 await expect(page.locator('.cm-deck-summary')).toContainText('7 in deck');await page.screenshot({path:'review/checkmate-ai-hand-phone.png'})
})

test('reload during the opponent turn resumes exactly one pending response',async({page})=>{
 await setup(page,'ai','w','hard');await page.locator('#cm-start-deployment').click();if(await page.locator('#cm-auto-deploy').isVisible())await page.locator('#cm-auto-deploy').click();await install(page)
 await page.reload();await page.locator('#cm-board').waitFor();await page.locator('#cm-loading').waitFor({state:'hidden'});await settled(page)
 let game=await state(page);expect(game.log).toHaveLength(34);expect(game.turn).toBe('w')
 await page.waitForTimeout(500);game=await state(page);expect(game.log).toHaveLength(34)
 expect(await page.evaluate(()=>(window as any).checkmate.play)).toMatchObject({mode:'ai',human:'w',difficulty:'hard'})
})
