import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const state = (page: Page) => page.evaluate(() => (window as any).checkmate.state)

async function boot(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?mode=checkmate&new=1')
  await page.locator('#cm-board').waitFor()
  await page.locator('#cm-loading').waitFor({ state: 'hidden' })
  await page.selectOption('#cm-match-kind', 'skirmish')
  await page.selectOption('#cm-play-mode', 'local')
  await page.locator('#cm-seed').fill('1')
  await page.locator('#cm-start-deployment').click()
  if (await page.locator('#cm-auto-deploy').isVisible()) await page.locator('#cm-auto-deploy').click()
}

async function install(page: Page) {
  const card = page.locator('#cm-hand [data-card-id]').first()
  await card.press('Space')
  await expect(page.locator('#cm-preview')).toBeVisible()
  await page.locator('#cm-confirm').click()
  await expect(page.locator('.cm-effect-card-flight')).toHaveCount(0, { timeout: 1600 })
}

async function installBoth(page: Page) {
  await install(page)
  await install(page)
  await expect(page.locator('[data-support-side="w"] [data-card-id]')).toHaveCount(1)
}

async function squareCenter(page: Page, square: string) {
  const box = await page.locator(`[data-square="${square}"]`).boundingBox()
  if (!box) throw new Error(`Missing ${square}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function supportCenter(page: Page, side = 'w') {
  const id=(await state(page)).players[side].support[0].id
  const card=page.locator(`[data-card-id="${id}"]`)
  const box = await card.boundingBox()
  if (!box) throw new Error(`Missing ${side} support card`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function dragSupport(page: Page, target: { x: number; y: number }, expectMist = true) {
  const source = await supportCenter(page)
  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 12 })
  if(expectMist)await expect(page.locator('.cm-card-mist')).toBeVisible()
  await expect(page.locator('.cm-card-ghost')).toHaveCount(0)
  await page.mouse.up()
}

async function touchDrag(context: BrowserContext, page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  for (let step = 1; step <= 8; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8 }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test('a support Banner dropped on a friendly animal casts its printed effect immediately', async ({ page }) => {
  await boot(page)
  await installBoth(page)
  const before = await state(page)

  await dragSupport(page, await squareCenter(page, 'e2'))
  await expect.poll(async () => (await state(page)).log.length).toBe(before.log.length + 1)
  const game = await state(page)
  expect(game.log.at(-1).type).toBe('burn')
  expect(game.players.w.discard).toHaveLength(1)
  expect(game.units.find((unit: any) => unit.side === 'w' && unit.square === 'e2').statuses.some((status: any) => status.kind === 'inspired')).toBe(true)
  await expect(page.locator('#cm-drop-choice')).toBeHidden()
  await expect(page.locator('#cm-preview')).toBeHidden()
})

test('a support drop never opens the former Order/Effect chooser', async ({ page }) => {
  await boot(page)
  await installBoth(page)
  const before = await state(page)

  await dragSupport(page, await squareCenter(page, 'e2'))
  await expect.poll(async () => (await state(page)).log.length).toBe(before.log.length + 1)
  const game = await state(page)
  expect(game.log.at(-1).type).toBe('burn')
  expect(game.players.w.discard).toHaveLength(1)
  await expect(page.locator('#cm-drop-choice')).toBeHidden()
  await expect(page.locator('#cm-confirm')).toBeHidden()
})

test('a Banner drop on the King resolves the effect without a confirmation preview', async ({ page }) => {
  await boot(page)
  await installBoth(page)

  await dragSupport(page, await squareCenter(page, 'e1'))
  await expect(page.locator('#cm-drop-choice')).toBeHidden()
  await expect(page.locator('#cm-preview')).toBeHidden()
})

test('an invalid support-card drop neither opens a choice nor spends the turn', async ({ page }) => {
  await boot(page)
  await installBoth(page)
  const before = await state(page)

  await dragSupport(page, await squareCenter(page, 'e7'), false)
  await expect(page.locator('#cm-drop-choice')).toBeHidden()
  await expect(page.locator('#cm-preview')).toBeHidden()
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  expect((await state(page)).log).toHaveLength(before.log.length)

  await page.waitForTimeout(360)
  await dragSupport(page, await squareCenter(page, 'a3'), false)
  await expect(page.locator('#cm-drop-choice')).toBeHidden()
  await expect(page.locator('#cm-preview')).toBeHidden()
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  expect((await state(page)).log).toHaveLength(before.log.length)
  expect((await state(page)).turn).toBe('w')
})

test('a locked support card cannot be dragged while its owner is not active', async ({ page }) => {
  await boot(page)
  await install(page)
  expect((await state(page)).turn).toBe('b')
  const source = await supportCenter(page)
  const target = await squareCenter(page, 'e2')
  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await expect(page.locator('.cm-card-mist')).toHaveCount(0)
  await page.mouse.up()
  const game = await state(page)
  expect(game.log.filter((action: any) => action.type !== 'deploy')).toHaveLength(1)
  expect(game.turn).toBe('b')
})

test('a touch support drag still hits its animal after the board flips', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await boot(page)
  await installBoth(page)
  await page.locator('#cm-menu-button').click()
  await page.locator('#cm-flip').click()
  await page.locator('#cm-menu-close').click()

  await touchDrag(context, page, await supportCenter(page), await squareCenter(page, 'e2'))
  await expect.poll(async()=>((await state(page)).log.at(-1)?.type)).toBe('burn')
  await context.close()
})

test('a pinned actual hand card remains identifiable and installs through its keyboard preview', async ({ page }) => {
  await boot(page)
  const card = page.locator('#cm-hand [data-card-id]').first()
  const id = await card.getAttribute('data-card-id')
  const definitionId = (await state(page)).players.w.hand[0].definitionId
  await card.press('Enter')
  await expect(page.locator('#cm-card-reader')).toBeVisible()
  const shown = await page.locator('#cm-card-view [data-card-definition]').getAttribute('data-card-definition')
  expect(shown).toBe(definitionId)

  await page.mouse.move(24, 24, { steps: 12 })
  await expect(page.locator('#cm-card-view [data-card-definition]')).toHaveAttribute('data-card-definition', definitionId)
  await page.locator('#cm-card-view [data-card-id]').press(' ');await page.locator('#cm-confirm').click()

  await expect.poll(async () => (await state(page)).log.at(-1)?.cardId).toBe(id)
})


test('an unpinned hover remains stable while the pointer stays on its enlarged card', async ({ page }) => {
  await page.setViewportSize({width:390,height:844})
  await boot(page)
  const card=page.locator('#cm-hand [data-card-id]').first(),id=await card.getAttribute('data-card-id')
  const definition=(await state(page)).players.w.hand[0].definitionId
  await card.hover({position:{x:14,y:50}})
  await expect(page.locator('#cm-card-view [data-card-definition]')).toHaveAttribute('data-card-definition',definition)
  const reader=(await page.locator('#cm-card-reader').boundingBox())!
  await page.mouse.move(reader.x+reader.width/2,reader.y+reader.height/2,{steps:30})
  await expect(page.locator('#cm-card-view [data-card-definition]')).toHaveAttribute('data-card-definition',definition)
  await page.waitForTimeout(450)
  await expect(page.locator('#cm-card-view [data-card-id]')).toHaveAttribute('data-card-id',id!)
})

test('a terrain drop lets the player choose its casting animal and consumes one action', async ({ page }) => {
  await boot(page)
  const smoke=(await state(page)).players.w.hand.find((card:any)=>card.definitionId==='smoke')
  const card=page.locator(`#cm-hand [data-card-id="${smoke.id}"]`)
  await card.press(' ');await page.locator('#cm-confirm').click()
  await install(page)
  const before=await state(page),sourceBox=(await page.locator(`[data-support-side="w"] [data-card-id="${smoke.id}"]`).boundingBox())!,to=await squareCenter(page,'a3')
  await page.mouse.move(sourceBox.x+sourceBox.width/2,sourceBox.y+sourceBox.height/2);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up()
  await expect.poll(async()=>((await state(page)).log.length)).toBe(before.log.length+1)
  const after=await state(page),caster=after.log.at(-1)?.sourceUnitId
  expect(after.log.length).toBe(before.log.length+1)
  expect(after.log.at(-1)).toMatchObject({type:'burn',targetSquare:'a3',sourceUnitId:caster})
  expect(after.terrain.a3.kind).toBe('smoke')
})
