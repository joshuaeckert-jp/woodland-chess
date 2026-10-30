import { describe, expect, it } from 'vitest'
import { chooseAiAction, fallbackAiAction } from '../src/checkmate/ai'
import { applyAction, autoDeployRemaining, createGame, legalActions, simulateLegalAction } from '../src/checkmate/engine'
import type { GameState } from '../src/checkmate/types'

function battleState(): GameState {
  const state = autoDeployRemaining(createGame({ seed: 41 }))
  for (const unit of state.units) unit.square = null
  const whiteQueen = state.units.find(unit => unit.side === 'w' && unit.role === 'q')!
  const blackKing = state.units.find(unit => unit.side === 'b' && unit.role === 'k')!
  const whiteKing = state.units.find(unit => unit.side === 'w' && unit.role === 'k')!
  whiteKing.square = 'a1'; whiteQueen.square = 'd4'; blackKing.square = 'd6'; blackKing.hp = 1
  state.turn = 'w'; state.players.w.ownTurn = 4; state.players.w.hand = []; state.players.w.deck = []
  state.players.w.support = [{ id: 'order', definitionId: 'reserve-order', installedAt: 0, usableOn: 0, readyOn: 0, reserve: true }]
  state.players.w.reserveCreated = true
  state.players.b.ownTurn=3
  state.players.b.support=[{id:'enemy-order',definitionId:'reserve-order',installedAt:0,usableOn:0,readyOn:0,reserve:true}]
  return state
}

function threatenedKingState(): GameState {
  const state = battleState()
  for (const unit of state.units) unit.square = null
  const king = state.units.find(unit => unit.side === 'w' && unit.role === 'k')!
  const rook = state.units.find(unit => unit.side === 'b' && unit.role === 'r')!
  const enemyKing = state.units.find(unit => unit.side === 'b' && unit.role === 'k')!
  king.square = 'e1'; rook.square = 'e8'; enemyKing.square = 'a8'; rook.atk = 20
  return state
}

