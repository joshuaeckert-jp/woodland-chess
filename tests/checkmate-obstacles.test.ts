import { describe, expect, it } from 'vitest'
import { applyAction, createGame, legalActions, obstacleAt } from '../src/checkmate/engine'
import { restoreGame, serializeGame } from '../src/checkmate/persistence'
import { chooseEncounterAction } from '../src/checkmate/encounters'

describe('Watchtower obstacles',()=>{
  it('keeps walls impassable, lets knights jump them, and lets units enter towers while towers block rays',()=>{
    const state=createGame({encounterId:'tower'}), knight=state.units.find(unit=>unit.id==='w-unit-6')!
    state.units.find(u=>u.id==='w-unit-8')!.hasMoved=false
    expect(legalActions(state).some(a=>(a.type==='order'||a.type==='install')&&a.unitId==='w-unit-8'&&a.to==='d4')).toBe(false)
    const opened=structuredClone(state);delete opened.obstacles!.d3
    expect(legalActions(opened).some(a=>a.type==='order'&&a.unitId==='w-unit-8'&&a.to==='d4')).toBe(true)
    expect(obstacleAt(state,'c2')).toMatchObject({kind:'wall'});expect(legalActions(state).some(action=>action.type==='order'&&action.unitId===knight.id&&action.kind==='move'&&action.to==='d3')).toBe(true)
    expect(legalActions(state).some(action=>action.type==='order'&&action.unitId==='w-unit-2'&&action.kind==='attack'&&action.to==='d5')).toBe(false)
  })

  it('fires once from a tower, remains stationary, consumes Guard/Piercing correctly, roots the shooter, and exhausts the card',()=>{
    let state=createGame({encounterId:'tower'}), jump=legalActions(state).find(action=>action.type==='order'&&action.unitId==='w-unit-6'&&action.kind==='move'&&action.to==='d3')!
    state=applyAction(state,jump);state.turn='w';state.players.w.ownTurn=2
    const target=state.units.find(unit=>unit.id==='b-unit-2')!;target.statuses=[{kind:'guarded',amount:1}]
    const fire=legalActions(state).find(action=>action.type==='fire'&&action.unitId==='w-unit-6'&&action.to==='d5')!, shooter=state.units.find(unit=>unit.id==='w-unit-6')!
    const next=applyAction(state,fire);expect(next.units.find(unit=>unit.id===shooter.id)!.square).toBe('d3');expect(next.units.find(unit=>unit.id===target.id)!.hp).toBe(1);expect(next.obstacles!.d3!.spent).toBe(true);expect(next.units.find(unit=>unit.id===shooter.id)!.statuses.some(status=>status.kind==='rooted')).toBe(true);expect(next.lastEvents.find(event=>event.type==='attack')!.lethal).toBe(false);expect(legalActions(next).some(action=>action.type==='fire')).toBe(false)
  })

  it('allows Trailbreaker only for an unoccupied pawn-forward obstacle and preserves tower replay metadata',()=>{
    const state=createGame({encounterId:'tower'}), clear=legalActions(state).find(action=>action.type==='burn'&&action.targetUnitId==='w-unit-8'&&action.targetSquare==='d3')!
    expect(clear).toBeDefined()
    const cleared=applyAction(state,clear);expect(cleared.obstacles!.d3).toBeUndefined()
    const occupied=createGame({encounterId:'tower'});occupied.units.find(unit=>unit.id==='w-unit-6')!.square='d3';expect(legalActions(occupied).some(action=>action.type==='burn'&&action.targetUnitId==='w-unit-8')).toBe(false)
    const saved=JSON.parse(serializeGame(state)) as Record<string,unknown>;expect(saved).toMatchObject({ruleset:'project-checkmate-0.6',encounterId:'tower'});expect(restoreGame(JSON.stringify(saved))).toEqual(state)
  })

  it('replays both authored four-action tower solutions with only legal opponent replies',()=>{
    const reply=(state:ReturnType<typeof createGame>)=>applyAction(state,chooseEncounterAction(state,legalActions(state))!)
    let fire=createGame({encounterId:'tower'})
    fire=applyAction(fire,legalActions(fire).find(action=>action.type==='order'&&action.cardId==='w-enc-support-1'&&action.unitId==='w-unit-6'&&action.kind==='move'&&action.to==='d3')!);fire=reply(fire)
    fire=applyAction(fire,legalActions(fire).find(action=>action.type==='fire'&&action.cardId==='w-enc-support-2'&&action.unitId==='w-unit-6'&&action.to==='d5')!);expect(restoreGame(serializeGame(fire))).toEqual(fire);fire=reply(fire)
    expect(legalActions(fire).some(action=>(action.type==='order'||action.type==='install')&&action.unitId==='w-unit-6')).toBe(false)
    fire=applyAction(fire,legalActions(fire).find(action=>action.type==='order'&&action.cardId==='w-enc-support-1'&&action.unitId==='w-unit-2'&&action.kind==='move')!);fire=reply(fire)
    fire=applyAction(fire,legalActions(fire).find(action=>action.type==='order'&&action.cardId==='w-enc-support-2'&&action.unitId==='w-unit-6'&&action.kind==='move'&&action.to==='e5')!)
    expect(fire).toMatchObject({phase:'finished',winner:'w',finishReason:'Watchtower mastered'})
    let clear=createGame({encounterId:'tower'})
    clear=applyAction(clear,legalActions(clear).find(action=>action.type==='burn'&&action.cardId==='w-enc-support-0'&&action.targetUnitId==='w-unit-8'&&action.targetSquare==='d3')!);clear=reply(clear);expect(restoreGame(serializeGame(clear))).toEqual(clear)
    clear=applyAction(clear,legalActions(clear).find(action=>action.type==='order'&&action.cardId==='w-enc-support-2'&&action.unitId==='w-unit-8'&&action.kind==='attack'&&action.to==='e3')!);clear=reply(clear)
    clear=applyAction(clear,legalActions(clear).find(action=>action.type==='order'&&action.cardId==='w-enc-support-1'&&action.unitId==='w-unit-2'&&action.kind==='attack'&&action.to==='d5')!);clear=reply(clear)
    clear=applyAction(clear,legalActions(clear).find(action=>action.type==='order'&&action.cardId==='w-enc-support-2'&&action.unitId==='w-unit-2'&&action.kind==='move'&&action.to==='e5')!)
    expect(clear).toMatchObject({phase:'finished',winner:'w',finishReason:'Watchtower mastered'})
  })

  it('blocks fire line of sight through units, walls, towers and smoke, and rejects malformed fire or clear payloads immutably',()=>{
    const state=createGame({encounterId:'tower'}), before=JSON.stringify(state)
    expect(()=>applyAction(state,{type:'fire',player:'w',cardId:'w-enc-support-1',unitId:'w-unit-6'} as never)).toThrow('Invalid action')
    expect(()=>applyAction(state,{type:'burn',player:'w',cardId:'w-enc-support-0',targetUnitId:'w-unit-8'} as never)).toThrow('Illegal action')
    expect(JSON.stringify(state)).toBe(before)
    const blocked=createGame({encounterId:'tower'});blocked.units.find(unit=>unit.id==='w-unit-6')!.square='d3';blocked.units.find(unit=>unit.id==='w-unit-8')!.square='d4';expect(legalActions(blocked).some(action=>action.type==='fire'&&action.to==='d5')).toBe(false)
    blocked.units.find(unit=>unit.id==='w-unit-8')!.square=null;blocked.obstacles!.d4={kind:'wall',square:'d4'};expect(legalActions(blocked).some(action=>action.type==='fire'&&action.to==='d5')).toBe(false)
    blocked.obstacles!.d4={kind:'tower',square:'d4'};expect(legalActions(blocked).some(action=>action.type==='fire'&&action.to==='d5')).toBe(false)
    delete blocked.obstacles!.d4;blocked.terrain.d5={id:'smoke',kind:'smoke',square:'d5',side:'b',expiresOnOwnStart:9};expect(legalActions(blocked).some(action=>action.type==='fire'&&action.to==='d5')).toBe(false)
  })

  it('allows Piercing fire through Guard, prevents later fire from a spent tower, and rejects promoted-pawn clearing',()=>{
    let state=createGame({encounterId:'tower'});state.units.find(unit=>unit.id==='w-unit-6')!.square='d3';const target=state.units.find(unit=>unit.id==='b-unit-2')!;target.statuses=[{kind:'guarded',amount:1}];state.units.find(unit=>unit.id==='w-unit-6')!.statuses=[{kind:'inspired',amount:1}]
    const fire=legalActions(state).find(action=>action.type==='fire'&&action.to==='d5')!, next=applyAction(state,fire)
    expect(next.units.find(unit=>unit.id==='b-unit-2')!.hp).toBe(0);expect(legalActions(next).some(action=>action.type==='fire')).toBe(false)
    const promoted=createGame({encounterId:'tower'}), pawn=promoted.units.find(unit=>unit.id==='w-unit-8')!;pawn.role='q';pawn.veteran=true
    expect(legalActions(promoted).some(action=>action.type==='burn'&&action.cardId==='w-enc-support-0')).toBe(false)
  })
})
