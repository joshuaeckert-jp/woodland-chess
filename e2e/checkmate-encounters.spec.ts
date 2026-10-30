import {expect,test,type Page} from '@playwright/test'

const state=(page:Page)=>page.evaluate(()=>(window as any).checkmate.state)
const settled=(page:Page)=>expect.poll(()=>page.evaluate(()=>(window as any).checkmate.busy),{timeout:10000}).toBe(false)

async function center(page:Page,selector:string){
 const box=await page.locator(selector).first().boundingBox()
 if(!box)throw new Error(`Missing ${selector}`)
 return{x:box.x+box.width/2,y:box.y+box.height/2}
}

async function drag(page:Page,from:string,to:string){
 const source=await center(page,from),target=await center(page,to)
 await page.mouse.move(source.x,source.y)
 await page.mouse.down()
 await page.mouse.move(target.x,target.y,{steps:12})
 await page.mouse.up()
}

async function boot(page:Page,id:'blockade'|'rescue'|'crossing'='blockade'){
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.goto(`/?mode=checkmate&encounter=${id}&new=1`)
 await page.locator('#cm-board').waitFor()
 await page.locator('#cm-loading').waitFor({state:'hidden'})
 await page.waitForFunction(()=>Boolean((window as any).checkmate))
 await expect(page.locator('#cm-match-kind')).toHaveValue('encounter')
 await page.locator(`[data-encounter-id="${id}"]`).click()
 await page.locator('#cm-start-deployment').click()
 await expect.poll(async()=> (await state(page)).phase).toBe('battle')
 await expect.poll(async()=> (await state(page)).options.encounterId).toBe(id)
}

async function useSupport(page:Page,definition:string,target:string){
 const card=page.locator('[data-support-side="w"] [data-card-id]').filter({hasText:definition}).first()
 await expect(card).toBeVisible()
 await drag(page,`[data-support-side="w"] [data-card-id]:has-text("${definition}")`,`[data-square="${target}"]`)
 await settled(page)
}

async function useHand(page:Page,definition:string,from:string,to:string){
 const card=page.locator('#cm-hand [data-card-id]').filter({hasText:definition}).first()
 await expect(card).toBeVisible()
 await card.press('Space')
 await drag(page,`[data-square="${from}"]`,`[data-square="${to}"]`)
 if(await page.locator('#cm-preview').isVisible())await page.locator('#cm-confirm').click()
 await settled(page)
}

async function blockade(page:Page){
 await boot(page)
 const opening=await state(page)
 expect(opening.units.filter((u:any)=>u.square&&u.side==='w')).toHaveLength(2)
 expect(opening.units.filter((u:any)=>u.square&&u.side==='b')).toHaveLength(3)
 expect(opening.players.w.hand.map((card:any)=>card.definitionId)).toEqual(['smoke'])
 await expect(page.locator('#cm-status')).toContainText(/Capture the marked turtle/i)
 await useSupport(page,'Piercing Banner','a1')
 expect((await state(page)).turn).toBe('w')
 await useHand(page,'Smoke Veil','a1','a5')
 await expect(page.locator('#cm-result')).toBeVisible()
 await expect(page.locator('#cm-result-copy')).toContainText(/Blockade cleared/i)
 expect((await state(page)).winner).toBe('w')
}

test('the real encounter UI completes Blockade, Rescue, and Crossing against authored replies',async({page})=>{
 await blockade(page)
 await page.locator('#cm-next-encounter').click()
 await expect.poll(async()=> (await state(page)).options.encounterId).toBe('rescue')
 await useSupport(page,'Wild Herbs','b2')
 await expect.poll(async()=> (await state(page)).units.find((unit:any)=>unit.side==='b'&&unit.role==='r').square).toBe('b4')
 await useHand(page,'Piercing Banner','b2','c3')
 await expect(page.locator('#cm-result')).toBeVisible()
 await expect(page.locator('#cm-result-copy')).toContainText(/King rescued/i)

 await page.locator('#cm-next-encounter').click()
 await expect.poll(async()=> (await state(page)).options.encounterId).toBe('crossing')
 const rat=page.locator('#cm-hand [data-card-kind="unit"]')
 await expect(rat).toHaveCount(1)
 await rat.press('Space')
 await page.locator('[data-square="d2"]').click()
 await page.locator('#cm-confirm').click()
 await settled(page)
 await expect.poll(async()=> (await state(page)).units.find((unit:any)=>unit.side==='b'&&unit.role==='r').square).toBe('d2')
 await useSupport(page,'Iron Shield','d1')
 await useSupport(page,'Spring Ward','d1')
 await expect(page.locator('#cm-result')).toBeVisible()
 await expect(page.locator('#cm-result-copy')).toContainText(/Crossing held/i)
 expect((await state(page)).encounterProgress).toMatchObject({enemyReplies:3})
})