describe('Checkmate opponent AI', () => {
  it('deploys one legal king-first home action and never mutates the input', () => {
    const state = createGame({ seed: 1 })
    const before = JSON.stringify(state)
    const choice = chooseAiAction(state, 'hard')
    expect(choice.action).toMatchObject({ type: 'deploy', player: 'w', to: 'e1' })
    expect(legalActions(state)).toContainEqual(choice.action)
    expect(JSON.stringify(state)).toBe(before)
  })

  it('takes an immediate king win at every difficulty', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const state = battleState()
      const choice = chooseAiAction(state, difficulty)
      expect(choice.action).toMatchObject({ type: 'order', kind: 'attack', to: 'd6' })
    }
  })

  it('finds a direct immediate win even with a zero simulation budget', () => {
    const choice = chooseAiAction(battleState(), 'hard', { maxNodes: 0 })
    expect(choice.action).toMatchObject({ type: 'order', kind: 'attack', to: 'd6' })
    expect(choice.diagnostics.nodes).toBe(0)
  })

  it('is deterministic, bounded, and returns a structurally legal action', () => {
    const state = autoDeployRemaining(createGame({ seed: 77 }))
    state.players[state.turn].hand = []
    state.players[state.turn].support = [{ id: 'order', definitionId: 'reserve-order', installedAt: 0, usableOn: 0, readyOn: 0, reserve: true }]
    const first = chooseAiAction(state, 'normal', { maxNodes: 30, deadlineMs: 1000 })
    const second = chooseAiAction(state, 'normal', { maxNodes: 30, deadlineMs: 1000 })
    expect(first.action).toEqual(second.action)
    expect(legalActions(state)).toContainEqual(first.action)
    expect(first.diagnostics.nodes).toBeLessThanOrEqual(30)
  })

  it('keeps a real activation over Rest and uses stable fallback', () => {
    const state = battleState()
    const action = fallbackAiAction(state)
    expect(action.type).not.toBe('rest')
    expect(legalActions(state)).toContainEqual(action)
  })

  it('takes a concrete king escape when an enemy has an imminent lethal attack', () => {
    const state = threatenedKingState()
    const choice = chooseAiAction(state, 'normal', { maxNodes: 100, deadlineMs: 1000 })
    expect(choice.action).toMatchObject({ type: 'order', unitId: state.units.find(unit => unit.side === 'w' && unit.role === 'k')!.id, kind: 'move' })
    if (choice.action.type !== 'order') throw new Error('Expected order')
    expect(choice.action.to).not.toMatch(/^e/)
  })

  it('does not burn its final low-value support when a normal order is available', () => {
    const state = threatenedKingState()
    const king = state.units.find(unit => unit.side === 'w' && unit.role === 'k')!
    king.square = 'a1'
    state.players.w.support = [{ id: 'brace', definitionId: 'brace', installedAt: 0, usableOn: 0, readyOn: 0 }]
    const choice = chooseAiAction(state, 'easy')
    expect(choice.action.type).toBe('order')
  })

  it('uses an actual safe response against a one-health king under ranged attack', () => {
    const state = battleState()
    for (const unit of state.units) unit.square = null
    const king = state.units.find(unit => unit.side === 'w' && unit.role === 'k')!
    const rook = state.units.find(unit => unit.side === 'b' && unit.role === 'r')!
    const enemyKing = state.units.find(unit => unit.side === 'b' && unit.role === 'k')!
    king.square = 'a1'; king.hp = 1; rook.square = 'a4'; rook.combat = 'ranged'; rook.range = 7; rook.atk = 4; enemyKing.square = 'h8'
    state.players.w.support = [
      { id: 'smoke', definitionId: 'smoke', installedAt: 0, usableOn: 0, readyOn: 0 },
      { id: 'reserve', definitionId: 'reserve-order', installedAt: 0, usableOn: 0, readyOn: 0, reserve: true },
    ]
    const choice = chooseAiAction(state, 'normal', { maxNodes: 100, deadlineMs: 1000 })
    const next = simulateLegalAction(state, choice.action)
    const nextKing = next.units.find(unit => unit.id === king.id)!
    const enemyAttacks = legalActions(next).filter(action => action.type === 'order' && action.kind === 'attack' && action.to === nextKing.square)
    expect(enemyAttacks).toHaveLength(0)
  })

  it('does not burn a ready Banner when an ordinary move exists, but burns a final Aimed Shot that wins', () => {
    const banner = threatenedKingState()
    banner.players.w.support = [{ id: 'banner', definitionId: 'banner', installedAt: 0, usableOn: 0, readyOn: 0 }]
    expect(chooseAiAction(banner, 'easy').action.type).toBe('order')
    const shot = battleState()
    shot.players.w.support = [{ id: 'shot', definitionId: 'aimed-shot', installedAt: 0, usableOn: 0, readyOn: 0 }]
    const winning = chooseAiAction(shot, 'normal')
    expect(winning.action).toMatchObject({ type: 'burn', cardId: 'shot' })
  })

  it('installs a hand card when it has no activation runway', () => {
    const state = battleState()
    state.players.w.support = []
    state.players.w.hand = [{ id: 'banner', definitionId: 'banner' }]
    const choice = chooseAiAction(state, 'normal', { maxNodes: 30, deadlineMs: 1000 })
    expect(choice.action).toEqual({ type: 'install', player: 'w', cardId: 'banner' })
  })

  it('stays legal across one hundred seeded reachable positions under a cheap budget', () => {
    for (let seed = 1; seed <= 100; seed++) {
      let state = autoDeployRemaining(createGame({ seed }))
      for (let turn = 0; turn < 4 && state.phase !== 'finished'; turn++) state = applyAction(state, fallbackAiAction(state))
      const choice = chooseAiAction(state, 'easy', { maxNodes: 8, deadlineMs: 50 })
      expect(legalActions(state)).toContainEqual(choice.action)
      expect(choice.diagnostics.nodes).toBeLessThanOrEqual(8)
    }
  })

  it('keeps actual dense battle searches inside a practical wall-clock budget', () => {
    const started = performance.now()
    for (let seed = 1; seed <= 12; seed++) {
      const state = autoDeployRemaining(createGame({ seed }))
      state.players[state.turn].support = [{ id: `reserve-${seed}`, definitionId: 'reserve-order', installedAt: 0, usableOn: 0, readyOn: 0, reserve: true }]
      const choice = chooseAiAction(state, 'hard', { maxNodes: 120, deadlineMs: 250 })
      expect(choice.diagnostics.physicalMoves).toBeGreaterThan(0)
    }
    expect(performance.now() - started).toBeLessThan(3000)
  })

  it('can complete hard depth three with a constant clock and bounded widths', () => {
    const state = autoDeployRemaining(createGame({ seed: 17 }))
    state.players.w.support=[{id:'white-reserve',definitionId:'reserve-order',installedAt:0,usableOn:0,readyOn:0,reserve:true}]
    state.players.b.support=[{id:'black-reserve',definitionId:'reserve-order',installedAt:0,usableOn:0,readyOn:0,reserve:true}]
    const choice = chooseAiAction(state, 'hard', { now: () => 0 })
    expect(choice.diagnostics.physicalMoves).toBeGreaterThanOrEqual(4)
    expect(choice.diagnostics.depth).toBe(3)
    expect(choice.diagnostics.nodes).toBeLessThanOrEqual(900)
  })
})


it('completes the Easy pass when its final leaf exactly reaches the node allowance',()=>{
 const state=autoDeployRemaining(createGame({seed:1}))
 state.players.w.support=[{id:'easy-order',definitionId:'reserve-order',installedAt:0,usableOn:0,readyOn:0,reserve:true}]
 const choice=chooseAiAction(state,'easy',{now:()=>0})
 expect(choice.diagnostics.depth).toBe(1)
 expect(choice.diagnostics.fallback).toBe(false)
 expect(choice.diagnostics.nodes).toBeLessThanOrEqual(32)
})
