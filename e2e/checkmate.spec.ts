import { expect,test,type Page } from '@playwright/test'

async function boot(page: Page) {
  await page.goto('/?mode=checkmate&new=1')
  await page.locator('#cm-board').waitFor({state:'attached'})
  await page.locator('#cm-loading').waitFor({state:'hidden'})
  await expect(page.locator('#cm-setup')).toBeVisible()
  await page.selectOption('#cm-match-kind','skirmish')
  await page.selectOption('#cm-play-mode','local')
  await page.selectOption('#cm-hand-mode','shuffled')
  await page.locator('#cm-seed').fill('1')
  await page.locator('#cm-start-deployment').click()
}

test('Checkmate builds armies, deploys, and preserves a replay save', async ({page}) => {
  await boot(page)
  await expect(page.locator('#cm-status')).toContainText('to act')
  await expect.poll(()=>page.evaluate(()=>((window as any).checkmate.state.log.length))).toBe(32)
  if(await page.locator('#cm-auto-deploy').isVisible())await page.locator('#cm-auto-deploy').click()
  await expect(page.locator('#cm-status')).toContainText('to act')
  await expect(page.locator('[data-square]')).toHaveCount(64)
  await expect(page.locator('#cm-hand [data-card-id]')).toHaveCount(5)
  await page.reload()
  await page.locator('#cm-loading').waitFor({state:'hidden'})
  await expect(page.locator('#cm-status')).toContainText('to act')
})

test('Checkmate installs through the real preview, keeps the replay after reload, and returns to Classic', async ({page}) => {
  await boot(page)
  if(await page.locator('#cm-auto-deploy').isVisible())await page.locator('#cm-auto-deploy').click()
  const card=page.locator('#cm-hand [data-card-id]').first()
  await card.press(' ')
  await expect(page.locator('#cm-preview')).toBeVisible()
  await page.locator('#cm-confirm').click()
  await expect.poll(()=>page.evaluate(()=>((window as any).checkmate.state.log.length))).toBe(33)
  await expect(page.locator('#cm-status')).toContainText('Charcoal')
  await page.reload()
  await page.locator('#cm-board').waitFor({state:'attached'})
  await page.locator('#cm-loading').waitFor({state:'hidden'})
  await expect.poll(()=>page.evaluate(()=>((window as any).checkmate.state.log.length))).toBe(33)
  await page.locator('#cm-menu-button').click()
  await page.locator('#cm-classic').click()
  await expect(page.locator('#board')).toBeVisible()
})

test('Checkmate remains usable on a phone viewport and exposes local controls', async ({page}) => {
  await boot(page)
  if(await page.locator('#cm-auto-deploy').isVisible())await page.locator('#cm-auto-deploy').click()
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.locator('#cm-menu-button').click()
  await expect(page.locator('#cm-menu')).toBeVisible()
  await page.locator('#cm-menu-close').click()
  await expect(page.locator('#cm-menu')).toBeHidden()
})

test('installed cards burn once and later orders move exactly one animal per turn', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'})
  await boot(page)
  if(await page.locator('#cm-auto-deploy').isVisible())await page.locator('#cm-auto-deploy').click()
  const state=()=>page.evaluate(()=>(window as any).checkmate.state)
  const commit=async()=>{await page.locator('#cm-confirm').click();await expect(page.locator('#cm-squares button').first()).toBeEnabled()}
  const install=async()=>{const card=page.locator('#cm-hand [data-card-id],#cm-card-view [data-card-id]').first();await card.press(' ');await page.locator('#cm-confirm').click();await expect(page.locator('#cm-squares button').first()).toBeEnabled()}
  await install();await install()
  for(const square of ['e1','e8']){
    const support=page.locator('#cm-support [data-card-id]').first();await support.press('E')
    await page.locator(`[data-square="${square}"]`).click()
    await expect(page.locator('#cm-preview-copy')).toContainText('permanently discarded')
    await commit()
  }
  let game=await state()
  expect(game.players.w.support).toHaveLength(0)
  expect(game.players.b.support).toHaveLength(0)
  expect(game.players.w.discard).toHaveLength(1)
  expect(game.units.find((u:any)=>u.square==='e1').equipment.weapon).toBe(true)
  await install();await install()
  for(const [from,to] of [['e2','e4'],['e7','e5']]){
    const support=page.locator('#cm-support [data-card-id]').first();await support.press(' ');await page.locator(`[data-square="${from}"]`).click();const source=await page.locator(`[data-square="${from}"]`).boundingBox(),target=await page.locator(`[data-square="${to}"]`).boundingBox();if(!source||!target)throw new Error('Missing ordered squares');await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:12});await page.mouse.up();await expect(page.locator('#cm-squares button').first()).toBeEnabled()
  }
  game=await state()
  expect(game.turn).toBe('w')
  expect(game.players.w.ownTurn).toBe(5)
  expect(game.units.find((u:any)=>u.square==='e4').side).toBe('w')
  expect(game.units.find((u:any)=>u.square==='e5').side).toBe('b')
  expect(game.log).toHaveLength(40)
  await page.reload();await page.locator('#cm-board').waitFor();await page.locator('#cm-loading').waitFor({state:'hidden'})
  expect((await state()).log).toEqual(game.log)
})

