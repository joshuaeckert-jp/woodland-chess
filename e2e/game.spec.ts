import { expect, Page, test } from '@playwright/test'

const wait = (page: Page) => page.waitForFunction(() => !(window as { woodland: { busy: boolean } }).woodland.busy)
const fen = (page: Page) => page.evaluate(() => (window as { woodland: { fen: string } }).woodland.fen)
const history = (page: Page) => page.evaluate(() => (window as { woodland: { history: string[] } }).woodland.history)
const fixture = (page: Page, value: string) => page.evaluate((value) => (window as { woodland: { loadFen: (fen: string) => void } }).woodland.loadFen(value), value)

async function openMenu(page: Page) { await page.locator('#menu-button').click(); await expect(page.locator('#menu')).toBeVisible() }
async function resume(page: Page) { await page.locator('#resume').click(); await expect(page.locator('#menu')).toBeHidden() }
async function startGame(page: Page, mode: 'local' | 'ai', difficulty = 'normal', side = 'w') {
  await page.selectOption('#mode', mode)
  if (mode === 'ai') { await page.selectOption('#difficulty', difficulty); await page.selectOption('#side', side) }
  await page.locator('#start-game').click()
  await expect(page.locator('#new-game-settings')).toBeHidden()
}
async function newSettings(page: Page) { await openMenu(page); await page.locator('#new').click(); await expect(page.locator('#new-game-settings')).toBeVisible() }
async function move(page: Page, from: string, to: string) { await page.locator(`[data-square="${from}"]`).click(); await page.locator(`[data-square="${to}"]`).click(); await wait(page) }

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.locator('#board').waitFor({ state: 'attached' })
  await page.locator('#loading').waitFor({ state: 'hidden' })
  if (await page.locator('#new-game-settings').isVisible()) await startGame(page, 'local')
  else { await newSettings(page); await startGame(page, 'local') }
  await openMenu(page)
  if (await page.locator('#motion').isChecked()) await page.locator('#motion').uncheck()
  await resume(page)
})

test('keeps the game surface board-first and the menu dismisses with Escape', async ({ page }) => {
  await expect(page.locator('#board, #squares')).toHaveCount(2)
  await expect(page.locator('header, aside')).toHaveCount(0)
  await openMenu(page); await page.keyboard.press('Escape'); await expect(page.locator('#menu')).toBeHidden()
})

test('legal move, illegal destination, undo, saved history and keyboard navigation', async ({ page }) => {
  await page.locator('[data-square="e2"]').click(); await page.locator('[data-square="e5"]').click(); expect(await fen(page)).toContain(' w ')
  await page.locator('[data-square="e4"]').click(); await wait(page); await move(page, 'e7', 'e5'); expect(await history(page)).toEqual(['e4', 'e5'])
  await page.reload(); await page.locator('#loading').waitFor({ state: 'hidden' }); expect(await history(page)).toEqual(['e4', 'e5'])
  await openMenu(page); await page.locator('#undo').click(); await resume(page); expect(await history(page)).toEqual(['e4'])
  await page.locator('[data-square="e7"]').focus(); await page.keyboard.press('ArrowRight'); await expect(page.locator('[data-square="f7"]')).toBeFocused()
})

