import { describe, expect, it } from 'vitest'
import { chooseAiAction, fallbackAiAction } from '../src/checkmate/ai'
import { applyAction, createGame, legalActions, simulateLegalAction } from '../src/checkmate/engine'
import type { GameState, Unit } from '../src/checkmate/types'

function captureState(): GameState {
  const state = createGame({ seed: 1, armyMode: 'reinforcement', combatRules: 'capture' })
  for (const unit of state.units) if (unit.role !== 'k') unit.square = null
  const whiteKing = state.units.find(unit => unit.side === 'w' && unit.role === 'k')!
  const blackKing = state.units.find(unit => unit.side === 'b' && unit.role === 'k')!
  const queen = state.units.find(unit => unit.side === 'w' && unit.role === 'q')!
  whiteKing.square = 'a1'; blackKing.square = 'd6'; queen.square = 'd4'
  state.turn = 'w'; state.players.w.ownTurn = 1
  return state
}
function king(state: GameState, side: 'w' | 'b') { return state.units.find(unit => unit.side === side && unit.role === 'k')! }
function queen(state: GameState) { return state.units.find(unit => unit.side === 'w' && unit.role === 'q')! }

describe('capture-rules opponent AI', () => {
  it('finds a forced king capture through the atomic install action', () => {
    const state = captureState(), choice = chooseAiAction(state, 'hard')
    expect(choice.action).toMatchObject({ type: 'install', player: 'w', unitId: queen(state).id, kind: 'attack', to: 'd6' })
    expect(legalActions(state)).toContainEqual(choice.action)
    expect(simulateLegalAction(state, choice.action).winner).toBe('w')
  })

  it('does not treat a guarded king as a win until its guard is pierced', () => {
    const guarded = captureState()
    king(guarded, 'b').statuses.push({ kind: 'guarded', amount: 1 })
    const guardedNext = simulateLegalAction(guarded, chooseAiAction(guarded, 'hard').action)
    expect(guardedNext.winner).not.toBe('w')
    const pierced = captureState()
    king(pierced, 'b').statuses.push({ kind: 'guarded', amount: 1 })
    queen(pierced).statuses.push({ kind: 'inspired', amount: 1 })
    const choice = chooseAiAction(pierced, 'normal')
    expect(choice.action).toMatchObject({ type: 'install', unitId: queen(pierced).id, kind: 'attack', to: 'd6' })
    expect(simulateLegalAction(pierced, choice.action).winner).toBe('w')
  })

  it('stays legal and replayable across capture-rule settings', () => {
    for (const armyMode of ['full', 'reinforcement'] as const) {
      const seed = armyMode === 'full' ? 13 : 14
      let state = createGame({ seed, armyMode, combatRules: 'capture' }), log = []
      for (let turn = 0; turn < 10 && state.phase !== 'finished'; turn++) { const action = fallbackAiAction(state); expect(legalActions(state)).toContainEqual(action); log.push(action); state = applyAction(state, action) }
      expect(log.reduce(applyAction, createGame({ seed, armyMode, combatRules: 'capture' }))).toEqual(state)
    }
  })

  it('advances a sparse capture endgame instead of repeating a rest loop', () => {
    let state = captureState(), pawn = state.units.find(unit => unit.side === 'w' && unit.role === 'p') as Unit
    pawn.square = 'b2'; queen(state).square = null; king(state, 'b').square = 'h8'
    for (const unit of state.units) if (unit.side === 'w' && unit !== pawn && unit.role !== 'k') unit.hp = 0
    state.players.w.hand = [{ id: 'move-card', definitionId: 'banner' }]; state.players.w.support = []
    const first = chooseAiAction(state, 'easy', { maxNodes: 8, deadlineMs: 100 })
    expect(first.action).toMatchObject({ type: 'install', unitId: pawn.id, kind: 'move' })
    state = applyAction(state, first.action)
    expect(state.noProgress).toBeLessThan(2)
  })

  it('uses an atomic hand install to escape a capture threat before the opponent card becomes ready', () => {
    const state = captureState()
    queen(state).square = null
    king(state, 'b').square = 'h8'
    const rook = state.units.find(unit => unit.side === 'b' && unit.role === 'r')!
    rook.square = 'a4'
    for (const unit of state.units) if (unit.side === 'w' && unit.role !== 'k') unit.hp = 0
    const choice = chooseAiAction(state, 'normal', { maxNodes: 100, deadlineMs: 1_000 })
    expect(choice.action).toMatchObject({ type: 'install', unitId: king(state, 'w').id, kind: 'move' })
    const next = simulateLegalAction(state, choice.action)
    expect(next.units.find(unit => unit.id === king(state, 'w').id)?.square).not.toBe('a1')
  })
})
