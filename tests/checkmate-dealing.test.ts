import { describe, expect, it } from 'vitest'
import { BALANCED_OPENING, STARTER_DECK } from '../src/checkmate/content'
import { applyAction, autoDeployRemaining, createGame, handDrawInfo, legalActions, simulateLegalAction } from '../src/checkmate/engine'
import { restoreGame, serializeGame } from '../src/checkmate/persistence'
import type { Action, GameState } from '../src/checkmate/types'

const selected = [...BALANCED_OPENING]
const definitions = (state: GameState, side: 'w'|'b') => ({ hand: state.players[side].hand.map(card => card.definitionId), deck: state.players[side].deck.map(card => card.definitionId) })
const takeAction = (state: GameState): GameState => {
  const action = legalActions(state).find(value => value.type === 'install') ?? legalActions(state)[0]
  if (!action) throw new Error('Expected a legal action')
  return applyAction(state, action)
}

describe('ProjectCheckmate dealing', () => {
  it('uses a selected opening in its supplied order while retaining the seeded deck order', () => {
    const selectedState = createGame({ seed: 73, openingHand: selected })
    const seededState = createGame({ seed: 73 })
    const seededDefinitions = [...seededState.players.w.hand, ...seededState.players.w.deck].map(card => card.definitionId)
    const expectedDeck = seededDefinitions.filter(definitionId => !selected.includes(definitionId))

    for (const side of ['w', 'b'] as const) {
      expect(definitions(selectedState, side)).toEqual({ hand: selected, deck: expectedDeck })
      expect([...selectedState.players[side].hand, ...selectedState.players[side].deck].map(card => card.definitionId).sort()).toEqual([...STARTER_DECK].sort())
    }
    expect(selectedState.players.w.hand.map(card => card.id)).not.toEqual(selectedState.players.b.hand.map(card => card.id))
    expect(selectedState.options.openingHand).toEqual(selected)
  })

  it('keeps the legacy shuffled opening and does not add an undefined selection to state', () => {
    const first = createGame({ seed: 81 })
    const second = createGame({ seed: 81 })
    expect(definitions(first, 'w')).toEqual(definitions(second, 'w'))
    expect('openingHand' in first.options).toBe(false)
  })

  it.each([
    ['wrong count', selected.slice(0, 4)],
    ['duplicate', ['banner', 'brace', 'banner', 'aimed-shot', 'vines']],
    ['unknown card', ['banner', 'brace', 'field-dressing', 'aimed-shot', 'unknown']],
  ])('rejects an opening hand with %s', (_, openingHand) => {
    expect(() => createGame({ openingHand })).toThrow('Invalid opening hand')
  })

  it('deals both five-card hands when deployment finishes', () => {
    const state = autoDeployRemaining(createGame({ seed: 11, openingHand: selected }))
    expect(state.lastEvents.filter(event => event.type === 'deal')).toEqual([
      expect.objectContaining({ side: 'w', amount: 5 }),
      expect.objectContaining({ side: 'b', amount: 5 }),
    ])
    expect(handDrawInfo(state, 'w').nextDrawIn).toBe(state.players.w.ownTurn === 1 ? 2 : 3)
    expect(handDrawInfo(state, 'b').nextDrawIn).toBe(3)
  })

  it('draws automatically at own turns three, six, and nine without adding actions', () => {
    let state = autoDeployRemaining(createGame({ seed: 3, openingHand: selected }))
    const initialLogLength = state.log.length
    const expectedDraws: Array<{ side: 'w'|'b'; turn: number }> = []
    let observedDraws = 0

    for (let index = 0; index < 18; index++) {
      const actingSide = state.turn
      state = takeAction(state)
      const draw = state.lastEvents.find(event => event.type === 'draw' && event.cardId)
      if (draw) {
        observedDraws++
        expectedDraws.push({ side: draw.side!, turn: state.players[draw.side!].ownTurn })
        expect(draw.amount).toBe(1)
      }
      expect(state.log).toHaveLength(initialLogLength + index + 1)
      void actingSide
    }

    expect(observedDraws).toBeGreaterThan(0)
    expect(expectedDraws.every(draw => draw.turn > 0 && draw.turn % 3 === 0)).toBe(true)
  })

  it('stops scheduling draws when a deck is empty', () => {
    let state = autoDeployRemaining(createGame({ seed: 5, openingHand: selected }))
    state.players.w.deck = []
    state.players.b.deck = []
    for (let index = 0; index < 12; index++) {
      state = takeAction(state)
      expect(state.lastEvents.some(event => event.type === 'draw' && event.cardId)).toBe(false)
    }
    expect(handDrawInfo(state, 'w').nextDrawIn).toBeNull()
    expect(handDrawInfo(state, 'b').nextDrawIn).toBeNull()
  })

  it('replays selected hands and restores the five-key legacy save format', () => {
    let state = autoDeployRemaining(createGame({ seed: 41, openingHand: selected }))
    state = takeAction(state)
    const restored = restoreGame(serializeGame(state))
    expect(restored.options.openingHand).toEqual(selected)
    expect(definitions(restored, 'w')).toEqual(definitions(state, 'w'))
    expect(restored.log).toEqual(state.log)

    const legacy = JSON.stringify({ schema: 1, ruleset: 'project-checkmate-0.1', seed: 41, rosters: createGame().options.rosters, log: [] satisfies Action[] })
    const restoredLegacy = restoreGame(legacy)
    expect('openingHand' in restoredLegacy.options).toBe(false)
  })

  it('rejects malformed persisted opening hands and unknown save fields', () => {
    const base = { schema: 1, ruleset: 'project-checkmate-0.1', seed: 1, rosters: createGame().options.rosters, log: [] as Action[] }
    expect(() => restoreGame(JSON.stringify({ ...base, openingHand: ['banner'] }))).toThrow('Invalid ProjectCheckmate save')
    expect(() => restoreGame(JSON.stringify({ ...base, openingHand: selected, unexpected: true }))).toThrow('Invalid ProjectCheckmate save')
  })

  it('simulates already-enumerated actions with the exact transition result but no replay entry', () => {
    const deployment = createGame({ seed: 17, openingHand: selected })
    const deploy = legalActions(deployment)[0]!
    const deploymentBefore = JSON.stringify(deployment)
    const simulatedDeployment = simulateLegalAction(deployment, deploy)
    const appliedDeployment = applyAction(deployment, deploy)
    expect(JSON.stringify(deployment)).toBe(deploymentBefore)
    expect(simulatedDeployment).toEqual({ ...appliedDeployment, log: [] })

    const battle = autoDeployRemaining(createGame({ seed: 17, openingHand: selected }))
    const install = legalActions(battle).find(action => action.type === 'install')!
    const battleBefore = JSON.stringify(battle)
    const simulatedBattle = simulateLegalAction(battle, install)
    const appliedBattle = applyAction(battle, install)
    expect(JSON.stringify(battle)).toBe(battleBefore)
    expect(simulatedBattle).toEqual({ ...appliedBattle, log: [] })
  })

  it('preserves draw triggers and repetition accounting in simulation', () => {
    let simulated = autoDeployRemaining(createGame({ seed: 31, openingHand: selected }))
    let applied = structuredClone(simulated)
    for (const state of [simulated, applied]) for (const side of ['w', 'b'] as const) { state.players[side].hand = []; state.players[side].deck = []; state.players[side].support = []; state.players[side].reserveCreated = true }
    for (let index = 0; index < 18 && simulated.phase !== 'finished'; index++) {
      const action = legalActions(simulated).find(value => value.type === 'rest')!
      simulated = simulateLegalAction(simulated, action)
      applied = applyAction(applied, action)
    }
    expect(simulated.winner).toBe('draw')
    expect(simulated.repetitions).toEqual(applied.repetitions)
    expect(simulated).toEqual({ ...applied, log: [] })
  })
})
