import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const state = (page: Page) => page.evaluate(() => (window as any).checkmate.state)
const phase = (page: Page) => page.locator('#cm-board').getAttribute('data-terrain-trail-phase')
const count = (page: Page) => page.locator('#cm-board').getAttribute('data-terrain-trail-count')

async function boot(page: Page, reducedMotion = false) {
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
  await page.goto('/?mode=checkmate&encounter=tower&new=1')
  await page.locator('#cm-loading').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => Boolean((window as any).checkmate))
  await page.locator('[data-encounter-id="tower"]').click()
  await page.locator('#cm-start-deployment').click()
  await expect.poll(async () => (await state(page)).options.encounterId).toBe('tower')
}

async function point(page: Page, square: string) {
  const box = await page.locator(`[data-square="${square}"]`).boundingBox()
  if (!box) throw new Error(`Missing ${square}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function armOrder(page: Page) {
  const game = await state(page)
  const card = game.players.w.support.find((entry: any) => entry.definitionId === 'reserve-order')
  if (!card) throw new Error('Watchtower lesson is missing Reserve Order')
  await page.locator(`[data-support-side="w"] [data-card-id="${card.id}"]`).click()
}

async function beginMouseDrag(page: Page, from: string, to: string) {
  const source = await point(page, from), target = await point(page, to)
  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 10 })
}

async function waitForClear(page: Page) {
  await waitForPhase(page, 'none', 5_000)
  await expect.poll(() => count(page), { timeout: 5_000 }).toBe('0')
}

/** Observe every canvas phase mutation so the intentional 360ms recede cannot be missed by polling intervals. */
async function waitForPhase(page: Page, wanted: string, timeout = 3_000) {
  await page.evaluate(({ wanted, timeout }) => new Promise<void>((resolve, reject) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#cm-board')!
    let timer = 0
    const done = () => { observer.disconnect(); clearTimeout(timer); resolve() }
    const check = () => { if (canvas.dataset.terrainTrailPhase === wanted) done() }
    const observer = new MutationObserver(check)
    observer.observe(canvas, { attributes: true, attributeFilter: ['data-terrain-trail-phase'] })
    timer = window.setTimeout(() => { observer.disconnect(); reject(new Error(`Terrain trail did not reach ${wanted}`)) }, timeout)
    check()
  }), { wanted, timeout })
}

async function startPhaseTrace(page: Page) {
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#cm-board')!
    const trace = [canvas.dataset.terrainTrailPhase ?? 'none']
    let previous = trace[0]
    const observer = new MutationObserver(() => {
      const next = canvas.dataset.terrainTrailPhase ?? 'none'
      if (next !== previous) { trace.push(next); previous = next }
    })
    observer.observe(canvas, { attributes: true, attributeFilter: ['data-terrain-trail-phase'] })
    ;(window as any).__terrainTrailTrace = { trace, observer }
  })
}

async function finishPhaseTrace(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const captured = (window as any).__terrainTrailTrace
    captured.observer.disconnect()
    delete (window as any).__terrainTrailTrace
    return captured.trace as string[]
  })
}

test('a valid ordered habitat drag previews terrain before one move, then follows and recedes', async ({ page }) => {
  await boot(page)
  await armOrder(page)
  const before = await state(page)
  await beginMouseDrag(page, 'b2', 'd3')
  await waitForPhase(page, 'preview')
  expect(Number(await count(page))).toBeGreaterThan(0)
  expect((await state(page)).log).toHaveLength(before.log.length)
  await page.locator('.cm-board-wrap').screenshot({ path: 'review/terrain-trail-preview-desktop.png' })

  await startPhaseTrace(page)
  await page.mouse.up()
  await waitForPhase(page, 'follow')
  const handoff = await finishPhaseTrace(page)
  const follow = handoff.indexOf('follow')
  expect(follow).toBeGreaterThan(0)
  expect(handoff.slice(0, follow)).not.toContain('none')
  await page.locator('.cm-board-wrap').screenshot({ path: 'review/terrain-trail-follow-desktop.png' })
  await waitForPhase(page, 'recede', 5_000)
  await page.locator('.cm-board-wrap').screenshot({ path: 'review/terrain-trail-recede-desktop.png' })
  await waitForClear(page)
  const after = await state(page)
  expect(after.log).toHaveLength(before.log.length + 1)
  expect(after.units.find((unit: any) => unit.id === 'w-unit-6')?.square).toBe('d3')
})

test('invalid drops and Escape leave no terrain trail and do not spend the order', async ({ page }) => {
  await boot(page)
  await armOrder(page)
  const before = await state(page)
  await beginMouseDrag(page, 'b2', 'h8')
  await page.mouse.up()
  await waitForClear(page)
  expect((await state(page)).log).toHaveLength(before.log.length)
  expect((await state(page)).units.find((unit: any) => unit.id === 'w-unit-6')?.square).toBe('b2')

  await beginMouseDrag(page, 'b2', 'd3')
  await waitForPhase(page, 'preview')
  await page.keyboard.press('Escape')
  await waitForClear(page)
  expect((await state(page)).log).toHaveLength(before.log.length)
})

test('resize and visibility cancellation clear a receding terrain trail', async ({ page }) => {
  await boot(page)
  await armOrder(page)
  await beginMouseDrag(page, 'b2', 'd3')
  await page.mouse.up()
  await waitForPhase(page, 'recede', 5_000)
  await page.setViewportSize({ width: 1200, height: 860 })
  await waitForClear(page)

  await boot(page)
  await armOrder(page)
  await beginMouseDrag(page, 'b2', 'd3')
  await page.mouse.up()
  await waitForPhase(page, 'recede', 5_000)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await waitForClear(page)
})

test('reduced motion keeps direct habitat moves free of dynamic terrain trails', async ({ page }) => {
  await boot(page, true)
  await armOrder(page)
  await beginMouseDrag(page, 'b2', 'd3')
  await page.mouse.up()
  await expect.poll(async () => (await state(page)).units.find((unit: any) => unit.id === 'w-unit-6')?.square).toBe('d3')
  await page.waitForTimeout(500)
  await waitForClear(page)
})

test('enabling reduced motion during recede clears the route and settles the engine without an orphaned animation', async ({ page }) => {
  await boot(page)
  await armOrder(page)
  await beginMouseDrag(page, 'b2', 'd3')
  await page.mouse.up()
  await waitForPhase(page, 'recede', 5_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await waitForClear(page)
  await expect.poll(() => page.evaluate(() => (window as any).checkmate.busy), { timeout: 3_000 }).toBe(false)
  expect((await state(page)).units.find((unit: any) => unit.id === 'w-unit-6')?.square).toBe('d3')
})

test('phone touch drag previews and clears the terrain route after one valid move', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  await boot(page)
  await armOrder(page)
  const source = await point(page, 'b2'), target = await point(page, 'd3')
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [source] })
  for (let step = 1; step <= 10; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: source.x + (target.x - source.x) * step / 10, y: source.y + (target.y - source.y) * step / 10 }] })
  await waitForPhase(page, 'preview')
  await page.locator('.cm-board-wrap').screenshot({ path: 'review/terrain-trail-preview-phone.png' })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await waitForPhase(page, 'follow')
  await page.locator('.cm-board-wrap').screenshot({ path: 'review/terrain-trail-follow-phone.png' })
  await waitForPhase(page, 'recede', 5_000)
  await page.locator('.cm-board-wrap').screenshot({ path: 'review/terrain-trail-recede-phone.png' })
  await waitForClear(page)
  expect((await state(page)).units.find((unit: any) => unit.id === 'w-unit-6')?.square).toBe('d3')
  await context.close()
})
