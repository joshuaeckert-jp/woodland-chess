import { expect, test, type Page } from '@playwright/test'

const state = (page: Page) => page.evaluate(() => (window as any).checkmate.state)
const busy = (page: Page) => page.evaluate(() => (window as any).checkmate.busy)

async function boot(page: Page, reducedMotion = false) {
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
  await page.goto('/?mode=checkmate&new=1')
  await page.locator('#cm-loading').waitFor({ state: 'hidden' })
  await page.selectOption('#cm-match-kind', 'skirmish')
  await page.selectOption('#cm-play-mode', 'local')
  await page.selectOption('#cm-army-mode', 'reinforcement')
  await page.locator('#cm-seed').fill('1')
  await page.locator('#cm-start-deployment').click()
}

async function deployFromReader(page: Page, square = 'd2') {
  const card = page.locator('#cm-hand [data-card-kind="unit"]').first()
  await card.press('Space')
  await page.locator(`[data-square="${square}"]`).click()
  await page.locator('#cm-confirm').click()
}

test('a reserve card morphs through habitat and animal stages before the turn settles', async ({ page }) => {
  await boot(page)
  await deployFromReader(page)

  const deployment = page.locator('.cm-deployment-card')
  await expect(deployment).toBeVisible()
  await expect(deployment).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.cm-card-ghost')).toHaveCount(0)
  expect(await busy(page)).toBe(true)
  await expect.poll(() => page.locator('.cm-board-wrap').getAttribute('data-deployment-stage')).toMatch(/^(card|habitat|animal|settle)$/)

  await expect.poll(() => busy(page), { timeout: 3000 }).toBe(false)
  await expect(deployment).toHaveCount(0)
  await expect(page.locator('.cm-board-wrap')).not.toHaveAttribute('data-deployment-stage')
  const game = await state(page)
  expect(game.log).toHaveLength(1)
  expect(game.units.find((unit: any) => unit.side === 'w' && unit.square === 'd2')).toBeTruthy()
})

test('resizing during a deployment settles the piece and clears the card transition', async ({ page }) => {
  await boot(page)
  await deployFromReader(page)
  await expect(page.locator('.cm-deployment-card')).toBeVisible()
  await page.setViewportSize({ width: 1050, height: 760 })
  await expect.poll(() => busy(page), { timeout: 1500 }).toBe(false)
  await expect(page.locator('.cm-deployment-card')).toHaveCount(0)
  await expect(page.locator('.cm-board-wrap')).not.toHaveAttribute('data-deployment-stage')
  expect((await state(page)).units.some((unit: any) => unit.side === 'w' && unit.square === 'd2')).toBe(true)
})

test('reduced motion deploys without a transient card while retaining the completed piece', async ({ page }) => {
  await boot(page, true)
  await deployFromReader(page)
  await expect(page.locator('.cm-deployment-card')).toHaveCount(0)
  await expect.poll(() => busy(page), { timeout: 500 }).toBe(false)
  await expect(page.locator('.cm-board-wrap')).not.toHaveAttribute('data-deployment-stage')
  expect((await state(page)).units.some((unit: any) => unit.side === 'w' && unit.square === 'd2')).toBe(true)
})


test('phone dragging after a board flip deploys on the projected square', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 })
  await boot(page)
  await page.locator('#cm-menu-button').click()
  await page.locator('#cm-flip').click()
  await page.locator('#cm-menu-close').click()
  const card=page.locator('#cm-hand [data-card-kind="unit"]').first()
  const from=(await card.boundingBox())!,to=(await page.locator('[data-square="d2"]').boundingBox())!
  await page.mouse.move(from.x+from.width/2,from.y+from.height*.35)
  await page.mouse.down()
  await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12})
  await page.mouse.up()
  await expect(page.locator('.cm-deployment-card')).toBeVisible()
  await expect.poll(()=>busy(page),{timeout:3000}).toBe(false)
  await expect(page.locator('.cm-deployment-card')).toHaveCount(0)
  expect((await state(page)).units.some((unit:any)=>unit.side==='w'&&unit.square==='d2')).toBe(true)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390)
})
