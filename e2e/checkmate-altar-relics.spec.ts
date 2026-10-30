import { expect, test, type Page } from '@playwright/test'

async function boot(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?mode=checkmate&new=1')
  await page.locator('#cm-loading').waitFor({ state: 'hidden' })
  await page.selectOption('#cm-match-kind', 'skirmish')
  await page.selectOption('#cm-play-mode', 'local')
  await page.locator('#cm-seed').fill('1')
  await page.locator('#cm-start-deployment').click()
  if (await page.locator('#cm-auto-deploy').isVisible()) await page.locator('#cm-auto-deploy').click()
}

async function install(page: Page, count = 2) {
  for (let index = 0; index < count; index++) {
    await page.locator('#cm-hand [data-card-id]').first().press(' ')
    await page.locator('#cm-confirm').click()
    await expect.poll(() => page.evaluate(() => (window as any).checkmate.busy)).toBe(false)
  }
}

async function point(page: Page, square: string) {
  const box = await page.locator(`[data-square="${square}"]`).boundingBox()
  if (!box) throw new Error(`Expected ${square} square`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test('an installed effect card becomes an accessible altar relic and lifts back into its complete card', async ({ page }) => {
  await boot(page)
  await install(page)
  const relic = page.locator('[data-support-side="w"] [data-card-id]').first()
  const id = await relic.getAttribute('data-card-id')
  if (!id) throw new Error('Expected an installed ivory relic')

  await expect(relic).toHaveAccessibleName(/Rallying Banner/)
  await expect(relic.locator('.tcg-card__art')).toBeVisible()
  await expect(relic.locator('.tcg-card__title')).toBeHidden()
  await expect(relic.locator('.tcg-card__effect')).toBeHidden()
  await expect(relic.locator('.tcg-card__back')).toBeHidden()
  await expect(relic.locator('.tcg-card__frame')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

  const relicBox = await relic.boundingBox()
  const artBox = await relic.locator('.tcg-card__art').boundingBox()
  if (!relicBox || !artBox) throw new Error('Expected altar relic geometry')
  expect(artBox.width / relicBox.width).toBeGreaterThan(.75)

  await relic.hover()
  await expect(page.locator('#cm-card-view [data-card-id]')).toHaveAttribute('data-card-id', id)
  await expect(page.locator('#cm-card-view .tcg-card__title')).toBeVisible()
  await expect(page.locator('#cm-card-view .tcg-card__effect')).toContainText('Give a friendly unit')
  await page.keyboard.press('Escape')
  await expect(page.locator('#cm-card-reader')).toBeHidden()
  await expect(page.locator(`[data-support-side="w"] [data-card-id="${id}"] .tcg-card__art`)).toBeVisible()
  await expect(page.locator(`[data-support-side="w"] [data-card-id="${id}"] .tcg-card__title`)).toBeHidden()
})

test('phone tap arms a relic, then an unselected habitat can be dragged directly', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await boot(page)
  await install(page)
  const relic = page.locator('[data-support-side="w"] [data-card-id]').first()
  await expect(relic).toHaveAccessibleName(/Rallying Banner/)
  await relic.tap()
  await expect(relic).toHaveClass(/cm-order-armed/)

  const before = await page.evaluate(() => (window as any).checkmate.state.log.length)
  const from = await point(page, 'e2')
  const to = await point(page, 'e4')
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  for (let step = 1; step <= 12; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * step / 12, y: from.y + (to.y - from.y) * step / 12 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(() => page.evaluate(() => (window as any).checkmate.state.log.length)).toBe(before + 1)
  await expect(relic).toHaveAttribute('data-cooldown-remaining', '2')
  await expect(relic.locator('.tcg-card__art')).toBeVisible()
  await expect(relic.locator('.tcg-card__back')).toBeHidden()
  await context.close()
})
