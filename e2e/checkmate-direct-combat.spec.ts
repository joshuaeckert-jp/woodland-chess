import { expect, test, type Page } from '@playwright/test'

const state=(page:Page)=>page.evaluate(()=>(window as any).checkmate.state)
const settled=(page:Page)=>expect.poll(()=>page.evaluate(()=>(window as any).checkmate.busy),{timeout:5000}).toBe(false)
const CARD_NAME={banner:'Rallying Banner',brace:'Iron Shield'} as const

async function boot(page:Page,reduced=true){
 await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'})
 await page.goto('/?mode=checkmate&new=1')
 await page.locator('#cm-board').waitFor()
 await page.locator('#cm-loading').waitFor({state:'hidden'})
 await page.selectOption('#cm-match-kind','skirmish')
 await page.selectOption('#cm-play-mode','local')
 await page.selectOption('#cm-hand-mode','selected')
 while(await page.locator('input[name="opening-card"]:checked').count())await page.locator('input[name="opening-card"]:checked').first().uncheck()
 for(const id of ['banner','brace','smoke','field-dressing','aimed-shot'])await page.locator(`input[name="opening-card"][value="${id}"]`).check()
 await page.locator('#cm-seed').fill('1')
 await page.locator('#cm-start-deployment').click()
}

/** Build the position entirely through engine-generated legal deployment actions. */
async function deployCombatFixture(page:Page,whiteTurtle:'turtle-siege'|'turtle-guardian'){
 await page.evaluate(async({whiteTurtle})=>{
  const {legalActions}=await import('/src/checkmate/engine.ts')
  const api=(window as any).checkmate
  api.reset(api.state.options)
  const reserved=new Set(['a2','a3','a4','a5','a6'])
  const choose=(game:any)=>{
   const actions=legalActions(game) as any[]
   const side=game.turn
   const alive=(definitionId:string)=>game.units.find((unit:any)=>unit.side===side&&unit.definitionId===definitionId&&!unit.square)
   const king=alive('lion-regent')
   if(king)return actions.find(action=>action.type==='deploy'&&action.unitId===king.id&&action.to===(side==='w'?'e1':'e8'))
   const featuredSquare=side==='w'?'a2':'a6'
   const featured=alive(side==='w'?whiteTurtle:'rat-scout')
   if(featured&&!game.units.some((unit:any)=>unit.side===side&&unit.square===featuredSquare)){
    const featuredAction=actions.find(action=>action.type==='deploy'&&action.unitId===featured.id&&action.to===featuredSquare)
    if(featuredAction)return featuredAction
   }
   return actions.find(action=>action.type==='deploy'&&!reserved.has(action.to))
  }
  while(api.state.phase==='deployment'){
   const action=choose(api.state)
   if(!action)throw new Error(`No legal fixture deployment for ${api.state.turn}`)
   api.dispatch(action)
  }
 },{whiteTurtle})
 const game=await state(page)
 expect(game.phase).toBe('battle')
 expect(game.units.find((unit:any)=>unit.definitionId===whiteTurtle&&unit.side==='w').square).toBe('a2')
 expect(game.units.find((unit:any)=>unit.definitionId==='rat-scout'&&unit.side==='b').square).toBe('a6')
}

async function installForCurrentPlayer(page:Page){
 const card=page.locator('#cm-hand [data-card-id]').first()
 await card.press(' ')
 await expect(page.locator('#cm-preview')).toBeVisible()
 await page.locator('#cm-confirm').click()
 await settled(page)
}

async function installDefinition(page:Page,side:'w'|'b',definitionId:string){
 void side
 const name=CARD_NAME[definitionId as keyof typeof CARD_NAME]
 const card=page.locator('#cm-hand [data-card-id]').filter({hasText:name}).first()
 await expect(card).toBeVisible()
 await card.press(' ')
 await expect(page.locator('#cm-preview')).toBeVisible()
 await page.locator('#cm-confirm').click()
 await settled(page)
}

async function orderWhiteTurtle(page:Page){
 const support=page.locator('[data-support-side="w"] [data-card-id]').first()
 await support.press(' ')
 await page.locator('[data-square="a2"]').click()
 await expect(page.locator('[data-square="a2"]')).toHaveClass(/cm-order-source/)
}

async function orderWhiteSupport(page:Page,definitionId:string,source:string){
 const name=CARD_NAME[definitionId as keyof typeof CARD_NAME]
 const card=page.locator('[data-support-side="w"] [data-card-id],#cm-card-view [data-card-id]').filter({hasText:name}).first()
 await expect(card).toBeVisible()
 await card.press(' ')
 await page.locator(`[data-square="${source}"]`).click()
 await expect(page.locator(`[data-square="${source}"]`)).toHaveClass(/cm-order-source/)
}

