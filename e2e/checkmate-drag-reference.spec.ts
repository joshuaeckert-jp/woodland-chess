import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const game=(page:Page)=>page.evaluate(()=>(window as any).checkmate.state)
const settled=(page:Page)=>expect.poll(()=>page.evaluate(()=>(window as any).checkmate.busy),{timeout:5000}).toBe(false)

async function boot(page:Page){
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.goto('/?mode=checkmate&new=1')
 await page.locator('#cm-board').waitFor()
 await page.locator('#cm-loading').waitFor({state:'hidden'})
 await page.selectOption('#cm-match-kind','skirmish')
 await page.selectOption('#cm-play-mode','local')
 await page.locator('#cm-seed').fill('1')
 await page.locator('#cm-start-deployment').click()
 if(await page.locator('#cm-auto-deploy').isVisible())await page.locator('#cm-auto-deploy').click()
}

async function center(locator:ReturnType<Page['locator']>){
 return locator.evaluate(node=>{
  const r=node.getBoundingClientRect();let left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom)
  for(let p=node.parentElement;p;p=p.parentElement){const style=getComputedStyle(p),box=p.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(style.overflowY)){top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom)}if(/hidden|auto|scroll|clip/.test(style.overflowX)){left=Math.max(left,box.left);right=Math.min(right,box.right)}}
  return{x:(left+right)/2,y:top+(bottom-top)*.4}
 })
}

async function dragAfterHold(page:Page,source:ReturnType<Page['locator']>,target:ReturnType<Page['locator']>,hold=200){
 const from=await center(source),to=await center(target)
 await page.mouse.move(from.x,from.y)
 await page.mouse.down()
 await page.waitForTimeout(hold)
 await page.mouse.move(to.x,to.y,{steps:14})
 await expect(page.locator('.cm-card-ghost')).toBeVisible()
 await page.mouse.up()
}

async function installHeldHandCard(page:Page){
 const before=await game(page),side=before.turn
 const card=page.locator('#cm-hand [data-card-id]').last(),id=await card.getAttribute('data-card-id')
 if(!id)throw new Error('Hand card has no identity')
 await dragAfterHold(page,card,page.locator(`[data-support-side="${side}"]`))
 await settled(page)
 const after=await game(page)
 expect(after.log).toHaveLength(before.log.length+1)
 expect(after.log.at(-1)).toMatchObject({type:'install',cardId:id,player:side})
 expect(after.turn).not.toBe(side)
 return {id,side}
}

async function squareCenter(page:Page,square:string){return center(page.locator(`[data-square="${square}"]`))}

test('a held visible hand card stays captured through its pause and installs exactly once',async({page})=>{
 await boot(page)
 const white=await installHeldHandCard(page)
 expect(white.side).toBe('w')
 const black=await installHeldHandCard(page)
 expect(black.side).toBe('b')
 const state=await game(page)
 expect(state.players.w.support.some((card:any)=>card.id===white.id)).toBe(true)
 expect(state.players.b.support.some((card:any)=>card.id===black.id)).toBe(true)

 const support=page.locator(`[data-support-side="w"] [data-card-id="${white.id}"]`)
 await support.click()
 await page.locator('[data-square="e2"]').click()
 await expect(page.locator('[data-square="e2"]')).toHaveClass(/cm-order-source/)
 const source=await squareCenter(page,'e2'),target=await squareCenter(page,'e4')
 await page.mouse.move(source.x,source.y);await page.mouse.down();await page.waitForTimeout(200);await page.mouse.move(target.x,target.y,{steps:12});await expect(page.locator('.cm-habitat-drag-hint')).toBeVisible();await page.mouse.up()
 await expect(page.locator('#cm-preview')).toBeHidden()
 await settled(page)
 const after=await game(page)
 expect(after.log.at(-1)).toMatchObject({type:'order',cardId:white.id,kind:'move',to:'e4'})
 expect(after.units.find((unit:any)=>unit.side==='w'&&unit.square==='e4')).toBeTruthy()
})

