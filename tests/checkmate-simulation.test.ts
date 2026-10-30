import { describe, expect, it } from 'vitest'
import { applyAction, autoDeployRemaining, createGame, legalActions } from '../src/checkmate/engine'
import { restoreGame, serializeGame } from '../src/checkmate/persistence'
import type { Action, GameState } from '../src/checkmate/types'

function nextRandom(seed: number): () => number {
  let value = seed >>> 0
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value }
}

function weight(action: Action): number {
  if (action.type === 'burn') return 12
  if (action.type === 'order' && action.kind === 'attack') return 10
  if (action.type === 'recover') return 8
  if (action.type === 'install') return 6
  if (action.type === 'order') return 3
  return 1
}

function choose(actions: Action[], random: () => number): Action {
  const highest = Math.max(...actions.map(weight))
  const candidates = actions.filter(action => weight(action) === highest)
  return candidates[random() % candidates.length]!
}

function assertInvariants(state: GameState): void {
  const occupied = state.units.filter(unit => unit.square && unit.hp > 0).map(unit => unit.square)
  expect(new Set(occupied).size).toBe(occupied.length)
  for (const unit of state.units) expect(unit.hp).toBeGreaterThanOrEqual(0)
  for (const unit of state.units) expect(unit.hp).toBeLessThanOrEqual(unit.maxHp)
}

describe('ProjectCheckmate deterministic simulation', () => {
  it('plays varied seeded legal matches with coverage, immutable rejection, and replay equivalence', () => {
    const coverage = new Set<string>()
    let commands = 0

    for (const seed of [3, 17, 41, 73, 109]) {
      let state = autoDeployRemaining(createGame({ seed }))
      const random = nextRandom(seed)
      const wrongSide = state.turn === 'w' ? 'b' : 'w'
      const illegal = { type: 'rest', player: wrongSide } as Action
      const before = JSON.stringify(state)
      expect(() => applyAction(state, illegal)).toThrow('Illegal action')
      expect(JSON.stringify(state)).toBe(before)

      for (let step = 0; step < 180 && state.phase !== 'finished'; step++) {
        const actions = legalActions(state)
        expect(actions.length).toBeGreaterThan(0)
        const action = choose(actions, random)
        const previousTurn = state.turn
        const previousOwnTurns = { w: state.players.w.ownTurn, b: state.players.b.ownTurn }
        state = applyAction(state, action)
        commands++
        for (const event of state.lastEvents) coverage.add(event.type)
        assertInvariants(state)
        if (state.phase !== 'finished') {
          expect(state.turn).toBe(previousTurn === 'w' ? 'b' : 'w')
          expect(state.players[previousTurn].ownTurn).toBe(previousOwnTurns[previousTurn])
          expect(state.players[state.turn].ownTurn).toBe(previousOwnTurns[state.turn] + 1)
        }
      }
      expect(restoreGame(serializeGame(state))).toEqual(state)
    }

    for (const kind of ['damage', 'defeat', 'terrain', 'status']) expect(coverage.has(kind), `missing ${kind} coverage`).toBe(true)
    expect(commands).toBeGreaterThan(200)
  })
})
