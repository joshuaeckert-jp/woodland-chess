import { describe, expect, it } from 'vitest'
import { chooseAiAction, fallbackAiAction } from '../src/checkmate/ai'
import { createGame, legalActions, simulateLegalAction } from '../src/checkmate/engine'
import type { GameState } from '../src/checkmate/types'

function fireState(): GameState {
  const state = createGame({ seed: 1, armyMode: 'reinforcement', combatRules: 'capture' })
  for (const unit of state.units) if (unit.role !== 'k') unit.square = null
  const whiteKing = state.units.find(unit => unit.side === 'w' && unit.role === 'k')!
  const blackKing = state.units.find(unit => unit.side === 'b' && unit.role === 'k')!
  const hare = state.units.find(unit => unit.side === 'w' && unit.role === 'n')!
  whiteKing.square = 'a1'; blackKing.square = 'd5'; hare.square = 'd3'
  state.obstacles = { d3: { kind: 'tower', square: 'd3' } }
  state.turn = 'w'; state.players.w.ownTurn = 1
  state.players.w.hand = []; state.players.w.support = [{ id: 'tower-order', definitionId: 'banner', installedAt: 0, usableOn: 1, readyOn: 1 }]
  return state
}

describe('tower fire opponent AI', () => {
  it('recognizes tower fire as a stationary capture and immediate king win', () => {
    const state = fireState(), hare = state.units.find(unit => unit.side === 'w' && unit.role === 'n')!
    const fire = { type: 'fire' as const, player: 'w' as const, cardId: 'tower-order', unitId: hare.id, to: 'd5' as const }
    expect(legalActions(state)).toContainEqual(fire)
    expect(fallbackAiAction(state)).toEqual(fire)
    const choice = chooseAiAction(state, 'hard')
    expect(choice.action).toEqual(fire)
    const next = simulateLegalAction(state, choice.action)
    expect(next.winner).toBe('w')
    expect(next.units.find(unit => unit.id === hare.id)?.square).toBe('d3')
  })
})
