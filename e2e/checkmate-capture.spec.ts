import { expect, test, type Page } from '@playwright/test'

const state = (page: Page) => page.evaluate(() => (window as any).checkmate.state)

async function boot(page: Page, armyMode: 'skirmish' | 'reinforcement' = 'skirmish') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?mode=checkmate&rules=capture&new=1')
  await page.locator('#cm-board').waitFor()
  await page.locator('#cm-loading').waitFor({ state: 'hidden' })
  await expect(page.locator('#cm-combat-rules')).toHaveValue('capture')
  await page.selectOption('#cm-match-kind', 'skirmish')
  await page.selectOption('#cm-play-mode', 'local')
  if (armyMode === 'reinforcement') await page.selectOption('#cm-army-mode', armyMode)
  await page.locator('#cm-seed').fill('1')
  await page.locator('#cm-start-deployment').click()
  if (await page.locator('#cm-auto-deploy').isVisible()) await page.locator('#cm-auto-deploy').click()
}

async function center(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`Missing ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + (selector.includes('#cm-hand')?22:box.height / 2) }
}

async function drag(page: Page, from: string, to: string) {
  const source = await center(page, from), target = await center(page, to)
  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await page.mouse.up()
}

async function armInstall(page: Page) {
  const card = page.locator('#cm-hand [data-card-id]').first()
  const before = await state(page)
  await drag(page, '#cm-hand [data-card-id]', '#cm-support')
  expect((await state(page)).log).toEqual(before.log)
  return card
}

test('capture URL preselects its rules and a skirmish starts with both armies deployed', async ({ page }) => {
  await boot(page)
  const game = await state(page)
  expect(game.options.combatRules).toBe('capture')
  expect(game.phase).toBe('battle')
  expect(game.units.filter((unit: any) => unit.square)).toHaveLength(32)
})

test('capture install is armed at the altar, click-previewed, and direct-drag committed atomically', async ({ page }) => {
  await boot(page)
  const before = await state(page)
  await armInstall(page)
  await page.locator('[data-square="e2"]').click()
  await page.locator('[data-square="e4"]').click()
  await expect(page.locator('#cm-preview')).toBeVisible()
  await page.locator('#cm-confirm').click()
  await expect.poll(async () => (await state(page)).log.length).toBe(before.log.length + 1)
  expect((await state(page)).log.at(-1)).toMatchObject({ type: 'install', unitId: expect.any(String), kind: 'move', to: 'e4' })

  await page.reload()
  await page.locator('#cm-loading').waitFor({ state: 'hidden' })
  expect((await state(page)).options.combatRules).toBe('capture')

  const nextBefore = await state(page)
  await armInstall(page)
  await drag(page, '[data-square="e7"]', '[data-square="e5"]')
  await expect.poll(async () => (await state(page)).log.length).toBe(nextBefore.log.length + 1)
  expect((await state(page)).log.at(-1)).toMatchObject({ type: 'install', kind: 'move', to: 'e5' })
  await expect(page.locator('#cm-preview')).toBeHidden()
})

test('Escape cancels an armed capture install without changing state', async ({ page }) => {
  await boot(page)
  const before = await state(page)
  await page.locator('#cm-hand [data-card-id]').first().press('Space')
  await page.locator('[data-square="e2"]').click()
  await page.locator('[data-square="e4"]').click()
  await expect(page.locator('#cm-preview')).toBeVisible()
  await page.keyboard.press('Escape')
  expect(await state(page)).toEqual(before)
  await expect(page.locator('#cm-preview')).toBeHidden()
})

test('capture presentation removes HP combat stats, while HP remains selectable for a new match', async ({ page }) => {
  await boot(page, 'reinforcement')
  const reserve = page.locator('#cm-hand [data-card-kind="unit"]').first()
  await expect(reserve).toBeVisible()
  await expect(reserve).not.toContainText(/HP|ATK|DEF/i)
  await page.locator('[data-square="e1"]').hover()
  const hover = page.locator('#cm-unit-hover')
  await expect(hover).toBeVisible({ timeout: 700 })
  await expect(hover).not.toContainText(/HP|ATK|DEF|health/i)
  await expect(hover).not.toHaveAttribute('aria-label', /health/i)

  await page.locator('#cm-menu-button').click()
  await page.locator('#cm-new').click()
  await page.selectOption('#cm-match-kind', 'skirmish')
  await page.selectOption('#cm-combat-rules', 'hp')
  await expect(page.locator('#cm-combat-rules')).toHaveValue('hp')
  await page.locator('#cm-start-deployment').click()
  if (await page.locator('#cm-auto-deploy').isVisible()) await page.locator('#cm-auto-deploy').click()
  await page.locator('[data-square="e1"]').hover()
  await expect(page.locator('#cm-unit-hover')).toContainText(/HP 8\/8/)
})

test('a capture installation removes the defender and a ready altar card casts Guard without numeric stats',async({page})=>{
 await boot(page)
 async function compound(side:string,cardName:string,from:string,to:string){
  await page.locator('#cm-hand [data-card-id]').filter({hasText:cardName}).press(' ')
  await drag(page,`[data-square="${from}"]`,`[data-square="${to}"]`)
  await expect.poll(()=>page.evaluate(()=>(window as any).checkmate.busy)).toBe(false)
 }
 await compound('w','Piercing Banner','e2','e4')
 await compound('b','Piercing Banner','d7','d5')
 const victim=(await state(page)).units.find((u:any)=>u.square==='d5')
 await compound('w','Iron Shield','e4','d5')
 expect((await state(page)).units.find((u:any)=>u.id===victim.id).square).toBeNull()
 expect((await state(page)).log.at(-1)).toMatchObject({type:'install',kind:'attack',to:'d5'})
 await compound('b','Iron Shield','e7','e5')
 // Both banners have refreshed. Give each side another order so White's Shield refreshes.
 await page.locator('[data-support-side=w] [data-card-id]').filter({hasText:'Piercing Banner'}).press(' ')
 await drag(page,'[data-square="d5"]','[data-square="d6"]')
 await expect.poll(()=>page.evaluate(()=>(window as any).checkmate.busy)).toBe(false)
 await page.locator('[data-support-side=b] [data-card-id]').filter({hasText:'Piercing Banner'}).press(' ')
 await drag(page,'[data-square="e5"]','[data-square="e4"]')
 await expect.poll(()=>page.evaluate(()=>(window as any).checkmate.busy)).toBe(false)
 await drag(page,'[data-support-side=w] [data-card-id]:has-text("Iron Shield")','[data-square="d6"]')
 await expect.poll(async()=>(await state(page)).log.at(-1)?.type).toBe('burn')
 const rat=(await state(page)).units.find((u:any)=>u.square==='d6')
 expect(rat.statuses.some((s:any)=>s.kind==='guarded')).toBe(true)
 await page.locator('[data-square="d6"]').hover()
 await expect(page.locator('#cm-unit-hover')).toContainText('Guard')
 await expect(page.locator('#cm-unit-hover .tcg-unit-card__stats')).toHaveCount(0)
})

test('phone touch places a card then orders an unselected habitat in one action',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage()
 await boot(page)
 const cdp=await context.newCDPSession(page)
 async function touch(from:{x:number,y:number},to:{x:number,y:number}){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]})
  for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/12,y:from.y+(to.y-from.y)*i/12}]})
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
 }
 const hand=(await page.locator('#cm-hand [data-card-id]').last().boundingBox())!,altar=await center(page,'#cm-support'),before=await state(page)
 await touch({x:hand.x+hand.width/2,y:hand.y+22},altar)
 expect((await state(page)).log.length).toBe(before.log.length)
 await touch(await center(page,'[data-square="e2"]'),await center(page,'[data-square="e4"]'))
 await expect.poll(async()=>(await state(page)).log.length).toBe(before.log.length+1)
 expect((await state(page)).log.at(-1)).toMatchObject({type:'install',kind:'move',to:'e4'})
 await page.screenshot({path:'review/capture-phone.png'})
 await context.close()
})
