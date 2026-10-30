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
  const card=page.locator('#cm-hand [data-card-id],#cm-card-view [data-card-id]').first()
  await card.press('Space')
  await expect(page.locator('#cm-preview')).toBeVisible()
  await page.locator('#cm-confirm').click()
  await expect.poll(() => page.evaluate(() => (window as any).checkmate.busy)).toBe(false)
}

async function prepareOrder(page: Page) {
  const support=page.locator('[data-support-side="w"] [data-card-id]').first()
  await support.press('Space')
  await page.locator('[data-square="e2"]').click()
  await expect(page.locator('[data-square="e2"]')).toHaveClass(/cm-order-source/)
}

async function squareCenter(page: Page, square: string) {
  const box = await page.locator(`[data-square="${square}"]`).boundingBox()
  if (!box) throw new Error(`Missing ${square}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function mouseHabitatDrag(page: Page, from: string, to: string) {
  const source = await squareCenter(page, from)
  const target = await squareCenter(page, to)
  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await expect(page.locator('.cm-habitat-drag-hint')).toBeVisible()
  await page.mouse.up()
}

async function touchHabitatDrag(context: BrowserContext, page: Page, from: string, to: string) {
  const source = await squareCenter(page, from)
  const target = await squareCenter(page, to)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [source] })
  for (let step = 1; step <= 8; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: source.x + (target.x - source.x) * step / 8, y: source.y + (target.y - source.y) * step / 8 }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test('an ordered habitat drops directly onto a legal square once, while an invalid drop keeps its order ready', async ({ page }) => {
  await boot(page)
  await install(page)
  await install(page)
  await prepareOrder(page)
  const before = await state(page)

  await mouseHabitatDrag(page, 'e2', 'e6')
  await expect(page.locator('#cm-confirm')).toBeHidden()
  await expect(page.locator('#cm-preview')).toBeHidden()
  expect((await state(page)).log).toHaveLength(before.log.length)
  await expect(page.locator('[data-support-side="w"] .tcg-exhausted')).toHaveCount(0)
  await expect(page.locator('[data-square="e2"]')).toHaveClass(/cm-order-source/)

  await mouseHabitatDrag(page, 'e2', 'e4')
  await expect(page.locator('#cm-confirm')).toBeHidden()
  await expect.poll(async () => (await state(page)).log.length).toBe(before.log.length + 1)
  const game = await state(page)
  expect(game.log.at(-1)).toMatchObject({ type: 'order', to: 'e4' })
  expect(game.units.find((unit: any) => unit.side === 'w' && unit.square === 'e4')).toBeTruthy()
  await expect(page.locator('[data-support-side="w"] .tcg-exhausted')).toHaveCount(1)
})

test('the card reader moves the actual hand node once and restores it when closed', async ({ page }) => {
  await boot(page)
  const card = page.locator('#cm-hand [data-card-id]').first()
  const id = await card.getAttribute('data-card-id')
  await card.evaluate(node => { (window as any).__cmActualCard = node })
  await card.hover({ position: { x: 12, y: 44 } })
  const lifted = page.locator('#cm-card-view .cm-card-lifted')
  await expect(lifted).toHaveCount(1)
  await expect(lifted).toHaveAttribute('data-card-id', id!)
  expect(await lifted.evaluate(node => node === (window as any).__cmActualCard)).toBe(true)
  expect(await page.locator(`[data-card-id="${id}"]`).count()).toBe(1)
  await expect(page.locator(`#cm-hand .cm-card-home[data-home-card-id="${id}"]`)).toHaveCount(1)
  await expect(lifted.locator('.tcg-card__effect')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#cm-card-reader')).toBeHidden()
  await expect(page.locator(`#cm-hand [data-card-id="${id}"]`)).toHaveCount(1)
  expect(await page.locator(`#cm-hand [data-card-id="${id}"]`).evaluate(node => node === (window as any).__cmActualCard)).toBe(true)
})

test('side shrines flank the centered desktop hand and stack without phone overflow after flip', async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  const page = await desktop.newPage()
  await boot(page)
  const [far, board, near, hand] = await Promise.all(['#cm-far-bank', '#cm-board', '#cm-near-bank', '#cm-hand'].map(selector => page.locator(selector).boundingBox()))
  if (!far || !board || !near || !hand) throw new Error('Expected board and altar geometry')
  expect(far.x).toBeLessThan(board.x)
  expect(near.x).toBeGreaterThan(board.x + board.width)
  expect(Math.abs(hand.x + hand.width / 2 - 640)).toBeLessThan(40)
  await desktop.close()

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const mobile = await phone.newPage()
  await boot(mobile)
  await install(mobile)
  await install(mobile)
  await mobile.locator('#cm-menu-button').click()
  await mobile.locator('#cm-flip').click()
  await mobile.locator('#cm-menu-close').click()
  await prepareOrder(mobile)
  await touchHabitatDrag(phone, mobile, 'e2', 'e4')
  await expect.poll(async () => (await state(mobile)).log.length).toBe(35)
  expect(await mobile.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await phone.close()
})
