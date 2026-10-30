import {test,expect} from '@playwright/test'
for(const [width,height] of [[652,1004],[390,844],[390,667],[844,390],[1440,900]])test(`cards stand on illustrated ledges at ${width}×${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/?mode=checkmate&new=1');await page.locator('#cm-loading').waitFor({state:'hidden'});await page.selectOption('#cm-match-kind','skirmish');await page.selectOption('#cm-play-mode','local');await page.locator('#cm-seed').fill('1');await page.locator('#cm-start-deployment').click();if(await page.locator('#cm-auto-deploy').isVisible())await page.locator('#cm-auto-deploy').click()
 for(let i=0;i<6;i++){await page.locator('#cm-hand [data-card-id]').first().press(' ');await page.locator('#cm-confirm').click()}
 await page.mouse.move(1,1)
 const holders=await page.locator('.cm-support-bank').evaluateAll(banks=>banks.map(bank=>{
  const art=[...bank.querySelectorAll<HTMLImageElement>('.cm-altar-art')].find(img=>img.getBoundingClientRect().height>0&&getComputedStyle(img).display!=='none')!,r=art.getBoundingClientRect(),vertical=art.classList.contains('cm-altar-vertical'),scale=Math.min(r.width/art.naturalWidth,r.height/art.naturalHeight),height=art.naturalHeight*scale,top=r.bottom-height
  return {fit:getComputedStyle(art).objectFit,frames:[...bank.querySelectorAll('.cm-support-slot')].map((slot,index)=>({extraFrame:getComputedStyle(slot,'::before').display,bottom:slot.querySelector('[data-card-id]')!.getBoundingClientRect().bottom,ledge:top+height*(vertical?[.347,.625,.89][index]!:.615)}))}
 }))
 for(const holder of holders){expect(holder.fit).toBe('contain');for(const frame of holder.frames){expect(frame.extraFrame).toBe('none');expect(Math.abs(frame.bottom-frame.ledge)).toBeLessThan(3)}}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
})