test('a Banner shrine drag casts immediately with mist and no Order/Effect chooser',async({page})=>{
 await boot(page)
 const opening=await game(page),banner=opening.players.w.hand.find((card:any)=>card.definitionId==='banner')
 if(!banner)throw new Error('Expected Banner in the opening hand')
 const card=page.locator(`#cm-hand [data-card-id="${banner.id}"]`)
 await dragAfterHold(page,card,page.locator('[data-support-side="w"]'))
 await settled(page)
 await installHeldHandCard(page)
 const support=page.locator(`[data-support-side="w"] [data-card-id="${banner.id}"]`),from=await center(support),to=await squareCenter(page,'e2'),before=await game(page)
 await page.mouse.move(from.x,from.y);await page.mouse.down();await page.waitForTimeout(200);await page.mouse.move(to.x,to.y,{steps:12})
 const still=await center(support);expect(Math.abs(still.x-from.x)).toBeLessThan(2);expect(Math.abs(still.y-from.y)).toBeLessThan(2);await expect(page.locator('.cm-card-mist')).toBeVisible();expect(await page.locator('canvas.cm-card-mist').evaluate(node=>{const canvas=node as HTMLCanvasElement;return canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data.some((value,index)=>index%4===3&&value>0)})).toBe(true);await expect(page.locator('.cm-card-ghost')).toHaveCount(0);await page.mouse.up()
 await expect(page.locator('#cm-drop-choice')).toBeHidden();await expect(page.locator('#cm-preview')).toBeHidden();await settled(page)
 const after=await game(page)
 expect(after.log).toHaveLength(before.log.length+1)
 expect(after.log.at(-1)).toMatchObject({type:'burn',cardId:banner.id})
 expect(after.units.find((unit:any)=>unit.side==='w'&&unit.square==='e2').statuses.some((status:any)=>status.kind==='inspired')).toBe(true)
})

test('a hovered enlarged actual card remains draggable to its shrine',async({page})=>{
 await boot(page)
 const hand=page.locator('#cm-hand [data-card-id]').last(),id=await hand.getAttribute('data-card-id'),point=await center(hand)
 await page.mouse.move(point.x,point.y)
 await expect(page.locator('#cm-card-view [data-card-id]')).toHaveAttribute('data-card-id',id!)
 const lifted=page.locator('#cm-card-view [data-card-id]')
 await dragAfterHold(page,lifted,page.locator('[data-support-side="w"]'))
 await settled(page)
 expect((await game(page)).log.at(-1)).toMatchObject({type:'install',cardId:id})
})

test('a touch hold drags the exposed card, while an invalid shrine drop changes nothing',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'})
 const page=await context.newPage()
 await boot(page)
 const source=page.locator('#cm-hand [data-card-id]').last(),before=await game(page),from=await center(source),wrong=await center(page.locator('[data-support-side="b"]'))
 const cdp=await context.newCDPSession(page)
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]})
 await page.waitForTimeout(300)
 for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(wrong.x-from.x)*step/8,y:from.y+(wrong.y-from.y)*step/8}]})
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
 await expect(page.locator('.cm-card-ghost')).toHaveCount(0)
 const unchanged=await game(page)
 expect(unchanged.log).toHaveLength(before.log.length)
 expect(unchanged.turn).toBe(before.turn)
 expect(unchanged.players.w.hand).toHaveLength(before.players.w.hand.length)

 const target=await center(page.locator('[data-support-side="w"]'))
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]})
 await page.waitForTimeout(300)
 for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(target.x-from.x)*step/8,y:from.y+(target.y-from.y)*step/8}]})
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
 await settled(page)
 const installed=await game(page)
 expect(installed.log).toHaveLength(before.log.length+1)
 expect(installed.log.at(-1)).toMatchObject({type:'install',player:'w'})
 await context.close()
})

test('a phone tap prepares an order without focus opening a reader over the animal',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();await boot(page)
 for(let i=0;i<2;i++){await page.locator('#cm-hand [data-card-id]').first().press(' ');await page.locator('#cm-confirm').click();await settled(page)}
 const before=await game(page),card=page.locator('[data-support-side=w] [data-card-id]').first();await card.tap();await expect(card).toHaveClass(/cm-order-armed/);await expect(page.locator('#cm-card-reader')).toBeHidden();expect((await game(page)).log).toHaveLength(before.log.length)
 await page.locator('[data-square=e2]').tap();await expect(page.locator('[data-square=e2]')).toHaveClass(/cm-order-source/);await expect(page.locator('#cm-card-reader')).toBeHidden();await context.close()
})
