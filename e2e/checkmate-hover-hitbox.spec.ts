import { expect, test, type Page } from '@playwright/test'

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
  await page.waitForURL(/\?mode=checkmate$/)
}

async function moveToCard(page: Page, card: ReturnType<Page['locator']>, x = .5, y = .45) {
  const box = await card.boundingBox()
  if (!box) throw new Error('Expected a visible card')
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y)
  return box
}

async function openHoverReader(page: Page, card = page.locator('#cm-hand [data-card-id]').first()) {
  const home = await card.boundingBox()
  const id = await card.getAttribute('data-card-id')
  if (!home || !id) throw new Error('Expected a visible hand card with an id')
  await page.mouse.move(home.x + home.width / 2, home.y + home.height * .45)
  await expect(page.locator('#cm-card-reader')).toBeVisible({ timeout: 500 })
  return { id, home }
}

async function install(page: Page) {
  await page.locator('#cm-hand [data-card-id]').first().press('Space')
  await expect(page.locator('#cm-preview')).toBeVisible()
  await page.locator('#cm-confirm').click()
  await expect.poll(() => page.evaluate(() => (window as any).checkmate.busy)).toBe(false)
}

test('hover opens after its dwell while the pointer moves within one card, without a visible close X', async ({ page }) => {
  await boot(page)
  await expect(page.locator('#cm-card-close')).toHaveCount(0)
  const card = page.locator('#cm-hand [data-card-id]').first()
  const box = await card.boundingBox()
  if (!box) throw new Error('Expected a hand card')

  for (let step = 0; step < 6; step++) {
    await page.mouse.move(box.x + box.width * (.25 + step * .08), box.y + box.height * .45)
    await page.waitForTimeout(30)
  }
  await expect(page.locator('#cm-card-reader')).toBeVisible({ timeout: 180 })
})

test('the enlarged card tolerates a small edge excursion and then closes after leaving the reader and home hitboxes', async ({ page }) => {
  await boot(page)
  const { id, home } = await openHoverReader(page)
  const lifted = page.locator('#cm-card-view [data-card-id]')
  const liftedBox = await lifted.boundingBox()
  if (!liftedBox) throw new Error('Expected the enlarged card')

  await page.mouse.move(liftedBox.x + liftedBox.width / 2, liftedBox.y + liftedBox.height / 2)
  await page.mouse.move(liftedBox.x - 10, liftedBox.y + liftedBox.height / 2)
  await page.waitForTimeout(70)
  await page.mouse.move(liftedBox.x + liftedBox.width / 2, liftedBox.y + liftedBox.height / 2)
  await page.waitForTimeout(230)
  await expect(page.locator('#cm-card-reader')).toBeVisible()

  const reader = await page.locator('#cm-card-reader').boundingBox()
  if (!reader) throw new Error('Expected reader bounds')
  const left = Math.min(reader.x, home.x)
  const top = Math.min(reader.y, home.y)
  const right = Math.max(reader.x + reader.width, home.x + home.width)
  const centerX = (left + right) / 2
  const nearReader = { x: centerX, y: Math.max(2, top - 20) }
  const fartherOutside = { x: centerX, y: Math.max(1, top - 45) }

  // This is outside both hitboxes but moves toward the reader; it must still arm closing.
  await page.mouse.move(fartherOutside.x, fartherOutside.y)
  await page.mouse.move(nearReader.x, nearReader.y)
  await expect(page.locator('#cm-card-reader')).toBeHidden({ timeout: 300 })
})

test('a stationary pointer outside the enlarged card and home bounds closes the hover reader promptly', async ({ page }) => {
  await boot(page)
  const { home } = await openHoverReader(page)
  const reader = await page.locator('#cm-card-reader').boundingBox()
  if (!reader) throw new Error('Expected reader bounds')
  const left = Math.min(reader.x, home.x)
  const top = Math.min(reader.y, home.y)
  const right = Math.max(reader.x + reader.width, home.x + home.width)
  await page.mouse.move((left + right) / 2, Math.max(1, top - 25))
  await expect(page.locator('#cm-card-reader')).toBeHidden({ timeout: 300 })
})

test('neighboring cards switch after a dwell, while Escape and an outside press dismiss the reader', async ({ page }) => {
  await boot(page)
  for (let i = 0; i < 4; i++) await install(page)
  const cards = page.locator('#cm-support [data-card-id]')
  const first = cards.nth(0)
  const second = cards.nth(1)
  const secondId = await second.getAttribute('data-card-id')
  if (!secondId) throw new Error('Expected two neighboring support cards')
  await openHoverReader(page, first)
  await moveToCard(page, page.locator(`#cm-support [data-card-id="${secondId}"]`))
  await expect(page.locator('#cm-card-view [data-card-id]')).toHaveAttribute('data-card-id', secondId!, { timeout: 500 })
  await page.keyboard.press('Escape')
  await expect(page.locator('#cm-card-reader')).toBeHidden()

  await openHoverReader(page, first)
  await page.mouse.click(8,100)
  await expect(page.locator('#cm-card-reader')).toBeHidden()
})

test('the board remains usable at representative portrait widths without horizontal overflow', async ({ page }) => {
  for (const target of [
    { width: 500, height: 800, board: 360 },
    { width: 390, height: 844, board: 374 },
    { width: 652, height: 1004, board: 500 },
  ]) {
    await page.setViewportSize(target)
    await boot(page)
    const board = await page.locator('#cm-board').boundingBox()
    expect(board?.width).toBeGreaterThanOrEqual(target.board)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(target.width)
  }
})
