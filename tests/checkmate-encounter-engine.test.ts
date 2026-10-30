import { describe, expect, it } from 'vitest'
import { canonicalSignature, createGame, legalActions, applyAction } from '../src/checkmate/engine'
import { chooseEncounterAction, encounterReserveIds } from '../src/checkmate/encounters'
import { restoreGame, serializeGame } from '../src/checkmate/persistence'

describe('encounter engine integration', () => {
  it('normalizes an encounter to its curated capture battle and rejects incompatible options', () => {
    for (const encounterId of ['blockade','rescue','crossing'] as const) {
      const state = createGame({ seed:7, encounterId })
      expect(state.options).toMatchObject({ encounterId, combatRules:'capture' })
      expect(state).toMatchObject({ phase:'battle', initiative:'w', turn:'w' })
      expect(state.players.w.ownTurn).toBe(1)
      expect(state.players.b.ownTurn).toBe(0)
      expect(state.units.filter(unit => unit.hp > 0 && unit.square === null).map(unit => unit.id)).toEqual([...encounterReserveIds(encounterId)])
    }
    expect(() => createGame({ encounterId:'blockade', combatRules:'hp' })).toThrow('Encounters require capture rules')
    expect(() => createGame({ encounterId:'invalid' as never })).toThrow('Invalid encounter')
  })

  it('distinguishes encounter objectives in repetition state and round-trips an encounter replay', () => {
    const ordinary = createGame({ seed:7, combatRules:'capture', armyMode:'reinforcement' })
    const encounter = createGame({ seed:7, encounterId:'blockade' })
    expect(canonicalSignature(encounter)).not.toBe(canonicalSignature(ordinary))
    const saved = JSON.parse(serializeGame(encounter)) as Record<string, unknown>
    expect(saved).toMatchObject({ ruleset:'project-checkmate-0.5', encounterId:'blockade', combatRules:'capture' })
    expect(restoreGame(JSON.stringify(saved))).toEqual(encounter)
    const action = legalActions(encounter)[0]!
    const replay = applyAction(encounter, action)
    expect(restoreGame(serializeGame(replay))).toEqual(replay)
  })

  it('keeps ordinary games on the v0.4 persistence format', () => {
    expect(JSON.parse(serializeGame(createGame({ seed:7 })))).toMatchObject({ ruleset:'project-checkmate-0.4' })
  })

  it('replays the authored Blockade and Rescue solutions, while the wrong Piercing target fails', () => {
    let blockade=createGame({encounterId:'blockade'}),actions=legalActions(blockade)
    const pierce=actions.find(action=>action.type==='burn'&&action.targetUnitId==='w-unit-2')!
    blockade=applyAction(blockade,pierce);blockade=applyAction(blockade,chooseEncounterAction(blockade,legalActions(blockade))!)
    blockade=applyAction(blockade,legalActions(blockade).find(action=>action.type==='install'&&action.unitId==='w-unit-2'&&action.kind==='attack'&&action.to==='a5')!)
    expect(blockade).toMatchObject({phase:'finished',winner:'w',finishReason:'Blockade cleared'});expect(blockade.encounterProgress).toEqual({whiteActions:2,enemyReplies:1})
    let wrong=createGame({encounterId:'blockade'}),wrongActions=legalActions(wrong)
    wrong=applyAction(wrong,wrongActions.find(action=>action.type==='burn'&&action.targetUnitId==='w-unit-0')!);wrong=applyAction(wrong,chooseEncounterAction(wrong,legalActions(wrong))!)
    wrong=applyAction(wrong,legalActions(wrong).find(action=>action.type==='install'&&action.unitId==='w-unit-2'&&action.kind==='attack'&&action.to==='a5')!)
    expect(wrong).toMatchObject({phase:'finished',winner:'b',finishReason:'Out of actions'})
    let rescue=createGame({encounterId:'rescue'});expect(legalActions(rescue).some(action=>(action.type==='order'||action.type==='install')&&action.unitId==='w-unit-0'&&action.to==='c3')).toBe(false)
    rescue=applyAction(rescue,legalActions(rescue).find(action=>action.type==='burn'&&action.targetUnitId==='w-unit-0')!);rescue=applyAction(rescue,chooseEncounterAction(rescue,legalActions(rescue))!)
    rescue=applyAction(rescue,legalActions(rescue).find(action=>action.type==='install'&&action.unitId==='w-unit-0'&&action.kind==='move'&&action.to==='c3')!)
    expect(rescue).toMatchObject({phase:'finished',winner:'w',finishReason:'King rescued'})
  })

  it('requires exactly three Crossing replies and loses immediately when the king is captured first', () => {
    let crossing=createGame({encounterId:'crossing'})
    crossing=applyAction(crossing,legalActions(crossing).find(action=>action.type==='deploy'&&action.unitId==='w-unit-8'&&action.to==='d2')!);crossing=applyAction(crossing,chooseEncounterAction(crossing,legalActions(crossing))!)
    for(const cardId of ['w-enc-support-0','w-enc-support-1']) { crossing=applyAction(crossing,legalActions(crossing).find(action=>action.type==='burn'&&action.cardId===cardId&&action.targetUnitId==='w-unit-0')!);crossing=applyAction(crossing,chooseEncounterAction(crossing,legalActions(crossing))!) }
    expect(crossing).toMatchObject({phase:'finished',winner:'w',finishReason:'Crossing held'});expect(crossing.encounterProgress).toEqual({whiteActions:3,enemyReplies:3})
    let loss=createGame({encounterId:'crossing'});loss.players.w.support=[]
    loss=applyAction(loss,legalActions(loss).find(action=>action.type==='deploy'&&action.unitId==='w-unit-8'&&action.to==='a2')!);loss=applyAction(loss,chooseEncounterAction(loss,legalActions(loss))!)
    expect(loss).toMatchObject({phase:'finished',winner:'b',finishReason:'king defeated'});expect(loss.encounterProgress!.enemyReplies).toBeLessThan(3)
  })

  it('branches from a replayable, unchanged initial encounter state', () => {
    const initial=createGame({encounterId:'rescue'}),before=serializeGame(initial),action=legalActions(initial).find(action=>action.type==='burn')!
    const branch=applyAction(initial,action)
    expect(restoreGame(before)).toEqual(initial)
    expect(restoreGame(serializeGame(branch))).toEqual(branch)
  })
})
