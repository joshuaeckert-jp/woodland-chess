import { describe, expect, it } from 'vitest'
import { applyAction, autoDeployRemaining, canonicalSignature, createGame, isCardReady, legalActions } from '../src/checkmate/engine'
import { restoreGame, serializeGame } from '../src/checkmate/persistence'
import type { GameState, Unit } from '../src/checkmate/types'

function effectState(definitionId: string): { state: GameState; friendly: Unit; enemy: Unit } {
  const state = autoDeployRemaining(createGame({ seed: 25 }))
  const friendly = state.units.find(unit => unit.side === 'w' && unit.role === 'q')!
  const enemy = state.units.find(unit => unit.side === 'b' && unit.role === 'q')!
  for (const unit of state.units) unit.square = null
  friendly.square = 'd4'
  enemy.square = 'd5'
  state.turn = 'w'
  state.players.w.ownTurn = 1
  state.players.w.hand = []
  state.players.w.deck = []
  state.players.w.support = [{ id: 'effect', definitionId, installedAt: 0, usableOn: 0, readyOn: 0 }]
  state.players.w.reserveCreated = true
  return { state, friendly, enemy }
}

describe('ProjectCheckmate engine', () => {
  it('requires king-first alternating deployment and preserves inputs on rejection', () => {
    const state = createGame({ seed: 1 })
    const pawn = state.units.find(unit => unit.side === 'w' && unit.role === 'p')!
    expect(legalActions(state).some(action => action.type === 'deploy' && action.unitId === pawn.id)).toBe(false)
    const before = JSON.stringify(state)
    expect(() => applyAction(state, { type: 'deploy', player: 'w', unitId: pawn.id, to: 'a2' })).toThrow('Illegal action')
    expect(JSON.stringify(state)).toBe(before)
    const king = state.units.find(unit => unit.side === 'w' && unit.role === 'k')!
    const next = applyAction(state, { type: 'deploy', player: 'w', unitId: king.id, to: 'a1' })
    expect(next.turn).toBe('b')
  })

  it('builds deterministic full rosters, battle turn counters, and replay saves', () => {
    const deployed = autoDeployRemaining(createGame({ seed: 3 }))
    expect(deployed.units.filter(unit => unit.square).length).toBe(32)
    expect(deployed.phase).toBe('battle')
    expect(deployed.players.w.ownTurn).toBe(1)
    const action = legalActions(deployed)[0]!
    const next = applyAction(deployed, action)
    const restored = restoreGame(serializeGame(next))
    expect(canonicalSignature(restored)).toBe(canonicalSignature(next))
    expect(restored.log).toEqual(next.log)
  })

  it('keeps mirrored deck definitions and makes burn a ready support cost, never a hand action', () => {
    let state = autoDeployRemaining(createGame({ seed: 9 }))
    expect([...state.players.w.hand, ...state.players.w.deck].map(card => card.definitionId)).toEqual([...state.players.b.hand, ...state.players.b.deck].map(card => card.definitionId))
    const handCard = state.players.w.hand[0]!
    expect(legalActions(state).some(action => action.type === 'burn' && action.cardId === handCard.id)).toBe(false)
    state.players.w.hand = [{ id: 'banner-test', definitionId: 'banner' }]
    state.players.w.support = []
    state.turn = 'w'
    state.players.w.ownTurn = 2
    state = applyAction(state, { type: 'install', player: 'w', cardId: 'banner-test' })
    state.turn = 'w'
    state.players.w.ownTurn = 3
    const burn = legalActions(state).find(action => action.type === 'burn' && action.cardId === 'banner-test')!
    expect(burn).toBeDefined()
    const after = applyAction(state, burn)
    expect(after.players.w.support).toHaveLength(0)
    expect(after.players.w.discard.map(card => card.id)).toContain('banner-test')
  })

  it('allows exposed kings because this game has no check legality', () => {
    const { state } = effectState('reserve-order')
    const king = state.units.find(unit => unit.side === 'w' && unit.role === 'k')!
    const enemyRook = state.units.find(unit => unit.side === 'b' && unit.role === 'r')!
    for (const unit of state.units) unit.square = null
    king.square = 'e1'; enemyRook.square = 'e8'
    const exposedMove = legalActions(state).find(action => action.type === 'order' && action.unitId === king.id && action.kind === 'move' && action.to === 'e2')
    expect(exposedMove).toBeDefined()
    expect(applyAction(state, exposedMove!).units.find(unit => unit.id === king.id)!.square).toBe('e2')
  })

  it.each([['banner', 1], ['field-dressing', 2], ['venom', 3]] as const)('locks cooldown %s for exactly %i future own turns', (definitionId, cooldown) => {
    let state = autoDeployRemaining(createGame({ seed: 7 }))
    state.turn = 'w'
    state.players.w.ownTurn = 4
    state.players.w.hand = []
    state.players.w.support = [{ id: 'cooldown', definitionId, installedAt: 1, usableOn: 1, readyOn: 1 }]
    const order = legalActions(state).find(action => action.type === 'order' && action.cardId === 'cooldown')!
    state = applyAction(state, order)
    const card = state.players.w.support[0]!
    expect(card.readyOn).toBe(4 + cooldown + 1)
    state.turn = 'w'
    for (let ownTurn = 5; ownTurn <= 4 + cooldown; ownTurn++) {
      state.players.w.ownTurn = ownTurn
      expect(isCardReady(state, 'cooldown')).toBe(false)
    }
    state.players.w.ownTurn = 5 + cooldown
    expect(isCardReady(state, 'cooldown')).toBe(true)
  })

  it('normalizes relative expiry and rejects recovery until every card zone is empty', () => {
    const state = autoDeployRemaining(createGame({ seed: 13 }))
    state.players.w.support = [{ id: 'relative', definitionId: 'banner', installedAt: 1, usableOn: 8, readyOn: 9 }]
    state.units[0]!.statuses = [{ kind: 'guarded', amount: 1, expiresAtOwnEnd: 8 }]
    const shifted = structuredClone(state)
    shifted.players.w.ownTurn += 3
    shifted.players.b.ownTurn += 3
    shifted.players.w.support[0]!.usableOn += 3
    shifted.players.w.support[0]!.readyOn += 3
    shifted.units[0]!.statuses[0]!.expiresAtOwnEnd! += 3
    expect(canonicalSignature(shifted)).toBe(canonicalSignature(state))
    state.turn = 'w'
    state.players.w.hand = []
    state.players.w.deck = []
    expect(legalActions(state).some(action => action.type === 'recover')).toBe(false)
    state.players.w.support = []
    expect(legalActions(state).some(action => action.type === 'recover')).toBe(true)
  })

  it('persists only strict, replayable action logs', () => {
    expect(() => restoreGame('{"schema":1,"seed":1,"rosters":{},"log":[]}')).toThrow('Invalid ProjectCheckmate save')
    expect(() => restoreGame(JSON.stringify({ schema: 1, ruleset: 'project-checkmate-0.1', seed: 1, rosters: createGame().options.rosters, log: Array(10_001).fill({ type: 'rest', player: 'w' }) }))).toThrow('Invalid ProjectCheckmate save')
    expect(() => restoreGame('x'.repeat(2 * 1024 * 1024 + 1))).toThrow('Invalid ProjectCheckmate save')
  })

  it.each([
    ['banner', (state: GameState, friendly: Unit) => expect(friendly.statuses.some(status => status.kind === 'inspired')).toBe(true)],
    ['brace', (state: GameState, friendly: Unit) => expect(friendly.statuses.some(status => status.kind === 'guarded')).toBe(true)],
    ['smoke', (state: GameState) => expect(Object.values(state.terrain).some(terrain => terrain?.kind === 'smoke')).toBe(true)],
    ['field-dressing', (_: GameState, friendly: Unit) => expect(friendly.hp).toBe(friendly.maxHp)],
    ['aimed-shot', (_: GameState, __: Unit, enemy: Unit) => expect(enemy.hp).toBe(enemy.maxHp - 1)],
    ['vines', (_: GameState, __: Unit, enemy: Unit) => expect(enemy.statuses.some(status => status.kind === 'rooted')).toBe(true)],
    ['snare', (state: GameState) => expect(Object.values(state.items).some(item => item?.kind === 'snare')).toBe(true)],
    ['herbs', (_: GameState, friendly: Unit) => { expect(friendly.hp).toBe(friendly.maxHp); expect(friendly.statuses).toHaveLength(0) }],
    ['venom', (_: GameState, __: Unit, enemy: Unit) => expect(enemy.statuses.find(status => status.kind === 'poison')?.remaining).toBe(2)],
    ['fallen-log', (state: GameState) => expect(Object.values(state.terrain).some(terrain => terrain?.kind === 'log')).toBe(true)],
    ['weapon-cache', (_: GameState, friendly: Unit) => expect(friendly.equipment.weapon).toBe(true)],
    ['armor-cache', (_: GameState, friendly: Unit) => expect(friendly.equipment.armor).toBe(true)],
  ] as const)('burn effect %s consumes support and applies its declared effect', (definitionId, verify) => {
    const { state, friendly, enemy } = effectState(definitionId)
    if (definitionId === 'field-dressing') friendly.hp -= 2
    if (definitionId === 'herbs') { friendly.hp -= 1; friendly.statuses = [{ kind: 'poison', amount: 1, remaining: 2 }, { kind: 'rooted', amount: 1, expiresAtOwnEnd: 2 }] }
    const action = legalActions(state).find(action => action.type === 'burn')!
    const next = applyAction(state, action)
    expect(next.players.w.support).toHaveLength(0)
    expect(next.players.w.discard.map(card => card.definitionId)).toContain(definitionId)
    verify(next, next.units.find(unit => unit.id === friendly.id)!, next.units.find(unit => unit.id === enemy.id)!)
  })

  it('blocks ranged LOS through source or target smoke while smoke remains passable to pawns', () => {
    const { state, friendly, enemy } = effectState('reserve-order')
    friendly.combat = 'ranged'
    friendly.range = 3
    state.terrain.d4 = { id: 'smoke-source', kind: 'smoke', square: 'd4', side: 'b', expiresOnOwnStart: 9 }
    expect(legalActions(state).some(action => action.type === 'order' && action.kind === 'attack')).toBe(false)
    delete state.terrain.d4
    state.terrain.d5 = { id: 'smoke-target', kind: 'smoke', square: 'd5', side: 'b', expiresOnOwnStart: 9 }
    expect(legalActions(state).some(action => action.type === 'order' && action.kind === 'attack')).toBe(false)
    const pawn = state.units.find(unit => unit.side === 'w' && unit.role === 'p')!
    pawn.square = 'a2'; pawn.hasMoved = false; state.terrain.a3 = { id: 'smoke-pawn', kind: 'smoke', square: 'a3', side: 'b', expiresOnOwnStart: 9 }
    expect(legalActions(state).some(action => action.type === 'order' && action.kind === 'move' && action.unitId === pawn.id && action.to === 'a4')).toBe(true)
    void enemy
  })

  it('uses actual melee landing and applies snare, Veteran, and hasMoved on a lethal pawn advance', () => {
    const { state, friendly, enemy } = effectState('reserve-order')
    friendly.role = 'p'; friendly.square = 'd7'; friendly.hasMoved = true
    enemy.square = 'e8'; enemy.hp = 1
    state.items.e8 = { id: 'trap', kind: 'snare', square: 'e8', side: 'b' }
    const action = legalActions(state).find(action => action.type === 'order' && action.kind === 'attack' && action.to === 'e8')!
    const next = applyAction(state, action)
    const pawn = next.units.find(unit => unit.id === friendly.id)!
    expect(pawn.square).toBe('e8')
    expect(pawn.hasMoved).toBe(true)
    expect(pawn.veteran).toBe(true)
    expect(pawn.statuses.some(status => status.kind === 'rooted')).toBe(true)
  })

  it('reports and applies the last empty square for a nonlethal sliding melee attack', () => {
    const { state, friendly, enemy } = effectState('reserve-order')
    friendly.square = 'd4'; friendly.combat = 'melee'; friendly.role = 'q'
    enemy.square = 'd7'; enemy.hp = enemy.maxHp
    const action = legalActions(state).find(action => action.type === 'order' && action.kind === 'attack' && action.to === 'd7')!
    const next = applyAction(state, action)
    expect(next.units.find(unit => unit.id === friendly.id)!.square).toBe('d6')
  })

  it('keeps Knights home on nonlethal attacks and ranged attackers home on lethal attacks', () => {
    const knightFixture = effectState('reserve-order')
    knightFixture.friendly.role = 'n'; knightFixture.friendly.square = 'b1'; knightFixture.enemy.square = 'c3'; knightFixture.enemy.hp = knightFixture.enemy.maxHp
    const knightAction = legalActions(knightFixture.state).find(action => action.type === 'order' && action.kind === 'attack' && action.to === 'c3')!
    expect(applyAction(knightFixture.state, knightAction).units.find(unit => unit.id === knightFixture.friendly.id)!.square).toBe('b1')
    const rangedFixture = effectState('reserve-order')
    rangedFixture.friendly.combat = 'ranged'; rangedFixture.friendly.range = 3; rangedFixture.enemy.hp = 1
    const rangedAction = legalActions(rangedFixture.state).find(action => action.type === 'order' && action.kind === 'attack')!
    expect(applyAction(rangedFixture.state, rangedAction).units.find(unit => unit.id === rangedFixture.friendly.id)!.square).toBe('d4')
  })

  it('processes all poisoned active units before finishing a poisoned king result', () => {
    const { state, friendly, enemy } = effectState('reserve-order')
    const king = state.units.find(unit => unit.side === 'w' && unit.role === 'k')!
    king.square = 'a1'; king.hp = 1; king.statuses = [{ kind: 'poison', amount: 1, remaining: 1 }]
    friendly.hp = 2; friendly.statuses = [{ kind: 'poison', amount: 1, remaining: 1 }]
    state.players.w.support = []; state.players.w.hand = []; state.players.w.deck = []; state.players.w.reserveCreated = true
    const next = applyAction(state, { type: 'rest', player: 'w' })
    expect(next.winner).toBe('b')
    expect(next.units.find(unit => unit.id === friendly.id)!.hp).toBe(1)
    void enemy
  })

  it('reaches threefold through valid rest actions with a normalized repeating state', () => {
    let state = autoDeployRemaining(createGame({ seed: 31 }))
    for (const side of ['w', 'b'] as const) { state.players[side].hand = []; state.players[side].deck = []; state.players[side].support = []; state.players[side].reserveCreated = true }
    for (let index = 0; index < 18 && state.phase !== 'finished'; index++) state = applyAction(state, { type: 'rest', player: state.turn })
    expect(state.winner).toBe('draw')
    expect(state.finishReason).toBe('threefold repetition')
  })
})
