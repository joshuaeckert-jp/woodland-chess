import { describe, expect, it } from 'vitest'
import { applyAction, autoDeployRemaining, createGame, legalActions, previewAction } from '../src/checkmate/engine'
import { restoreGame, serializeGame } from '../src/checkmate/persistence'
import type { Action, GameState, Role, Square, Unit } from '../src/checkmate/types'

const battle = (role:Role='q', from:Square='d4', target:Square='d6') => {
  const state=createGame({seed:1,armyMode:'reinforcement',combatRules:'capture'})
  for(const unit of state.units)unit.square=null
  const white=state.units.find(unit=>unit.side==='w'&&unit.role===role)!,black=state.units.find(unit=>unit.side==='b'&&unit.role==='p')!
  white.square=from;black.square=target;state.turn='w';state.players.w.ownTurn=1
  return {state,white,black}
}
const atomic=(state:GameState,id:string,kind:'move'|'attack',to:Square)=>legalActions(state).find(action=>action.type==='install'&&action.unitId===id&&action.kind===kind&&action.to===to)!

describe('capture rules',()=>{
  it('uses full melee chess capture geometry for every role, independent of original ranged variants',()=>{
    const cases:Array<[Role,Square,Square]>=[['k','d4','e5'],['q','d4','d7'],['r','d4','d7'],['b','d4','f6'],['n','d4','f5'],['p','d4','e5']]
    for(const [role,from,target] of cases){const {state,white}=battle(role,from,target);expect(atomic(state,white.id,'attack',target)).toBeDefined();expect(white.combat).toBe('melee')}
  })

  it('blocks sliding capture rays at smoke endpoints and through smoke, but not knight captures, while smoke remains movable',()=>{
    const endpoint=battle('r');endpoint.state.terrain.d6={id:'s',kind:'smoke',square:'d6',side:'b',expiresOnOwnStart:9};expect(atomic(endpoint.state,endpoint.white.id,'attack','d6')).toBeUndefined()
    const ray=battle('r');ray.state.terrain.d5={id:'s',kind:'smoke',square:'d5',side:'b',expiresOnOwnStart:9};expect(atomic(ray.state,ray.white.id,'attack','d6')).toBeUndefined();expect(atomic(ray.state,ray.white.id,'move','d5')).toBeDefined()
    const knight=battle('n','d4','f5');knight.state.terrain.f5={id:'s',kind:'smoke',square:'f5',side:'b',expiresOnOwnStart:9};expect(atomic(knight.state,knight.white.id,'attack','f5')).toBeDefined()
  })

  it('uses one atomic install action, advances one ply and exhausts the new support',()=>{
    const {state,white,black}=battle(),next=applyAction(state,atomic(state,white.id,'attack','d6'))
    expect(next.ply).toBe(state.ply+1);expect(next.turn).toBe('b');expect(next.units.find(unit=>unit.id===black.id)!.hp).toBe(0);expect(next.units.find(unit=>unit.id===white.id)!.square).toBe('d6');expect(next.players.w.support[0]!.readyOn).toBeGreaterThan(next.players.w.ownTurn)
  })

  it('previews the attacker endpoint for an atomic capture install',()=>{
    const {state,white}=battle()
    expect(previewAction(state,atomic(state,white.id,'attack','d6')).attackerEnd).toBe('d6')
  })

  it('consumes permanent Guard, while Piercing captures through it and is consumed',()=>{
    const guarded=battle();guarded.black.statuses.push({kind:'guarded',amount:1});const blocked=applyAction(guarded.state,atomic(guarded.state,guarded.white.id,'attack','d6'));expect(blocked.units.find(unit=>unit.id===guarded.black.id)!.hp).toBe(1);expect(blocked.units.find(unit=>unit.id===guarded.black.id)!.statuses).toEqual([]);expect(blocked.lastEvents.find(event=>event.type==='attack')!.lethal).toBe(false)
    const persistent=battle();persistent.black.statuses.push({kind:'guarded',amount:1});const afterWhite=applyAction(persistent.state,atomic(persistent.state,persistent.white.id,'move','d5'));const afterBlack=applyAction(afterWhite,legalActions(afterWhite).find(action=>action.type==='rest')!);expect(afterBlack.units.find(unit=>unit.id===persistent.black.id)!.statuses).toEqual([{kind:'guarded',amount:1}])
    const expiring=battle();expiring.white.statuses.push({kind:'inspired',amount:1,expiresAtOwnEnd:2});const afterFirst=applyAction(expiring.state,atomic(expiring.state,expiring.white.id,'move','d5'));const backToWhite=applyAction(afterFirst,legalActions(afterFirst).find(action=>action.type==='rest')!);const expired=applyAction(backToWhite,atomic(backToWhite,expiring.white.id,'move','c5'));expect(expired.units.find(unit=>unit.id===expiring.white.id)!.statuses).toEqual([])
    const pierced=battle();pierced.black.statuses.push({kind:'guarded',amount:1});pierced.white.statuses.push({kind:'inspired',amount:1,expiresAtOwnEnd:2});const next=applyAction(pierced.state,atomic(pierced.state,pierced.white.id,'attack','d6'));expect(next.units.find(unit=>unit.id===pierced.black.id)!.hp).toBe(0);expect(next.units.find(unit=>unit.id===pierced.white.id)!.statuses).toEqual([]);expect(next.lastEvents.find(event=>event.type==='attack')!.lethal).toBe(true)
  })

  it('roots movement and capture until own end, cleanses rooted targets, and consumes a snare once',()=>{
    const rooted=battle();rooted.state.players.w.support=[{id:'bind',definitionId:'vines',installedAt:0,usableOn:1,readyOn:1}];const bind=legalActions(rooted.state).find(action=>action.type==='burn'&&action.cardId==='bind'&&action.targetUnitId===rooted.black.id)!;const afterBind=applyAction(rooted.state,bind);expect(legalActions(afterBind)).toEqual([{type:'rest',player:'b'}]);const afterEnd=applyAction(afterBind,{type:'rest',player:'b'});expect(afterEnd.units.find(unit=>unit.id===rooted.black.id)!.statuses).toEqual([])
    const cleanse=battle();cleanse.white.statuses.push({kind:'rooted',amount:1,expiresAtOwnEnd:2});cleanse.state.players.w.support=[{id:'herbs',definitionId:'herbs',installedAt:0,usableOn:1,readyOn:1}];const herbs=legalActions(cleanse.state).find(action=>action.type==='burn'&&action.cardId==='herbs'&&action.targetUnitId===cleanse.white.id)!;expect(applyAction(cleanse.state,herbs).units.find(unit=>unit.id===cleanse.white.id)!.statuses).toEqual([])
    const snared=battle();snared.state.items.d5={id:'snare',kind:'snare',square:'d5',side:'b'};const triggered=applyAction(snared.state,atomic(snared.state,snared.white.id,'move','d5'));expect(triggered.items.d5).toBeUndefined();expect(triggered.units.find(unit=>unit.id===snared.white.id)!.statuses.some(status=>status.kind==='rooted')).toBe(true)
  })

  it('promotes a last-rank pawn into the fox queen without a roster queen limit',()=>{
    const {state,white}=battle('p','d7','a1');state.noProgress=99;const promoted=applyAction(state,atomic(state,white.id,'move','d8')),pawn=promoted.units.find(unit=>unit.id===white.id)!
    expect(pawn).toMatchObject({role:'q',definitionId:'fox-duelist',combat:'melee',range:7,hp:1,maxHp:1,atk:0,def:0});expect(promoted.noProgress).toBe(0)
    const ordered=battle('p','d7','a1');ordered.state.noProgress=99;ordered.state.players.w.support=[{id:'order',definitionId:'banner',installedAt:0,usableOn:1,readyOn:1}];const normal=legalActions(ordered.state).find(action=>action.type==='order'&&action.unitId===ordered.white.id&&action.kind==='move'&&action.to==='d8')!;expect(applyAction(ordered.state,normal).noProgress).toBe(0)
  })

  it('rejects partial, spoofed-target, and extra-field install payloads',()=>{
    const {state,white}=battle(),legal=atomic(state,white.id,'attack','d6')
    expect(()=>applyAction(state,{type:'install',player:'w',cardId:state.players.w.hand[0]!.id,unitId:white.id} as unknown as Action)).toThrow('Invalid action');expect(()=>applyAction(state,{...legal,to:'h8'} as Action)).toThrow('Illegal action');expect(()=>applyAction(state,{...legal,altar:true} as unknown as Action)).toThrow('Invalid action')
  })

  it('does not reset no-progress for capture installs or burns, and serializes a legal capture replay',()=>{
    const installed=battle();installed.state.noProgress=7;expect(applyAction(installed.state,atomic(installed.state,installed.white.id,'move','d5')).noProgress).toBe(8)
    const burned=battle();burned.state.noProgress=7;burned.state.players.w.support=[{id:'ward',definitionId:'brace',installedAt:0,usableOn:1,readyOn:1}];const burn=legalActions(burned.state).find(action=>action.type==='burn'&&action.cardId==='ward'&&action.targetUnitId===burned.white.id)!;expect(applyAction(burned.state,burn).noProgress).toBe(8)
    let replay=autoDeployRemaining(createGame({seed:1,combatRules:'capture'}));replay=applyAction(replay,legalActions(replay).find(action=>action.type==='install'&&action.kind==='move')!);expect(restoreGame(serializeGame(replay))).toEqual(replay)
  })

  it('does not let capture-mode draws or reserve recovery reset the no-progress clock',()=>{
    const drawing=battle();drawing.state.noProgress=99;drawing.state.players.b.ownTurn=2;drawing.state.players.b.deck=[{id:'draw',definitionId:'banner'}];const afterDraw=applyAction(drawing.state,atomic(drawing.state,drawing.white.id,'move','d5'));expect(afterDraw.phase).toBe('finished');expect(afterDraw.finishReason).toBe('no progress')
    const recovering=battle();recovering.state.noProgress=99;recovering.state.players.w.hand=[];recovering.state.players.w.deck=[];const recover=legalActions(recovering.state).find(action=>action.type==='recover')!;const afterRecover=applyAction(recovering.state,recover);expect(afterRecover.phase).toBe('finished');expect(afterRecover.finishReason).toBe('no progress')
  })
})
