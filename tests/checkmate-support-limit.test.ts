import { describe, expect, it } from 'vitest'
import { applyAction, autoDeployRemaining, createGame, legalActions, supportLimit } from '../src/checkmate/engine'
import { restoreGame, serializeGame } from '../src/checkmate/persistence'
import type { Action, GameState } from '../src/checkmate/types'

const install = (state: GameState, side: 'w'|'b'): GameState => {
  expect(state.turn).toBe(side)
  const action = legalActions(state).find((candidate): candidate is Extract<Action, { type:'install' }> => candidate.type === 'install')
  expect(action).toBeDefined()
  return applyAction(state, action!)
}

const legacySave = (state: GameState): string => {
  const saved = JSON.parse(serializeGame(state)) as Record<string, unknown>
  saved.ruleset = 'project-checkmate-0.1'
  delete saved.supportLimit
  delete saved.armyMode
  delete saved.combatRules
  return JSON.stringify(saved)
}

const v02Save = (state: GameState): string => {
  const saved = JSON.parse(serializeGame(state)) as Record<string, unknown>
  saved.ruleset = 'project-checkmate-0.2'
  delete saved.armyMode
  delete saved.combatRules
  return JSON.stringify(saved)
}

const fiveSlotGame = (): GameState => {
  let state = autoDeployRemaining(createGame({ seed: 1, supportLimit: 5 }))
  for (let index = 0; index < 5; index++) {
    state = install(state, 'w')
    const black = legalActions(state)[0]
    expect(black).toBeDefined()
    state = applyAction(state, black!)
  }
  return state
}

describe('ProjectCheckmate support limits', () => {
  it('creates three-slot games and rejects a fourth installation without mutating input', () => {
    let state = autoDeployRemaining(createGame({ seed: 1 }))
    expect(state.options.supportLimit).toBe(3)
    expect(supportLimit(state)).toBe(3)
    for (let index = 0; index < 3; index++) {
      state = install(state, 'w')
      state = applyAction(state, legalActions(state).find(action => action.type === 'install')!)
    }
    expect(state.turn).toBe('w')
    expect(state.players.w.support).toHaveLength(3)
    expect(legalActions(state).some(action => action.type === 'install')).toBe(false)
    const attempted = { type: 'install', player: 'w', cardId: state.players.w.hand[0]!.id } as const
    const before = JSON.stringify(state)
    expect(() => applyAction(state, attempted)).toThrow('Illegal action')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('restores legacy replays with their permanent five-slot semantics', () => {
    const original = fiveSlotGame()
    expect(original.players.w.support).toHaveLength(5)
    const restored = restoreGame(legacySave(original))
    expect(supportLimit(restored)).toBe(5)
    expect(restored).toEqual(original)
    const resaved = JSON.parse(serializeGame(restored)) as Record<string, unknown>
    expect(resaved).toMatchObject({ ruleset: 'project-checkmate-0.4', supportLimit: 5, armyMode: 'full', combatRules: 'hp' })
    expect(restoreGame(JSON.stringify(resaved))).toEqual(restored)
  })

  it('does not downgrade a legacy game after its installed cards fall below three', () => {
    let source = autoDeployRemaining(createGame({ seed: 1, supportLimit: 5 }))
    for (let index = 0; index < 2; index++) {
      source = install(source, 'w')
      source = applyAction(source, legalActions(source).find(action => action.type === 'install')!)
    }
    let restored = restoreGame(legacySave(source))
    expect(restored.players.w.support).toHaveLength(2)
    expect(supportLimit(restored)).toBe(5)
    restored = install(restored, 'w')
    restored = applyAction(restored, legalActions(restored).find(action => action.type === 'install')!)
    restored = install(restored, 'w')
    expect(restored.players.w.support).toHaveLength(4)
  })

  it('restores v0.2 games as full-army matches and strictly validates current root fields', () => {
    const v02 = restoreGame(v02Save(createGame({ seed: 1 })))
    expect(v02.options.armyMode).toBe('full')
    const valid = JSON.parse(serializeGame(createGame({ seed: 1 }))) as Record<string, unknown>
    expect(() => restoreGame(JSON.stringify({ ...valid, supportLimit: 4 }))).toThrow('Invalid ProjectCheckmate save')
    expect(() => restoreGame(JSON.stringify({ ...valid, unexpected: true }))).toThrow('Invalid ProjectCheckmate save')
    const missingCap = { ...valid }
    delete missingCap.supportLimit
    expect(() => restoreGame(JSON.stringify(missingCap))).toThrow('Invalid ProjectCheckmate save')
  })

  it('keeps hand burns and unready support actions illegal', () => {
    let state = autoDeployRemaining(createGame({ seed: 1 }))
    const handCard = state.players.w.hand[0]!
    expect(legalActions(state).some(action => action.type === 'burn' && action.cardId === handCard.id)).toBe(false)
    state = install(state, 'w')
    state.turn = 'w'
    const fresh = state.players.w.support[0]!
    expect(legalActions(state).some(action => (action.type === 'burn' || action.type === 'order') && action.cardId === fresh.id)).toBe(false)
  })
})