for (const [name, start, from, to, expected] of [
  ['white castle', 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1', 'g1', 'R4RK1'],
  ['black queenside castle', 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'e8', 'c8', '2kr3r'],
  ['white en passant', '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5', 'd6', '3P4'],
  ['black en passant', '4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 1', 'e4', 'd3', '3p4'],
] as const) test(name, async ({ page }) => { await openMenu(page); await page.locator('#motion').check(); await resume(page); await fixture(page, start); await move(page, from, to); expect(await fen(page)).toContain(expected) })

test('pawn capture resolves as an encounter on the destination square', async ({ page }) => {
  await openMenu(page); await page.locator('#motion').check(); await resume(page); await fixture(page, '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1'); await move(page, 'e4', 'd5'); expect(await fen(page)).toContain('3P4')
})

for (const [type, letter] of [['q', 'Q'], ['r', 'R'], ['b', 'B'], ['n', 'N']] as const) test(`promotion ${type}`, async ({ page }) => {
  await fixture(page, 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1')
  await page.locator('[data-square="e7"]').click(); await page.locator('[data-square="e8"]').click(); await expect(page.locator('#promotion')).toBeVisible()
  await page.locator(`[data-promote="${type}"]`).click(); await wait(page); expect(await fen(page)).toContain(`k3${letter}3`)
})

test('mate, stalemate, and cancelled promotion keep the correct modal and board state', async ({ page }) => {
  await fixture(page, '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'); await expect(page.locator('#result')).toBeVisible(); await expect(page.locator('#result-copy')).toContainText('Checkmate'); await page.locator('#view-board').click()
  await fixture(page, '7k/5Q2/7K/8/8/8/8/8 b - - 0 1'); await expect(page.locator('#result')).toBeVisible(); await expect(page.locator('#result-copy')).toContainText('stalemate'); await page.locator('#view-board').click()
  await fixture(page, 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1'); await page.locator('[data-square="e7"]').click(); await page.locator('[data-square="e8"]').click(); await page.locator('#cancel-promotion').click(); expect(await fen(page)).toContain('4P3')
})

for (const difficulty of ['easy', 'normal', 'hard', 'expert']) test(`AI difficulty ${difficulty}`, async ({ page }) => {
  await newSettings(page); await startGame(page, 'ai', difficulty); await move(page, 'e2', 'e4')
  await expect.poll(() => history(page).then((moves) => moves.length), { timeout: 15_000 }).toBe(2); await wait(page); expect(await fen(page)).toContain(' w ')
})

test('new game cancels a stale AI turn and resize leaves a settled board', async ({ page }) => {
  await newSettings(page); await startGame(page, 'ai', 'expert'); await page.locator('[data-square="e2"]').click(); await page.locator('[data-square="e4"]').click()
  await newSettings(page); await startGame(page, 'local'); await page.setViewportSize({ width: 390, height: 844 }); await wait(page)
  expect(await history(page)).toEqual([]); expect(await fen(page)).toContain('rnbqkbnr')
})

test('settings cancel preserves an active game and winner play again starts through settings', async ({ page }) => {
  await move(page, 'e2', 'e4'); const before = await fen(page); await newSettings(page); await page.locator('#cancel-new-game').click(); expect(await fen(page)).toBe(before)
  await fixture(page, '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'); await expect(page.locator('#result')).toBeVisible(); await page.locator('#play-again').click(); await expect(page.locator('#new-game-settings')).toBeVisible()
  await startGame(page, 'local'); expect(await fen(page)).toContain('rnbqkbnr')
})

test('perspective controls keep 64 polygon hit areas and flip square coordinates', async ({ page }) => {
  const e2 = page.locator('[data-square="e2"]'), before = await e2.boundingBox()
  expect(await page.locator('[data-square]').count()).toBe(64); expect(await e2.evaluate((element) => getComputedStyle(element).clipPath)).toContain('polygon')
  await openMenu(page); await page.locator('#flip').click(); await resume(page); const after = await e2.boundingBox(); expect(after?.y).not.toBe(before?.y)
  await e2.click(); await page.locator('[data-square="e3"]').click(); await wait(page); expect(await fen(page)).toContain('4P3')
})

test('phone portrait, landscape, reduced motion, and guide remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390); await move(page, 'e2', 'e4')
  await page.setViewportSize({ width: 844, height: 390 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844)
  await page.emulateMedia({ reducedMotion: 'reduce' }); await openMenu(page); await expect(page.locator('#motion')).not.toBeChecked(); await page.locator('#guide-button').click(); await expect(page.locator('#guide')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('#guide')).toBeHidden()
})