test('mode switching preserves the existing classic position and save', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.goto('/');await page.locator('#board').waitFor();await page.locator('#loading').waitFor({state:'hidden'})
  await expect(page.locator('#new-game-settings')).toBeVisible()
  await page.selectOption('#mode','local');await page.locator('#start-game').click()
  await page.locator('[data-square="e2"]').click();await page.locator('[data-square="e4"]').click()
  await expect.poll(()=>page.evaluate(()=>(window as any).woodland.busy)).toBe(false)
  const classic=await page.evaluate(()=>({fen:(window as any).woodland.fen,save:localStorage.getItem('woodland-chess-game-v1')}))
  await page.locator('#menu-button').click();await page.locator('#new').click()
  await page.selectOption('#ruleset','checkmate');await page.locator('#start-game').click()
  await page.locator('#cm-board').waitFor();await page.locator('#cm-loading').waitFor({state:'hidden'});await page.selectOption('#cm-match-kind','skirmish')
  await page.selectOption('#cm-play-mode','local')
  await page.selectOption('#cm-hand-mode','shuffled')
  await page.locator('#cm-seed').fill('1')
  await page.locator('#cm-start-deployment').click();if(await page.locator('#cm-auto-deploy').isVisible())await page.locator('#cm-auto-deploy').click()
  await page.locator('#cm-menu-button').click();await page.locator('#cm-classic').click()
  await page.locator('#board').waitFor();await page.locator('#loading').waitFor({state:'hidden'})
  expect(await page.evaluate(()=>(window as any).woodland.fen)).toBe(classic.fen)
  expect(await page.evaluate(()=>localStorage.getItem('woodland-chess-game-v1'))).toBe(classic.save)
})

test('nonlethal attacks retain defenders and King defeat offers a fresh match', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'})
  await boot(page)
  expect((await page.evaluate(()=>(window as any).checkmate.state)).phase).toBe('battle')
  expect((await page.evaluate(()=>(window as any).checkmate.state)).log).toHaveLength(32)
  await page.evaluate(()=>{const api=(window as any).checkmate;api.reset(api.state.options)})
  const commit=async()=>{await page.locator('#cm-confirm').click();await expect(page.locator('#cm-squares button').first()).toBeEnabled()}
  const place=async(role:string,square:string)=>{
    const id=await page.evaluate(role=>{const g=(window as any).checkmate.state;return g.units.find((u:any)=>u.side===g.turn&&u.role===role&&!u.square).id},role)
    await page.locator(`[data-unit-id="${id}"]`).click();await page.locator(`[data-square="${square}"]`).click();await commit()
  }
  await place('k','e1');await place('k','d7');await place('q','d2')
  if(await page.locator('#cm-auto-deploy').isVisible())await page.locator('#cm-auto-deploy').click()
  const install=async()=>{const card=page.locator('#cm-hand [data-card-id],#cm-card-view [data-card-id]').first();await card.press(' ');await page.locator('#cm-confirm').click();await expect(page.locator('#cm-squares button').first()).toBeEnabled()}
  const attack=async(from:string,to:string)=>{
    const support=page.locator('#cm-support .ready').first();await support.press(' ');await page.locator(`[data-square="${from}"]`).click();const source=await page.locator(`[data-square="${from}"]`).boundingBox(),target=await page.locator(`[data-square="${to}"]`).boundingBox();if(!source||!target)throw new Error('Missing attack squares');await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:12});await page.mouse.up();await expect(page.locator('#cm-squares button').first()).toBeEnabled()
  }
  await install();await install();await attack('d2','d7')
  let game=await page.evaluate(()=>(window as any).checkmate.state)
  expect(game.units.find((u:any)=>u.side==='b'&&u.role==='k')).toMatchObject({hp:5,square:'d7'})
  expect(game.units.find((u:any)=>u.side==='w'&&u.role==='q')).toMatchObject({square:'d6'})
  await attack('d7','d6');await install();await install();await attack('d6','d7');await attack('d7','d6');await install();await install();await attack('d6','d7')
  await expect(page.locator('#cm-result')).toBeVisible()
  await expect(page.locator('#cm-result-copy')).toContainText('Ivory wins')
  await page.locator('#cm-play-again').click();await expect(page.locator('#cm-setup')).toBeVisible();await page.selectOption('#cm-match-kind','skirmish')
  await page.selectOption('#cm-play-mode','local')
  await page.selectOption('#cm-hand-mode','shuffled')
  await page.locator('#cm-seed').fill('1')
  await page.locator('#cm-start-deployment').click()
  expect((await page.evaluate(()=>(window as any).checkmate.state)).phase).toBe('battle')
  expect((await page.evaluate(()=>(window as any).checkmate.state)).log).toHaveLength(32)
})
