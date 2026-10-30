import { describe, expect, it } from 'vitest'
import { applyAction, canonicalSignature, createGame, isCardReady, legalActions } from '../src/checkmate/engine'
import { chooseAiAction } from '../src/checkmate/ai'
import { restoreGame, serializeGame } from '../src/checkmate/persistence'

const reinforcement = () => createGame({ seed: 1, armyMode: 'reinforcement' })

describe('Reinforcement mode', () => {
  it('starts the battle with only the two kings and both tactical opening hands', () => {
    const state = reinforcement()
    expect(state.phase).toBe('battle')
    expect(state.players.w.ownTurn).toBe(1)
    expect(state.units.filter(unit => unit.square).map(unit => unit.square).sort()).toEqual(['e1', 'e8'])
    expect(state.units.filter(unit => !unit.square && unit.hp > 0)).toHaveLength(30)
    expect(state.players.w.hand).toHaveLength(5)
    expect(state.players.b.hand).toHaveLength(5)
  })

  it('allows only a living own reserve animal in its own deployment zone', () => {
    const state = reinforcement()
    const whitePawn = state.units.find(unit => unit.side === 'w' && unit.role === 'p')!
    const blackPawn = state.units.find(unit => unit.side === 'b' && unit.role === 'p')!
    expect(legalActions(state).some(action => action.type === 'deploy' && action.unitId === whitePawn.id && action.to === 'a3')).toBe(true)
    expect(legalActions(state).some(action => action.type === 'deploy' && action.unitId === whitePawn.id && action.to === 'a4')).toBe(false)
    expect(() => applyAction(state, { type: 'deploy', player: 'w', unitId: blackPawn.id, to: 'a6' })).toThrow('Illegal action')
    expect(() => applyAction(state, { type: 'deploy', player: 'w', unitId: whitePawn.id, to: 'e1' })).toThrow('Illegal action')
    whitePawn.hp = 0
    expect(legalActions(state).some(action => action.type === 'deploy' && action.unitId === whitePawn.id)).toBe(false)
  })

  it('makes reinforcement a full turn: the animal cannot move until a later card order', () => {
    const state = reinforcement()
    const pawn = state.units.find(unit => unit.side === 'w' && unit.role === 'p')!
    const deploy = legalActions(state).find(action => action.type === 'deploy' && action.unitId === pawn.id && action.to === 'a2')!
    const next = applyAction(state, deploy)
    expect(next.turn).toBe('b')
    expect(next.players.w.ownTurn).toBe(1)
    expect(next.units.find(unit => unit.id === pawn.id)!.square).toBe('a2')
    expect(legalActions(next).some(action => action.type === 'order' && action.unitId === pawn.id)).toBe(false)
  })

  it('shares normal cooldown and draw timing after a reinforcement action', () => {
    let state = reinforcement()
    const pawn = state.units.find(unit => unit.side === 'w' && unit.role === 'p')!
    state.players.w.hand = [{ id: 'banner-test', definitionId: 'banner' }]
    state.players.w.deck = [{ id: 'draw-test', definitionId: 'brace' }]
    state = applyAction(state, legalActions(state).find(action => action.type === 'deploy' && action.unitId === pawn.id && action.to === 'a2')!)
    state = applyAction(state, legalActions(state).find(action => action.type === 'deploy')!)
    state = applyAction(state, { type: 'install', player: 'w', cardId: 'banner-test' })
    state = applyAction(state, legalActions(state).find(action => action.type === 'deploy')!)
    expect(state.players.w.hand.map(card => card.id)).toContain('draw-test')
    const support = state.players.w.support[0]!
    expect(isCardReady(state, support.id)).toBe(true)
  })

  it('replays its army mode and gives the opponent a legal reinforcement action', () => {
    const state = reinforcement()
    const action = chooseAiAction(state, 'easy', { maxNodes: 1, deadlineMs: 1_000 }).action
    expect(legalActions(state)).toContainEqual(action)
    expect(action.type).toBe('deploy')
    const next = applyAction(state, action)
    const restored = restoreGame(serializeGame(next))
    expect(restored.options.armyMode).toBe('reinforcement')
    expect(canonicalSignature(restored)).toBe(canonicalSignature(next))
  })
})
