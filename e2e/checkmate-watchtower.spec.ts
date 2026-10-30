import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const state = (page: Page) => page.evaluate(() => (window as any).checkmate.state)
const settled = (page: Page) => expect.poll(async () => page.evaluate(() => ({ turn: (window as any).checkmate.state.turn, busy: (window as any).checkmate.busy })), { timeout: 10_000 }).toEqual({ turn: 'w', busy: false })

async function center(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`Missing ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function drag(page: Page, from: string, to: string) {
  const source = await center(page, from), target = await center(page, to)
  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await page.mouse.up()
}

async function touchDrag(context: BrowserContext, page: Page, from: string, to: string) {
  const source = await center(page, from), target = await center(page, to), cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [source] })
  for (let step = 1; step <= 12; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: source.x + (target.x - source.x) * step / 12, y: source.y + (target.y - source.y) * step / 12 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

async function boot(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?mode=checkmate&encounter=tower&new=1')
  await page.locator('#cm-loading').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => Boolean((window as any).checkmate))
  await page.locator('[data-encounter-id="tower"]').click()
  await page.locator('#cm-start-deployment').click()
  await expect.poll(async () => (await state(page)).options.encounterId).toBe('tower')
  await expect(page.locator('#cm-status')).toContainText(/Defeat sentinel/i)
}

async function support(page: Page, definitionId: string) {
  const card = (await state(page)).players.w.support.find((value: any) => value.definitionId === definitionId)
  if (!card) throw new Error(`Missing support ${definitionId}`)
  return `[data-support-side="w"] [data-card-id="${card.id}"]`
}

async function orderDrag(page: Page, definitionId: string, from: string, to: string) {
  const before = (await state(page)).log.length
  const card = await support(page, definitionId)
  await page.locator(card).click()
  await drag(page, `[data-square="${from}"]`, `[data-square="${to}"]`)
  await settled(page)
  expect((await state(page)).log.length).toBeGreaterThan(before)
}

async function towerShot(page: Page, definitionId: string) {
  const before = (await state(page)).log.length
  const card = await support(page, definitionId)
  await page.locator(card).click()
  await expect(page.locator('#cm-tower-fire')).toBeVisible()
  await page.locator('#cm-tower-fire').click()
  await page.locator('[data-square="d5"]').click()
  await settled(page)
  expect((await state(page)).log.length).toBeGreaterThan(before)
}

async function clearTower(page: Page, touch?: BrowserContext) {
  const before = (await state(page)).log.length
  const card = await support(page, 'trailbreaker')
  if (touch) await touchDrag(touch, page, card, '[data-square="d3"]')
  else await drag(page, card, '[data-square="d3"]')
  await settled(page)
  expect((await state(page)).log.length).toBeGreaterThan(before)
}

async function towerRoute(page: Page) {
  await orderDrag(page, 'reserve-order', 'b2', 'd3')
  await towerShot(page, 'trailbreaker')
  const afterFire = await state(page)
  expect(afterFire.log.find((action: any) => action.type === 'fire')).toMatchObject({ unitId: 'w-unit-6', to: 'd5' })
  expect(afterFire.units.find((unit: any) => unit.id === 'w-unit-6').statuses.some((status: any) => status.kind === 'rooted')).toBe(true)
  expect(afterFire.obstacles.d3.spent).toBe(true)
  expect(afterFire.phase).toBe('battle')
  await orderDrag(page, 'smoke', 'd2', 'e3')
  await orderDrag(page, 'reserve-order', 'd3', 'e5')
}

async function clearingRoute(page: Page, touch?: BrowserContext) {
  await clearTower(page, touch)
  expect((await state(page)).obstacles.d3).toBeUndefined()
  const move = touch ? async (card: string, from: string, to: string) => { await page.locator(await support(page, card)).tap(); await touchDrag(touch!, page, `[data-square="${from}"]`, `[data-square="${to}"]`); await settled(page) } : async (card: string, from: string, to: string) => orderDrag(page, card, from, to)
  await move('reserve-order', 'd2', 'e3')
  await move('smoke', 'd1', 'd5')
  await move('reserve-order', 'd5', 'e5')
}

test('desktop tower lesson supports both authored four-action solutions', async ({ page }) => {
  await boot(page)
  await towerRoute(page)
  await expect(page.locator('#cm-result-copy')).toContainText(/Watchtower mastered/i)
  await page.screenshot({ path: 'review/tower-shot-desktop.png', fullPage: true })

  await page.locator('#cm-play-again').click()
  await clearingRoute(page)
  await expect(page.locator('#cm-result-copy')).toContainText(/Watchtower mastered/i)
  await page.screenshot({ path: 'review/tower-clearing-desktop.png', fullPage: true })
})

test('tower progress survives reload and undo restores the unspent puzzle', async ({ page }) => {
  await boot(page)
  await orderDrag(page, 'reserve-order', 'b2', 'd3')
  await page.reload()
  await page.locator('#cm-loading').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => Boolean((window as any).checkmate))
  await settled(page)
  expect((await state(page)).units.find((unit: any) => unit.id === 'w-unit-6').square).toBe('d3')
  await page.locator('#cm-menu-button').click()
  await page.locator('#cm-undo').click()
  const rewound = await state(page)
  expect(rewound.log).toHaveLength(0)
  expect(rewound.units.find((unit: any) => unit.id === 'w-unit-6').square).toBe('b2')
  expect(rewound.obstacles.d3.kind).toBe('tower')
  expect(rewound.obstacles.d3.spent).toBeUndefined()
})

test('phone touch completes both tower routes at 390 pixels', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await boot(page)
  await page.locator(await support(page, 'reserve-order')).tap()
  await touchDrag(context, page, '[data-square="b2"]', '[data-square="d3"]')
  await settled(page)
  await page.locator(await support(page, 'trailbreaker')).tap()
  await expect(page.locator('#cm-tower-fire')).toBeVisible()
  await page.locator('#cm-tower-fire').tap()
  await page.locator('[data-square="d5"]').tap()
  await settled(page)
  await page.locator(await support(page, 'smoke')).tap()
  await touchDrag(context, page, '[data-square="d2"]', '[data-square="e3"]')
  await settled(page)
  await page.locator(await support(page, 'reserve-order')).tap()
  await touchDrag(context, page, '[data-square="d3"]', '[data-square="e5"]')
  await expect(page.locator('#cm-result-copy')).toContainText(/Watchtower mastered/i)
  await page.screenshot({ path: 'review/tower-shot-phone.png', fullPage: true })

  await page.locator('#cm-play-again').tap()
  await clearingRoute(page, context)
  await expect(page.locator('#cm-result-copy')).toContainText(/Watchtower mastered/i)
  await page.screenshot({ path: 'review/tower-clearing-phone.png', fullPage: true })
  await context.close()
})
