import { describe, expect, it } from 'vitest'
import { applyAction, autoDeployRemaining, createGame, legalActions, simulateLegalAction } from '../src/checkmate/engine'
import type { Action, GameState } from '../src/checkmate/types'

const withoutLog = (state: GameState) => ({ ...state, log: [] as Action[] })

function expectEquivalent(state: GameState, action: Action) {
  const before = JSON.stringify(state)
  const simulated = simulateLegalAction(state, action)
  const applied = applyAction(state, action)
  expect(JSON.stringify(state)).toBe(before)
  expect(simulated).toEqual(withoutLog(applied))
  return { simulated, applied }
}

describe('ProjectCheckmate simulation path', () => {
  it('shares deployment, card, automatic draw, and poison transition behavior with recorded actions', () => {
    let simulated = createGame({ seed: 3 })
    let applied = createGame({ seed: 3 })
    const deploymentAction = legalActions(simulated)[0]!
    const deployment = expectEquivalent(simulated, deploymentAction)
    simulated = deployment.simulated
    applied = deployment.applied

    simulated = autoDeployRemaining(simulated)
    applied = autoDeployRemaining(applied)
    let sawDraw = false
    for (let index = 0; index < 6; index++) {
      const action = legalActions(simulated).find(value => value.type === 'install') ?? legalActions(simulated)[0]!
      const result = expectEquivalent(simulated, action)
      simulated = result.simulated
      applied = result.applied
      sawDraw ||= simulated.lastEvents.some(event => event.type === 'draw' && event.cardId)
    }
    expect(sawDraw).toBe(true)

    for (const state of [simulated, applied]) {
      for (const side of ['w', 'b'] as const) { state.players[side].hand = []; state.players[side].deck = []; state.players[side].support = []; state.players[side].reserveCreated = true }
      const poisoned = state.units.find(unit => unit.side === state.turn && unit.square)!
      poisoned.statuses = [{ kind: 'poison', amount: 1, remaining: 1 }]
    }
    const poisonAction = legalActions(simulated).find(value => value.type === 'rest')!
    const poison = expectEquivalent(simulated, poisonAction)
    expect(poison.simulated.lastEvents.some(event => event.type === 'damage' && event.text === 'Poison damage')).toBe(true)
    expect(poison.simulated.repetitions).toEqual(poison.applied.repetitions)
  })
})
