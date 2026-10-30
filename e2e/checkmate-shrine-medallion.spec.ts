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

async function installSix(page: Page) {
  for (let index = 0; index < 6; index++) {
    await page.locator('#cm-hand [data-card-id]').first().press(' ')
    await page.locator('#cm-confirm').click()
  }
}

async function order(page: Page, side: string, index: number, from: string, to: string) {
  await page.locator(`[data-support-side="${side}"] [data-card-id]`).nth(index).press(' ')
  await page.locator(`[data-square="${from}"]`).click()
  await page.locator(`[data-square="${to}"]`).click()
  await page.locator('#cm-confirm').click()
  await expect.poll(() => page.evaluate(() => (window as any).checkmate.busy)).toBe(false)
}

function medallion(page: Page, cardId: string) {
  return page.locator(`.cm-shrine-medallion[data-medallion-card="${cardId}"]`)
}

test('each occupied shrine socket has an identity-matched medallion that follows cooldown through reload', async ({ page }) => {
  await boot(page)
  await installSix(page)

  const cards = page.locator('[data-support-side] [data-card-id]')
  await expect(cards).toHaveCount(6)
  for (let index = 0; index < await cards.count(); index++) {
    const card = cards.nth(index)
    const id = await card.getAttribute('data-card-id')
    if (!id) throw new Error('Expected support card identity')
    const slot = card.locator('xpath=..')
    await expect(slot.locator(`.cm-shrine-medallion[data-medallion-card="${id}"]`)).toHaveCount(1)
    await expect(medallion(page, id)).toHaveAttribute('data-state', /^(ready|locked|exhausted)$/)
  }

  const source = page.locator('[data-support-side="w"] [data-card-id]').first()
  const id = await source.getAttribute('data-card-id')
  if (!id) throw new Error('Expected white support card identity')
  const badge = medallion(page, id)
  await expect(badge).toHaveAttribute('data-state', 'ready')
  await expect(badge.locator('.cm-shrine-leaf')).toBeVisible()

  await order(page, 'w', 0, 'e2', 'e4')
  await expect(badge).toHaveAttribute('data-state', 'exhausted')
  await expect(badge).toHaveAttribute('data-medallion-card', id)
  await expect(badge.locator('.cm-shrine-count')).toBeVisible()
  await expect(badge.locator('.cm-shrine-count')).toHaveAttribute('viewBox', /0 0 \d+ 7/)
  await expect(badge.locator('.cm-shrine-leaf')).toBeHidden()
  await expect(badge).toHaveAttribute('aria-label', /2 own turns until ready/)

  await page.reload()
  await page.locator('#cm-loading').waitFor({ state: 'hidden' })
  await expect(badge).toHaveAttribute('data-state', 'exhausted')
  await expect(badge).toHaveAttribute('aria-label', /2 own turns until ready/)
  await expect(badge.locator('.cm-shrine-count')).toBeVisible()

  await order(page, 'b', 0, 'e7', 'e5')
  await expect(badge).toHaveAttribute('aria-label', /1 own turn until ready/)
  await expect(badge.locator('.cm-shrine-count')).toBeVisible()
  await order(page, 'w', 1, 'd2', 'd4')
  await order(page, 'b', 1, 'd7', 'd5')
  await expect(badge).toHaveAttribute('data-state', 'ready')
  await expect(badge.locator('.cm-shrine-leaf')).toBeVisible()
  await expect(badge.locator('.cm-shrine-count')).toBeHidden()
})

test('arming then cancelling a ready shrine card leaves its medallion ready and unspent', async ({ page }) => {
  await boot(page)
  await installSix(page)
  const card = page.locator('[data-support-side="w"] [data-card-id]').first()
  const id = await card.getAttribute('data-card-id')
  if (!id) throw new Error('Expected white support card identity')
  const badge = medallion(page, id)
  const before = await page.evaluate((cardId) => {
    const state = (window as any).checkmate.state
    return state.players.w.support.find((card: any) => card.id === cardId).readyOn
  }, id)

  await card.press(' ')
  await expect(card).toHaveClass(/cm-order-armed/)
  await expect(badge).toHaveAttribute('data-state', 'ready')
  await expect(badge.locator('.cm-shrine-leaf')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(card).not.toHaveClass(/cm-order-armed/)
  await expect(badge).toHaveAttribute('data-state', 'ready')
  await expect(badge.locator('.cm-shrine-leaf')).toBeVisible()
  await expect.poll(() => page.evaluate((cardId) => {
    const state = (window as any).checkmate.state
    return state.players.w.support.find((card: any) => card.id === cardId).readyOn
  }, id)).toBe(before)
})

test('reduced motion freezes shrine medallions and altar relics retain their ledge hitboxes', async ({ browser }) => {
  for (const [width, height, mobile] of [[390, 844, true], [1280, 900, false]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await boot(page)
    await installSix(page)
    const card = page.locator('[data-support-side="w"] [data-card-id]').first()
    const id = await card.getAttribute('data-card-id')
    if (!id) throw new Error('Expected white support card identity')
    const badge = medallion(page, id)
    const motion = await badge.evaluate(node => {
      const style = getComputedStyle(node)
      return { animation: style.animationName, animationDuration: style.animationDuration, transitionDuration: style.transitionDuration }
    })
    expect(motion.animation).toBe('none')
    expect(motion.animationDuration).toBe('0s')
    expect(motion.transitionDuration).toBe('0s')

    const layout = await card.evaluate(node => {
      const title = node.querySelector<HTMLElement>('.tcg-card__title')
      const cardBox = node.getBoundingClientRect()
      const slot = node.closest<HTMLElement>('.cm-support-slot')
      const bank = node.closest<HTMLElement>('.cm-support-bank')
      const art = [...(bank?.querySelectorAll<HTMLImageElement>('.cm-altar-art') ?? [])].find(image => getComputedStyle(image).display !== 'none')
      if (!title || !slot || !bank || !art) throw new Error('Expected shrine card title and altar art')
      const titleStyle = getComputedStyle(title)
      const artBox = art.getBoundingClientRect()
      const scale = Math.min(artBox.width / art.naturalWidth, artBox.height / art.naturalHeight)
      const artHeight = art.naturalHeight * scale
      const vertical = art.classList.contains('cm-altar-vertical')
      const slots = [...bank.querySelectorAll<HTMLElement>('.cm-support-slot')]
      const index = slots.indexOf(slot)
      const ledge = artBox.bottom - artHeight + artHeight * (vertical ? [.347, .625, .89][index] : .615)
      return { cardBottom: cardBox.bottom, ledge, titleDisplay:titleStyle.display, relicVisible:node.querySelector('.tcg-card__art')!.getBoundingClientRect().width>0 }
    })
    expect(layout.titleDisplay).toBe('none')
    expect(layout.relicVisible).toBe(true)
    expect(Math.abs(layout.cardBottom - layout.ledge)).toBeLessThan(3)
    const covered = await page.locator('.cm-shrine-medallion').evaluateAll(nodes => nodes.some(node => {
      const rect=node.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2
      return [...document.querySelectorAll('.cm-support-slot [data-card-id]')].some(card=>{const r=card.getBoundingClientRect();return x>r.left&&x<r.right&&y>r.top&&y<r.bottom})
    }))
    expect(covered).toBe(false)
    await context.close()
  }
})
