import { expect, test, type Page } from '@playwright/test'

const state = (page: Page) => page.evaluate(() => (window as any).checkmate.state)
const square = (page: Page, id: string) => page.locator(`#cm-squares [data-square="${id}"]`)

async function boot(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?mode=checkmate&encounter=tower&new=1')
  await page.locator('#cm-loading').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => Boolean((window as any).checkmate))
  await page.locator('[data-encounter-id="tower"]').click()
  await page.locator('#cm-start-deployment').click()
  await expect.poll(async () => (await state(page)).options.encounterId).toBe('tower')
}

async function center(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`Missing ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function moveHareOntoTower(page: Page) {
  const game = await state(page)
  const card = game.players.w.support.find((entry: any) => entry.definitionId === 'reserve-order')
  if (!card) throw new Error('Watchtower lesson is missing Reserve Order')
  await page.locator(`[data-support-side="w"] [data-card-id="${card.id}"]`).click()
  const source = await center(page, '[data-square="b2"]')
  const target = await center(page, '[data-square="d3"]')
  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => ({
    square: (await state(page)).units.find((unit: any) => unit.id === 'w-unit-6')?.square,
    busy: await page.evaluate(() => (window as any).checkmate?.busy),
  }), { timeout: 10_000 }).toMatchObject({ square: 'd3', busy: false })
}

async function squarePixels(page: Page, id: string) {
  const box = await square(page, id).boundingBox()
  if (!box) throw new Error(`Missing square ${id}`)
  return page.locator('#cm-board').evaluate((canvas, point) => {
    const rect = canvas.getBoundingClientRect()
    const context = (canvas as HTMLCanvasElement).getContext('2d')!
    const scaleX = (canvas as HTMLCanvasElement).width / rect.width
    const scaleY = (canvas as HTMLCanvasElement).height / rect.height
    const pixels: number[][] = []
    for (const fraction of [[.20, .20], [.80, .20], [.20, .80], [.80, .80]]) {
      const x = Math.round((point.x - rect.left + point.width * (fraction[0] - .5)) * scaleX)
      const y = Math.round((point.y - rect.top + point.height * (fraction[1] - .5)) * scaleY)
      pixels.push([...context.getImageData(x, y, 1, 1).data])
    }
    return pixels
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width, height: box.height })
}

async function neutralEmptySquarePixels(page: Page) {
  const game = await state(page)
  const occupied = new Set<string>([
    ...game.units.filter((unit: any) => unit.hp > 0 && unit.square).map((unit: any) => unit.square),
    ...Object.keys(game.obstacles ?? {}),
    ...Object.keys(game.terrain ?? {}),
    ...Object.keys(game.items ?? {}),
    game.options?.encounterId === 'tower' ? 'e5' : '',
  ])
  const empty = ['a1', 'h1', 'a8', 'h8', 'a4', 'h4', 'a5', 'h5'].find(id => !occupied.has(id))
  if (!empty) throw new Error('Expected an empty courtyard square')
  return { id: empty, pixels: await squarePixels(page, empty) }
}

test('Watchtower courtyard renders loaded terrain, complete polygon hitboxes, and a tower landing', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await boot(page)

  await expect(page.locator('#cm-squares [data-square]')).toHaveCount(64)
  const board = await page.locator('.cm-board-wrap').boundingBox()
  expect(board).not.toBeNull()
  for (const id of ['a1', 'd3', 'h8']) {
    const box = await square(page, id).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(board!.x)
    expect(box!.y).toBeGreaterThanOrEqual(board!.y)
    expect(box!.x + box!.width).toBeLessThanOrEqual(board!.x + board!.width + 1)
    expect(box!.y + box!.height).toBeLessThanOrEqual(board!.y + board!.height + 1)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name))
  for (const asset of ['courtyard-stone-v1.webp', 'habitat-squares-v1.webp', 'structure-ground-v1.webp', 'wall-scenery.webp', 'tower-scenery.webp']) {
    expect(resources.some(name => name.endsWith(`/assets/checkmate/${asset}`))).toBe(true)
  }

  const { pixels } = await neutralEmptySquarePixels(page)
  expect(pixels.every(pixel => pixel[3] > 0)).toBe(true)
  const chroma = pixels.map(([red, green, blue]) => Math.max(red, green, blue) - Math.min(red, green, blue))
  const luminance = pixels.map(([red, green, blue]) => red * .2126 + green * .7152 + blue * .0722)
  expect(chroma.reduce((sum, value) => sum + value, 0) / chroma.length).toBeLessThan(75)
  expect(Math.max(...luminance) - Math.min(...luminance)).toBeGreaterThan(4)
  const hareSquare = (await state(page)).units.find((unit: any) => unit.id === 'w-unit-6')?.square
  expect(hareSquare).toBe('b2')
  const habitatPixels = await squarePixels(page, hareSquare)
  const terrainDifference = habitatPixels.reduce((sum, pixel, index) => sum + Math.abs(pixel[0] - pixels[index][0]) + Math.abs(pixel[1] - pixels[index][1]) + Math.abs(pixel[2] - pixels[index][2]), 0) / habitatPixels.length
  expect(terrainDifference).toBeGreaterThan(45)

  await page.locator('.cm-board-wrap').screenshot({ path: 'review/checkmate-courtyard-desktop.png' })
  await moveHareOntoTower(page)
  await expect.poll(async () => (await state(page)).obstacles.d3?.spent).toBeUndefined()
  const vacatedPixels = await squarePixels(page, 'b2')
  const vacatedChroma = vacatedPixels.map(([red, green, blue]) => Math.max(red, green, blue) - Math.min(red, green, blue))
  const vacatedDifference = vacatedPixels.reduce((sum, pixel, index) => sum + Math.abs(pixel[0] - habitatPixels[index][0]) + Math.abs(pixel[1] - habitatPixels[index][1]) + Math.abs(pixel[2] - habitatPixels[index][2]), 0) / vacatedPixels.length
  expect(vacatedChroma.reduce((sum, value) => sum + value, 0) / vacatedChroma.length).toBeLessThan(75)
  expect(vacatedDifference).toBeGreaterThan(45)
  await page.locator('.cm-board-wrap').screenshot({ path: 'review/checkmate-courtyard-tower-occupied.png' })

  await page.locator('#cm-menu-button').click()
  const beforeFlip = await square(page, 'b2').boundingBox()
  await page.locator('#cm-flip').click()
  const afterFlip = await square(page, 'b2').boundingBox()
  expect(Math.abs(afterFlip!.x - beforeFlip!.x) + Math.abs(afterFlip!.y - beforeFlip!.y)).toBeGreaterThan(board!.width * .5)
  await page.locator('#cm-menu-close').click()
  expect(errors).toEqual([])
})

test('Watchtower courtyard remains contained at 390 pixels', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await boot(page)
  await expect(page.locator('#cm-squares [data-square]')).toHaveCount(64)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const board = await page.locator('.cm-board-wrap').boundingBox()
  expect(board!.x).toBeGreaterThanOrEqual(0)
  expect(board!.x + board!.width).toBeLessThanOrEqual(390)
  await page.locator('.cm-board-wrap').screenshot({ path: 'review/checkmate-courtyard-phone.png' })
  expect(errors).toEqual([])
  await context.close()
})

test('aligned structure sprites preserve buildings while fading only their lower lateral pads', async ({ page }) => {
  await page.goto('/')
  const contracts = await page.evaluate(async () => {
    const [{ createAlignedStructureSprite }, { OBSTACLE_SPRITE_LAYOUT }] = await Promise.all([
      import('/src/checkmate/structure-ground.ts'),
      import('/src/checkmate/obstacle-art.ts'),
    ])
    const load = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error(`Unable to load ${url}`))
      image.src = url
    })
    return Promise.all((['wall', 'tower'] as const).map(async kind => {
      const image = await load(`/assets/checkmate/${kind}-scenery.webp`)
      const original = document.createElement('canvas')
      original.width = image.naturalWidth; original.height = image.naturalHeight
      original.getContext('2d')!.drawImage(image, 0, 0)
      const output = createAlignedStructureSprite(image, kind)
      const before = original.getContext('2d')!.getImageData(0, 0, original.width, original.height).data
      const after = output.getContext('2d')!.getImageData(0, 0, output.width, output.height).data
      const band = kind === 'wall' ? .60 : .70
      const contactEnd = kind === 'wall' ? .89 : .90
      const tile = output.width / OBSTACLE_SPRITE_LAYOUT[kind].footprint
      let upperAlphaChanged = 0, upperOpaqueRgbChanged = 0, reducedLateral = 0, retainedContact = 0
      for (let y = 0; y < output.height; y++) for (let x = 0; x < output.width; x++) {
        const index = (y * output.width + x) * 4
        const sourceAlpha = before[index + 3], outputAlpha = after[index + 3]
        if (y < Math.ceil(output.height * band) && sourceAlpha !== outputAlpha) upperAlphaChanged++
        // Canvas readback can round RGB in antialiased, semitransparent WebP pixels after putImageData.
        // The solid building pixels, whose visible RGB matters, must stay byte-identical.
        if (y < Math.ceil(output.height * band) && sourceAlpha === 255 && (before[index] !== after[index] || before[index + 1] !== after[index + 1] || before[index + 2] !== after[index + 2])) upperOpaqueRgbChanged++
        const distance = Math.abs(x - output.width / 2)
        if (y >= output.height * band && distance >= tile * .52 && sourceAlpha > 0 && outputAlpha < sourceAlpha) reducedLateral++
        if (y >= output.height * contactEnd && distance <= tile * .20 && sourceAlpha > 0 && outputAlpha === sourceAlpha) retainedContact++
      }
      return { kind, upperAlphaChanged, upperOpaqueRgbChanged, reducedLateral, retainedContact }
    }))
  })
  for (const contract of contracts) {
    expect(contract.upperAlphaChanged, JSON.stringify(contract)).toBe(0)
    expect(contract.upperOpaqueRgbChanged, JSON.stringify(contract)).toBe(0)
    expect(contract.reducedLateral).toBeGreaterThan(0)
    expect(contract.retainedContact).toBeGreaterThan(0)
  }
})
