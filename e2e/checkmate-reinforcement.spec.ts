import { expect, test, type Page } from '@playwright/test'
import { applyAction, createGame, legalActions } from '../src/checkmate/engine'

const state = (page: Page) => page.evaluate(() => (window as any).checkmate.state)

async function boot(page: Page, opponent: 'local'|'ai' = 'local') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?mode=checkmate&new=1')
  await page.locator('#cm-board').waitFor()
  await page.locator('#cm-loading').waitFor({ state: 'hidden' })
  await page.selectOption('#cm-match-kind', 'skirmish')
  await page.selectOption('#cm-play-mode', opponent)
  await page.selectOption('#cm-army-mode', 'reinforcement')
  await page.locator('#cm-seed').fill('1')
  await page.locator('#cm-start-deployment').click()
  await expect.poll(async () => (await state(page)).phase).toBe('battle')
}

async function dragUnit(page: Page, target: { x: number; y: number }, cancel = false) {
  const active=page.locator('#cm-card-view [data-card-kind="unit"]')
  let card=await active.count()?active:page.locator('#cm-hand [data-card-kind="unit"]').last()
  await card.press('Enter')
  card=page.locator('#cm-card-view [data-card-kind="unit"]')
  const rect = (await card.boundingBox())!
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * .35)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await expect(page.locator('.cm-card-ghost')).toBeVisible()
  if (cancel) await page.keyboard.press('Escape')
  await page.mouse.up()
}

test('Reinforcement starts the battle with only kings and reserves its other animals', async ({ page }) => {
  await boot(page)
  const game = await state(page)
  expect(game.options.armyMode).toBe('reinforcement')
  expect(game.units.filter((unit: any) => unit.square)).toHaveLength(2)
  expect(game.units.find((unit: any) => unit.side === 'w' && unit.role === 'k').square).toBe('e1')
  expect(game.units.find((unit: any) => unit.side === 'b' && unit.role === 'k').square).toBe('e8')
  expect(game.units.filter((unit: any) => !unit.square && unit.hp > 0)).toHaveLength(30)
  await expect(page.locator('[data-hand-tab="units"]')).toBeVisible()
  await expect(page.locator('#cm-hand [data-card-kind="unit"],#cm-card-view [data-card-kind="unit"]')).toHaveCount(15)
  await expect(page.locator('[data-support-side="w"] [data-slot]')).toHaveCount(3)
  await expect(page.locator('[data-support-side="b"] [data-slot]')).toHaveCount(3)
})

test('a reserve animal can be read, then deployed for the only action of the turn', async ({ page }) => {
  await boot(page)
  const queen = page.locator('#cm-hand [data-card-kind="unit"]').filter({ has: page.locator('.tcg-card__badge', { hasText: 'Queen' }) }).first()
  await queen.press('Space')
  await expect(page.locator('[data-square="d2"]')).toHaveAttribute('aria-label', /legal target/)
  await page.locator('[data-square="d2"]').click()
  await expect(page.locator('#cm-preview')).toBeVisible()
  await page.locator('#cm-confirm').click()
  await expect.poll(async () => (await state(page)).turn).toBe('b')
  const game = await state(page)
  expect(game.units.find((unit: any) => unit.role === 'q' && unit.side === 'w').square).toBe('d2')
  expect(game.log).toHaveLength(1)
  await page.reload()
  await page.locator('#cm-loading').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => Boolean((window as any).checkmate))
  expect((await state(page)).units.find((unit: any) => unit.role === 'q' && unit.side === 'w').square).toBe('d2')
})

test('a drag only deploys on an empty home square and invalid drops preserve the turn', async ({ page }) => {
  await boot(page)
  const before = await page.evaluate(() => localStorage.getItem('project-checkmate-save-v1'))
  let occupied = (await page.locator('[data-square="e1"]').boundingBox())!
  await dragUnit(page, { x: occupied.x + occupied.width / 2, y: occupied.y + occupied.height / 2 })
  expect(await page.evaluate(() => localStorage.getItem('project-checkmate-save-v1'))).toBe(before)
  await page.waitForTimeout(360)
  const enemy = (await page.locator('[data-square="d7"]').boundingBox())!
  await dragUnit(page, { x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 })
  expect(await page.evaluate(() => localStorage.getItem('project-checkmate-save-v1'))).toBe(before)
  await page.waitForTimeout(360)
  const legal = (await page.locator('[data-square="d2"]').boundingBox())!
  await dragUnit(page, { x: legal.x + legal.width / 2, y: legal.y + legal.height / 2 })
  await expect.poll(async () => (await state(page)).turn).toBe('b')
  expect((await state(page)).log).toHaveLength(1)
})

test('the phone gesture deploys a reserve without horizontal overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await boot(page)
  const card = page.locator('#cm-hand [data-card-kind="unit"],#cm-card-view [data-card-kind="unit"]').first()
  const from = (await card.boundingBox())!
  const square = (await page.locator('[data-square="d2"]').boundingBox())!
  const start = { x: from.x + from.width / 2, y: from.y + 22 }
  const end = { x: square.x + square.width / 2, y: square.y + square.height / 2 }
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * i / 8, y: start.y + (end.y - start.y) * i / 8 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(async () => (await state(page)).turn).toBe('b')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await context.close()
})

test('the woodland responds with one legal reinforcement action', async ({ page }) => {
  await boot(page, 'ai')
  const square = (await page.locator('[data-square="d2"]').boundingBox())!
  await dragUnit(page, { x: square.x + square.width / 2, y: square.y + square.height / 2 })
  await expect.poll(async () => (await state(page)).log.length, { timeout: 8000 }).toBe(2)
  const game = await state(page)
  const afterHuman = applyAction(createGame(game.options), game.log[0])
  expect(legalActions(afterHuman)).toContainEqual(game.log[1])
  expect(game.log[0].type).toBe('deploy')
  expect(game.log[1].player).toBe('b')
  expect(game.turn).toBe('w')
})