test('encounter undo, restart, retry, failure, and reload preserve authored progress',async({page})=>{
 await boot(page)
 await useSupport(page,'Piercing Banner','h1')
 const afterRound=await state(page)
 expect(afterRound.encounterProgress).toMatchObject({whiteActions:1,enemyReplies:1})
 await page.locator('#cm-menu-button').click()
 await page.locator('#cm-undo').click()
 const rewound=await state(page)
 expect(rewound.log).toHaveLength(0)
 expect(rewound.options).toEqual(afterRound.options)
 expect(rewound.encounterProgress).toMatchObject({whiteActions:0,enemyReplies:0})
 await page.locator('#cm-restart').click()
 const restarted=await state(page)
 expect(restarted.log).toHaveLength(0)
 expect(restarted.options.encounterId).toBe('blockade')

 await useSupport(page,'Piercing Banner','h1')
 await page.reload()
 await page.locator('#cm-loading').waitFor({state:'hidden'})
 await settled(page)
 const reloaded=await state(page)
 expect(reloaded.encounterProgress).toMatchObject({whiteActions:1,enemyReplies:1})
 await expect(page.locator('#cm-encounter-brief')).not.toHaveAttribute('open','')
 const logLength=reloaded.log.length
 await page.waitForTimeout(600)
 expect((await state(page)).log).toHaveLength(logLength)

 await useHand(page,'Smoke Veil','a1','a5')
 await expect(page.locator('#cm-result')).toBeVisible()
 await page.locator('#cm-play-again').click()
 await expect.poll(async()=> (await state(page)).options.encounterId).toBe('blockade')
 expect((await state(page)).log).toHaveLength(0)

 await useSupport(page,'Piercing Banner','h1')
 await useHand(page,'Smoke Veil','a1','a5')
 await expect(page.locator('#cm-result-copy')).toContainText(/Out of actions/i)
 expect((await state(page)).winner).toBe('b')
})

test('a phone touch flow completes Blockade with the real touch input path',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'})
 const page=await context.newPage()
 await boot(page)
 const cdp=await context.newCDPSession(page)
 async function touchDrag(from:string,to:string){
  const source=await center(page,from),target=await center(page,to)
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[source]})
  for(let step=1;step<=12;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:source.x+(target.x-source.x)*step/12,y:source.y+(target.y-source.y)*step/12}]})
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
 }
 await touchDrag('[data-support-side="w"] [data-card-id]:has-text("Piercing Banner")','[data-square="a1"]')
 await settled(page)
 await page.locator('#cm-hand [data-card-id]').press('Space')
 await touchDrag('[data-square="a1"]','[data-square="a5"]')
 if(await page.locator('#cm-preview').isVisible())await page.locator('#cm-confirm').click()
 await settled(page)
 await expect(page.locator('#cm-result-copy')).toContainText(/Blockade cleared/i)
 await context.close()
})

test('skirmish starts the standard deployed battle without a deployment control',async({page})=>{
 await page.goto('/?mode=checkmate&skirmish=1&new=1')
 await page.locator('#cm-loading').waitFor({state:'hidden'})
 await page.selectOption('#cm-match-kind','skirmish')
 await page.selectOption('#cm-play-mode','local')
 await page.locator('#cm-start-deployment').click()
 const game=await state(page)
 expect(game.phase).toBe('battle')
 expect(game.units.filter((unit:any)=>unit.square)).toHaveLength(32)
 expect(game.log).toHaveLength(32)
 await expect(page.locator('#cm-auto-deploy')).toBeHidden()
})
