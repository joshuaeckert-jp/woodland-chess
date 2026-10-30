import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const state = (page: Page) => page.evaluate(() => (window as any).checkmate.state)

async function boot(page: Page, reducedMotion = false) {
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
  await page.goto('/?mode=checkmate&encounter=crossing&new=1')
  await page.locator('#cm-board').waitFor()
  await page.locator('#cm-loading').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => Boolean((window as any).checkmate))
  await page.locator('[data-encounter-id="crossing"]').click()
  await page.locator('#cm-start-deployment').click()
  await expect.poll(async () => (await state(page)).options.encounterId).toBe('crossing')
  await expect.poll(() => page.evaluate(() => (window as any).checkmate.busy)).toBe(false)
}

async function point(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`Missing ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function readyShield(page: Page) {
  const card = (await state(page)).players.w.support.find((entry: any) => entry.definitionId === 'brace')
  if (!card) throw new Error('Crossing should start with a ready Iron Shield')
  const selector = `[data-support-side="w"] [data-card-id="${card.id}"]`
  await expect(page.locator(selector)).toBeVisible()
  return { id: card.id as string, selector }
}

async function canvasHash(page: Page) {
  return page.locator('.cm-card-mist').evaluate(node => {
    const canvas = node as HTMLCanvasElement
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let hash = 2166136261
    for (let index = 0; index < pixels.length; index += 7) hash = Math.imul(hash ^ pixels[index], 16777619)
    return hash >>> 0
  })
}

async function touchDrag(context: BrowserContext, page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  for (let step = 1; step <= 12; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (to.x - from.x) * step / 12, y: from.y + (to.y - from.y) * step / 12 }],
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test('a ready altar relic becomes a living mist, then surrounds its valid Guard target once', async ({ page }) => {
  await boot(page)
  const shield = await readyShield(page)
  const source = await point(page, shield.selector)
  const king = await point(page, '[data-square="d1"]')
  const before = await state(page)

  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await page.mouse.move(king.x, king.y, { steps: 12 })
  const mist = page.locator('.cm-card-mist')
  await expect(mist).toHaveAttribute('data-stage', 'drag')
  await expect(mist).toHaveCSS('pointer-events', 'none')
  await expect(page.locator(`${shield.selector}.cm-mist-source .tcg-card__illustration`)).toHaveCSS('animation-name', 'cm-relic-evaporate')
  await expect(page.locator(`${shield.selector}.cm-mist-source .tcg-card__illustration`)).toHaveCSS('opacity', /0\.[0-9]+|0/)
  const paintedRight=await mist.evaluate(node=>{const c=node as HTMLCanvasElement,d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let right=0;for(let i=3;i<d.length;i+=4)if(d[i]>20)right=Math.max(right,((i-3)/4)%c.width);return right/(c.width/innerWidth)})
  expect(paintedRight).toBeGreaterThan(source.x-35) // The stream must reach the altar, not only paint the cursor.
  const firstHash = await canvasHash(page)
  await page.waitForTimeout(220)
  const secondHash = await canvasHash(page)
  console.log(`spell mist drag hashes ${firstHash} -> ${secondHash}`)
  expect(secondHash).not.toBe(firstHash)
  await mist.screenshot({ path: 'review/spell-mist-drag-desktop.png' })

  await page.mouse.up()
  await expect(mist).toHaveAttribute('data-stage', 'travel')
  await expect(mist).toHaveAttribute('data-stage', 'surround', { timeout: 1_200 })
  await mist.screenshot({ path: 'review/spell-mist-surround-desktop.png' })
  await expect.poll(() => page.evaluate(() => (window as any).checkmate.busy), { timeout: 4_000 }).toBe(false)
  await expect(mist).toHaveCount(0, { timeout: 1_500 })

  const after = await state(page)
  const burns = after.log.filter((entry: any) => entry.type === 'burn' && entry.cardId === shield.id)
  expect(burns).toHaveLength(1)
  expect(after.log.length).toBeGreaterThanOrEqual(before.log.length + 1)
  expect(after.log.filter((entry: any) => entry.type === 'burn').length).toBe(before.log.filter((entry: any) => entry.type === 'burn').length + 1)
  expect(after.log.some((entry: any) => entry.player === 'b')).toBe(true)
})

test('an invalid spell drop retracts the mist without changing the game', async ({ page }) => {
  await boot(page)
  const shield = await readyShield(page)
  const source = await point(page, shield.selector)
  const before = await state(page)
  const mist = page.locator('.cm-card-mist')

  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await page.mouse.move(18, 18, { steps: 10 })
  await expect(mist).toHaveAttribute('data-stage', 'drag')
  await page.mouse.up()
  await expect(mist).toHaveAttribute('data-stage', 'return')
  await expect(mist).toHaveCount(0, { timeout: 1_200 })
  expect((await state(page)).log).toEqual(before.log)
  await expect(page.locator(`${shield.selector} .tcg-card__illustration`)).toHaveCSS('opacity', '1')

})

test('Escape retracts an in-progress altar spell without spending it', async ({ page }) => {
  await boot(page)
  const shield = await readyShield(page)
  const source = await point(page, shield.selector)
  const before = await state(page)
  const mist = page.locator('.cm-card-mist')

  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await page.mouse.move(source.x + 70, source.y + 24, { steps: 8 })
  await expect(mist).toHaveAttribute('data-stage', 'drag')
  await page.keyboard.press('Escape')
  await expect(mist).toHaveCount(0, { timeout: 1_200 })
  expect((await state(page)).log).toEqual(before.log)
})

test('a 390px touch Guard cast respects reduced motion and leaves no mist canvas behind', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await boot(page, true)
  const shield = await readyShield(page)
  const before = await state(page)
  await touchDrag(context, page, await point(page, shield.selector), await point(page, '[data-square="d1"]'))
  await expect.poll(() => page.evaluate(() => (window as any).checkmate.busy), { timeout: 3_000 }).toBe(false)
  await expect(page.locator('.cm-card-mist')).toHaveCount(0)
  const after = await state(page)
  expect(after.log.filter((entry: any) => entry.type === 'burn' && entry.cardId === shield.id)).toHaveLength(1)
  expect(after.log.length).toBeGreaterThanOrEqual(before.log.length + 1)
  await context.close()
})

test('a 390px touch drag keeps the normal-motion mist connected from altar to king before release', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await boot(page)
  const shield = await readyShield(page)
  const source = await point(page, shield.selector)
  const king = await point(page, '[data-square="d1"]')
  const before = await state(page)
  const cdp = await context.newCDPSession(page)

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [source] })
  for (let step = 1; step <= 12; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: source.x + (king.x - source.x) * step / 12, y: source.y + (king.y - source.y) * step / 12 }],
    })
  }
  const mist = page.locator('.cm-card-mist')
  await expect(mist).toHaveAttribute('data-stage', 'drag')
  const paintedSpan = await mist.evaluate(node => {
    const canvas = node as HTMLCanvasElement
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let left = canvas.width, right = 0
    for (let index = 3; index < data.length; index += 4) if (data[index] > 20) {
      const x = ((index - 3) / 4) % canvas.width
      left = Math.min(left, x)
      right = Math.max(right, x)
    }
    const scale = canvas.width / innerWidth
    return { left: left / scale, right: right / scale }
  })
  expect(paintedSpan.left).toBeLessThan(Math.min(source.x, king.x) + 34)
  expect(paintedSpan.right).toBeGreaterThan(Math.max(source.x, king.x) - 34)
  await mist.screenshot({ path: 'review/spell-mist-drag-phone.png' })

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(mist).toHaveAttribute('data-stage', 'travel')
  await expect(mist).toHaveAttribute('data-stage', 'surround', { timeout: 1_200 })
  await mist.screenshot({ path: 'review/spell-mist-surround-phone.png' })
  await expect.poll(() => page.evaluate(() => (window as any).checkmate.busy), { timeout: 4_000 }).toBe(false)
  await expect(mist).toHaveCount(0, { timeout: 1_500 })
  expect((await state(page)).log.filter((entry: any) => entry.type === 'burn' && entry.cardId === shield.id)).toHaveLength(1)
  expect((await state(page)).log.length).toBeGreaterThanOrEqual(before.log.length + 1)
  await context.close()
})
