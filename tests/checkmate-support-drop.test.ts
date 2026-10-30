import { describe, expect, it } from 'vitest'
import { autoDeployRemaining, createGame } from '../src/checkmate/engine'
import { supportDropOptions } from '../src/checkmate/support-drop'
import type { GameState, Square, Unit } from '../src/checkmate/types'

function dropState(definitionId: string): { state: GameState; friendly: Unit; enemy: Unit } {
  const state = autoDeployRemaining(createGame({ seed: 25 }))
  const friendly = state.units.find(unit => unit.side === 'w' && unit.role === 'q')!
  const enemy = state.units.find(unit => unit.side === 'b' && unit.role === 'q')!
  for (const unit of state.units) unit.square = null
  friendly.square = 'd4'
  enemy.square = 'd6'
  state.phase = 'battle'
  state.turn = 'w'
  state.players.w.ownTurn = 2
  state.players.w.hand = []
  state.players.w.deck = []
  state.players.w.reserveCreated = true
  state.players.w.support = [{ id: 'support-card', definitionId, installedAt: 1, usableOn: 1, readyOn: 1 }]
  return { state, friendly, enemy }
}

describe('supportDropOptions', () => {
  it('returns both a friendly unit order and its burn effect without mutating state', () => {
    const { state, friendly } = dropState('banner')
    const before = JSON.stringify(state)

    const options = supportDropOptions(state, 'support-card', friendly.square!)

    expect(options.orderUnitId).toBe(friendly.id)
    expect(options.effects).toEqual([{ type: 'burn', player: 'w', cardId: 'support-card', targetUnitId: friendly.id }])
    expect(JSON.stringify(state)).toBe(before)
  })

  it('rejects an enemy card and a locked own card', () => {
    const { state, friendly } = dropState('banner')
    state.players.w.support = []
    state.players.b.support = [{ id: 'enemy-card', definitionId: 'banner', installedAt: 1, usableOn: 1, readyOn: 1 }]
    expect(supportDropOptions(state, 'enemy-card', friendly.square!)).toEqual({ effects: [] })

    state.players.w.support = [{ id: 'locked-card', definitionId: 'banner', installedAt: 2, usableOn: 3, readyOn: 3 }]
    expect(supportDropOptions(state, 'locked-card', friendly.square!)).toEqual({ effects: [] })
  })

  it('only resolves hostile effects on legal, unobstructed enemy targets', () => {
    const { state, enemy } = dropState('aimed-shot')
    expect(supportDropOptions(state, 'support-card', enemy.square!).effects).toEqual([{ type: 'burn', player: 'w', cardId: 'support-card', targetUnitId: enemy.id, sourceUnitId: state.units.find(unit => unit.side === 'w' && unit.role === 'q')!.id }])

    const blocker = state.units.find(unit => unit.side === 'b' && unit.role === 'r')!
    blocker.square = 'd5'
    expect(supportDropOptions(state, 'support-card', enemy.square!).effects).toEqual([])
    expect(supportDropOptions(state, 'support-card', 'h8').effects).toEqual([])
  })

  it('returns every legal square-effect source for an empty terrain square', () => {
    const { state, friendly } = dropState('smoke')
    const secondSource = state.units.find(unit => unit.side === 'w' && unit.role === 'r')!
    secondSource.square = 'f4'
    const square: Square = 'e5'

    const options = supportDropOptions(state, 'support-card', square)

    expect(options.orderUnitId).toBeUndefined()
    expect(options.effects).toEqual(expect.arrayContaining([
      { type: 'burn', player: 'w', cardId: 'support-card', targetSquare: square, sourceUnitId: friendly.id },
      { type: 'burn', player: 'w', cardId: 'support-card', targetSquare: square, sourceUnitId: secondSource.id },
    ]))
    expect(options.effects).toHaveLength(2)
  })
})
