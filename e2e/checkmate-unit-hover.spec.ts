import { expect, test, type Page } from '@playwright/test'

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

async function squareCenter(page: Page, square: string) {
  const box = await page.locator(`#cm-squares [data-square="${square}"]`).boundingBox()
  if (!box) throw new Error(`Missing ${square}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function hoverSquare(page: Page, square: string) {
  const point = await squareCenter(page, square)
  await page.mouse.move(point.x, point.y)
  return point
}

async function install(page: Page) {
  await page.locator('#cm-hand [data-card-id]').first().press('Space')
  await expect(page.locator('#cm-preview')).toBeVisible()
  await page.locator('#cm-confirm').click()
  await expect.poll(() => page.evaluate(() => (window as any).checkmate.busy)).toBe(false)
}

async function prepareOrder(page: Page) {
  await install(page)
  await install(page)
  await page.locator('[data-support-side="w"] [data-card-id]').first().press('Space')
  await page.locator('[data-square="e2"]').click()
  await expect(page.locator('[data-square="e2"]')).toHaveClass(/cm-order-source/)
}

test('an occupied habitat shows its current unit card only after the hover dwell', async ({ page }) => {
  await boot(page)
  const king = (await state(page)).units.find((unit: any) => unit.square === 'e1')
  expect(king).toBeTruthy()

  const tooltip = page.locator('#cm-unit-hover')
  await expect(tooltip).toHaveRole('tooltip')
  await expect(tooltip).toBeHidden()
  await hoverSquare(page, 'e1')
  await page.waitForTimeout(300)
  await expect(tooltip).toBeHidden()
  await expect(tooltip).toBeVisible({ timeout: 400 })
  await expect(tooltip).toHaveAttribute('data-unit-id', king.id)
  await expect(tooltip.locator('.tcg-unit-card')).toBeVisible()
  await expect(tooltip.locator('.tcg-unit-card__stats')).toContainText('HP 8/8')
})

test('moving over blank or enemy squares restarts the unit hover dwell, and leaving hides it', async ({ page }) => {
  await boot(page)
  const tooltip = page.locator('#cm-unit-hover')

  await hoverSquare(page, 'e1')
  await page.waitForTimeout(260)
  await hoverSquare(page, 'a3')
  await page.waitForTimeout(340)
  await expect(tooltip).toBeHidden()

  await hoverSquare(page, 'e1')
  await page.waitForTimeout(260)
  await hoverSquare(page, 'e8')
  await page.waitForTimeout(340)
  await expect(tooltip).toBeHidden()

  await hoverSquare(page, 'e1')
  await expect(tooltip).toBeVisible({ timeout: 650 })
  await page.mouse.move(4, 4)
  await expect(tooltip).toBeHidden({ timeout: 300 })
})

test('pressing an occupied square dismisses its hover card while its click still opens the unit modal', async ({ page }) => {
  await boot(page)
  const tooltip = page.locator('#cm-unit-hover')
  const point = await hoverSquare(page, 'e1')
  await expect(tooltip).toBeVisible({ timeout: 650 })

  await page.mouse.down()
  await expect(tooltip).toBeHidden()
  await page.mouse.up()
  await expect(page.locator('#cm-unit-details')).toBeVisible()
  await expect(page.locator('#cm-unit-copy .tcg-unit-card')).toBeVisible()
  await page.locator('#cm-unit-close').click()

  await page.mouse.click(point.x, point.y)
  await expect(page.locator('#cm-unit-details')).toBeVisible()
})

test('a prepared order still drags directly without opening an action preview during the hold', async ({ page }) => {
  await boot(page)
  await prepareOrder(page)
  const before = await state(page)
  const source = await squareCenter(page, 'e2')
  const target = await squareCenter(page, 'e4')

  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await expect(page.locator('#cm-preview')).toBeHidden()
  await expect(page.locator('#cm-unit-hover')).toBeHidden()
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await expect(page.locator('.cm-habitat-drag-hint')).toBeVisible()
  await expect(page.locator('#cm-preview')).toBeHidden()
  await page.mouse.up()

  await expect.poll(async () => (await state(page)).log.length).toBe(before.log.length + 1)
  expect((await state(page)).log.at(-1)).toMatchObject({ type: 'order', to: 'e4' })
  await expect(page.locator('#cm-preview')).toBeHidden()
})

test('flipped board hover follows the physical e1 square for mouse input and ignores touch input', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await boot(page)
  const king = (await state(page)).units.find((unit: any) => unit.square === 'e1')
  const tooltip = page.locator('#cm-unit-hover')

  await page.locator('#cm-menu-button').click()
  await page.locator('#cm-flip').click()
  await page.locator('#cm-menu-close').click()
  const point = await squareCenter(page, 'e1')
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(650)
  await expect(tooltip).toBeHidden()

  await context.close()
  // A desktop pointer after flipping follows the same projected square.
  const desktop=await browser.newContext({viewport:{width:1280,height:900}})
  const mousePage=await desktop.newPage();await boot(mousePage)
  await mousePage.locator('#cm-menu-button').click()
  await mousePage.locator('#cm-flip').click()
  await mousePage.locator('#cm-menu-close').click()
  await hoverSquare(mousePage,'e1')
  await expect(mousePage.locator('#cm-unit-hover')).toBeVisible({timeout:750})
  await expect(mousePage.locator('#cm-unit-hover')).toHaveAttribute('data-unit-id',king.id)
  await desktop.close()
})