async function dragHabitat(page:Page,from:string,to:string){
 const source=await page.locator(`[data-square="${from}"]`).boundingBox()
 const target=await page.locator(`[data-square="${to}"]`).boundingBox()
 if(!source||!target)throw new Error('Expected projected source and target squares')
 await page.mouse.move(source.x+source.width/2,source.y+source.height/2)
 await page.mouse.down()
 await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:12})
 await expect(page.locator('.cm-habitat-drag-hint')).toBeVisible()
 await page.mouse.up()
}

async function readyWhiteOrder(page:Page,whiteTurtle:'turtle-siege'|'turtle-guardian'){
 await deployCombatFixture(page,whiteTurtle)
 await installDefinition(page,'w','banner') // White: support becomes ready on own turn 2.
 await installDefinition(page,'b','banner') // Black: return the turn to White.
 await orderWhiteTurtle(page)
}

test('a ranged turtle direct-attacks from its habitat without a confirmation step',async({page})=>{
 await boot(page,true)
 await readyWhiteOrder(page,'turtle-siege')
 const before=await state(page)
 await dragHabitat(page,'a2','a6')
 await expect(page.locator('#cm-preview')).toBeHidden()
 await expect(page.locator('#cm-confirm')).toBeHidden()
 await settled(page)
 const game=await state(page)
 expect(game.log).toHaveLength(before.log.length+1)
 expect(game.log.at(-1)).toMatchObject({type:'order',kind:'attack',to:'a6'})
 expect(game.units.find((unit:any)=>unit.definitionId==='turtle-siege'&&unit.side==='w').square).toBe('a2')
 expect(game.units.find((unit:any)=>unit.definitionId==='rat-scout'&&unit.side==='b').hp).toBe(2)
 await expect(page.locator('[data-support-side="w"] .tcg-exhausted')).toHaveCount(1)
})

test('a nonlethal melee turtle direct-attacks then legally stops before its defender',async({page})=>{
 await boot(page,true)
 await readyWhiteOrder(page,'turtle-guardian')
 const before=await state(page)
 await dragHabitat(page,'a2','a6')
 await expect(page.locator('#cm-preview')).toBeHidden()
 await settled(page)
 const game=await state(page)
 expect(game.log).toHaveLength(before.log.length+1)
 expect(game.log.at(-1)).toMatchObject({type:'order',kind:'attack',to:'a6'})
 expect(game.units.find((unit:any)=>unit.definitionId==='turtle-guardian'&&unit.side==='w').square).toBe('a5')
 expect(game.units.find((unit:any)=>unit.definitionId==='rat-scout'&&unit.side==='b').square).toBe('a6')
 expect(game.units.find((unit:any)=>unit.definitionId==='rat-scout'&&unit.side==='b').hp).toBe(2)
})

test('the same ranged direct attack waits for the normal-motion encounter to settle',async({page})=>{
 await boot(page,false)
 await readyWhiteOrder(page,'turtle-siege')
 await dragHabitat(page,'a2','a6')
 await expect.poll(()=>page.evaluate(()=>(window as any).checkmate.busy),{timeout:1500}).toBe(true)
 await settled(page)
 const game=await state(page)
 expect(game.units.find((unit:any)=>unit.definitionId==='turtle-siege'&&unit.side==='w').square).toBe('a2')
 expect(game.units.find((unit:any)=>unit.definitionId==='rat-scout'&&unit.side==='b').hp).toBe(2)
})

test('a lethal follow-up captures onto the target habitat after card cooldown recovery',async({page})=>{
 await boot(page,true)
 await readyWhiteOrder(page,'turtle-guardian')
 await dragHabitat(page,'a2','a6')
 await settled(page)
 let game=await state(page)
 expect(game.units.find((unit:any)=>unit.definitionId==='turtle-guardian'&&unit.side==='w').square).toBe('a5')
 expect(game.units.find((unit:any)=>unit.definitionId==='rat-scout'&&unit.side==='b').hp).toBe(2)

 // Spend the intervening turns legally: banner refreshes by White own turn 3,
 // then remains ready through White own turn 4 while Brace is installed.
 await installForCurrentPlayer(page) // Black's second support card.
 await installDefinition(page,'w','brace')
 await installForCurrentPlayer(page) // Black's third support card.
 game=await state(page)
 expect(game.turn).toBe('w')
 expect(game.players.w.ownTurn).toBe(4)

 await page.emulateMedia({reducedMotion:'no-preference'})
 await orderWhiteSupport(page,'banner','a5')
 const before=await state(page)
 await dragHabitat(page,'a5','a6')
 await expect(page.locator('#cm-preview')).toBeHidden()
 await expect(page.locator('#cm-confirm')).toBeHidden()
 await settled(page)
 game=await state(page)
 expect(game.log).toHaveLength(before.log.length+1)
 expect(game.log.at(-1)).toMatchObject({type:'order',kind:'attack',to:'a6'})
 const rat=game.units.find((unit:any)=>unit.definitionId==='rat-scout'&&unit.side==='b')
 expect(rat.hp).toBe(0)
 expect(rat.square).toBeNull()
 expect(game.units.find((unit:any)=>unit.definitionId==='turtle-guardian'&&unit.side==='w').square).toBe('a6')
})
