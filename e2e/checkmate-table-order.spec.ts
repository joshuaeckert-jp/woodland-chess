import { expect, test, type Browser, type Page } from '@playwright/test'

async function boot(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?mode=checkmate&encounter=tower&new=1')
  await page.locator('#cm-loading').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => Boolean((window as any).checkmate))
  await page.locator('[data-encounter-id="tower"]').click()
  await page.locator('#cm-start-deployment').click()
}

const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

async function stackedLayout(page: Page) {
  const [far, board, near, hand] = await Promise.all(['#cm-far-bank', '.cm-board-wrap', '#cm-near-bank', '.cm-hand-dock'].map(selector => page.locator(selector).boundingBox()))
  if (!far || !board || !near || !hand) throw new Error('Expected both altar banks, board, and hand dock')
  expect(far.y + far.height).toBeLessThanOrEqual(board.y + 1)
  expect(near.y).toBeGreaterThanOrEqual(board.y + board.height - 1)
  expect(hand.y).toBeGreaterThanOrEqual(near.y + near.height - 1)
  await expect(page.locator('#cm-squares [data-square]')).toHaveCount(64)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.locator('.cm-altar-horizontal').first()).toBeVisible()
  await expect(page.locator('.cm-altar-vertical').first()).toBeHidden()
  return { board }
}

test('table stack keeps altars, board, and hand in reading order on desktop sizes', async ({ browser }) => {
  for (const viewport of [{ width: 1774, height: 1246 }, { width: 1280, height: 900 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await boot(page)
    await stackedLayout(page)
    await expect(page.locator('#cm-near-bank [data-owner="own"]')).toHaveCount(1)
    await expect(page.locator('#cm-hand-label')).toContainText('Your hand')
    await page.locator('#cm-menu-button').click()
    await page.locator('#cm-flip').click()
    await page.locator('#cm-menu-close').click()
    await expect(page.locator('#cm-near-bank [data-owner="own"]')).toHaveCount(1)
    await expect(page.locator('#cm-hand-label')).toContainText('Your hand')
    await context.close()
  }
})

test('card inspection uses the desktop board gutter and exposes full effect metadata', async ({ page }) => {
  await page.setViewportSize({ width: 1774, height: 1246 })
  await boot(page)
  const { board } = await stackedLayout(page)
  const smoke = page.locator('[data-card-effect="smoke"]').first()
  await smoke.hover()
  const reader = page.locator('#cm-card-reader')
  await expect(reader).toBeVisible()
  const readerBox = await reader.boundingBox()
  if (!readerBox) throw new Error('Missing card reader bounds')
  expect(overlap(readerBox, board)).toBe(0)
  const inspection = reader.locator('.tcg-card__inspection')
  await expect(inspection).toBeVisible()
  for (const label of ['Target', 'Order', 'Cast', 'Cooldown']) await expect(inspection).toContainText(label)
  const frame = reader.locator('.tcg-card__frame')
  await expect(frame).toHaveCSS('border-image-repeat', 'round')
  const home = await page.locator('.cm-card-home').boundingBox()
  if (!home) throw new Error('Expected the original card placeholder')
  await page.mouse.move(home.x + home.width / 2, home.y + home.height / 2)
  await page.mouse.move(readerBox.x + readerBox.width / 2, readerBox.y + readerBox.height / 2, { steps: 24 })
  await expect(reader).toBeVisible()
})

test('unit inspection appears after its dwell with readable effects, while phone keeps the table contained', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await boot(page)
  await stackedLayout(page)
  const unitSquare = await page.evaluate(() => (window as any).checkmate.state.units.find((unit: any) => unit.side === 'w' && unit.hp > 0 && unit.square)?.square)
  expect(unitSquare).toBeTruthy()
  const unit = page.locator(`[data-square="${unitSquare}"]`)
  await unit.scrollIntoViewIfNeeded()
  const box = await unit.boundingBox()
  if (!box) throw new Error('Missing unit square')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const inspector = page.locator('#cm-unit-hover')
  await expect(inspector).toBeVisible({ timeout: 900 })
  await expect(inspector.locator('.tcg-card__inspection')).toBeVisible()
  await expect(inspector).toContainText(/Effects|Order/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await context.close()

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const mobile = await phone.newPage()
  await boot(mobile)
  await stackedLayout(mobile)
  expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await phone.close()
})

test('short landscape scrolls the ordered table vertically without losing board hit targets', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await boot(page)
  await stackedLayout(page)
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true)
  await expect(page.locator('#cm-squares [data-square]')).toHaveCount(64)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await context.close()
})
