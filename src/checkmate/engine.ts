import { CARD_DEFINITIONS, DEFAULT_ROSTER, ROLE_LIMITS, STARTER_DECK, SUPPORT_LIMIT, UNIT_DEFINITIONS, defaultRosters, getCardDefinitions } from './content'
import { applyEncounterSetup, encounterOutcome, encounterReserveIds, isEncounterId } from './encounters'
import { between, chebyshev, deploymentRank, homePawnRank, lastRank, orthogonalOrDiagonal, pawnForward, point, squareAt, squares } from './geometry'
import type { Action, ActionPreview, CardRef, EffectiveStats, GameEvent, GameOptions, GameState, GroundItem, PlayerState, Side, Square, SupportCard, Terrain, Unit, UnitStatus } from './types'

const other = (side: Side): Side => side === 'w' ? 'b' : 'w'
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const key = (action: Action) => action.type === 'deploy' ? `deploy|${action.player}|${action.unitId}|${action.to}` : action.type === 'install' ? `install|${action.player}|${action.cardId}|${action.unitId ?? ''}|${action.kind ?? ''}|${action.to ?? ''}` : action.type === 'order' ? `order|${action.player}|${action.cardId}|${action.unitId}|${action.kind}|${action.to}` : action.type === 'fire' ? `fire|${action.player}|${action.cardId}|${action.unitId}|${action.to}` : action.type === 'burn' ? `burn|${action.player}|${action.cardId}|${action.targetUnitId ?? ''}|${action.targetSquare ?? ''}|${action.sourceUnitId ?? ''}` : `${action.type}|${action.player}`
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed }
const shuffled = (seed: number, ids: string[], side: Side): CardRef[] => { const next = rng(seed >>> 0); const cards = ids.map((definitionId, i) => ({ id: `${side}-card-${i}`, definitionId })); for (let i = cards.length - 1; i; i--) { const j = next() % (i + 1); [cards[i], cards[j]] = [cards[j], cards[i]] } return cards }
const event = (state: GameState, value: GameEvent) => state.lastEvents.push(value)
const unit = (state: GameState, id: string) => state.units.find(value => value.id === id)
const alive = (value: Unit | undefined): value is Unit => Boolean(value && value.hp > 0 && value.square)
const occupied = (state: GameState, square: Square) => state.units.find(value => value.square === square && value.hp > 0)
const terrainAt = (state: GameState, square: Square) => state.terrain[square]
export const obstacleAt = (state: GameState, square: Square) => state.obstacles?.[square]
const status = (value: Unit, kind: UnitStatus['kind']) => value.statuses.find(s => s.kind === kind)
const rooted = (value: Unit) => Boolean(status(value, 'rooted'))
const cardDef = (state: GameState, ref: CardRef | SupportCard) => getCardDefinitions(state.options.combatRules)[ref.definitionId]
const cardById = (player: PlayerState, id: string) => [...player.hand, ...player.support].find(card => card.id === id)

export function createGame(options: Partial<GameOptions> = {}): GameState {
  if (options.seed !== undefined && (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff)) throw new Error('Invalid seed')
  if (options.openingHand !== undefined && (!Array.isArray(options.openingHand) || options.openingHand.length !== 5 || new Set(options.openingHand).size !== 5 || options.openingHand.some(id => !STARTER_DECK.includes(id)))) throw new Error('Invalid opening hand')
  if (options.supportLimit !== undefined && options.supportLimit !== 3 && options.supportLimit !== 5) throw new Error('Invalid support limit')
  if (options.armyMode !== undefined && options.armyMode !== 'full' && options.armyMode !== 'reinforcement') throw new Error('Invalid army mode')
  if (options.combatRules !== undefined && options.combatRules !== 'hp' && options.combatRules !== 'capture') throw new Error('Invalid combat rules')
  if (options.encounterId !== undefined && !isEncounterId(options.encounterId)) throw new Error('Invalid encounter')
  if (options.encounterId && options.combatRules === 'hp') throw new Error('Encounters require capture rules')
  if (options.encounterId && options.openingHand !== undefined) throw new Error('Encounters use curated cards')
  if (options.encounterId && options.rosters && JSON.stringify(options.rosters) !== JSON.stringify(defaultRosters())) throw new Error('Encounters require the default roster')
  const seed = options.seed ?? 1
  const rosters = options.encounterId ? defaultRosters() : options.rosters ? clone(options.rosters) : defaultRosters()
  for (const side of ['w', 'b'] as Side[]) validateRoster(rosters[side])
  const initiative: Side = seed % 2 ? 'w' : 'b'
  const players = {} as Record<Side, PlayerState>
  for (const side of ['w', 'b'] as Side[]) {
    const seededDeck = shuffled(seed, STARTER_DECK, side)
    const hand = options.openingHand ? options.openingHand.map(definitionId => seededDeck.find(card => card.definitionId === definitionId)!) : seededDeck.slice(0, 5)
    const deck = options.openingHand ? seededDeck.filter(card => !options.openingHand!.includes(card.definitionId)) : seededDeck.slice(5)
    players[side] = { side, ownTurn: 0, hand, deck, support: [], discard: [], reserveCreated: false }
  }
  const combatRules = options.encounterId ? 'capture' : options.combatRules ?? 'hp'
  const capture = combatRules === 'capture'
  const units: Unit[] = ([] as Unit[]).concat(...(['w', 'b'] as Side[]).map(side => rosters[side].map((definitionId, i) => { const d = UNIT_DEFINITIONS[definitionId], range = d.role === 'k' ? 1 : d.role === 'n' || d.role === 'p' ? 2 : 7; return { id: `${side}-unit-${i}`, side, definitionId, role: d.role, square: null, hp: capture ? 1 : d.hp, maxHp: capture ? 1 : d.hp, atk: capture ? 0 : d.atk, def: capture ? 0 : d.def, combat: capture ? 'melee' : d.combat, range: capture ? range : d.range, hasMoved: false, veteran: false, equipment: {}, statuses: [] } })))
  const supportLimit = options.supportLimit ?? SUPPORT_LIMIT
  const armyMode = options.armyMode ?? 'full'
  const gameOptions: GameOptions = options.openingHand ? { seed, rosters, openingHand: [...options.openingHand], supportLimit, armyMode, combatRules, ...(options.encounterId ? { encounterId: options.encounterId } : {}) } : { seed, rosters, supportLimit, armyMode, combatRules, ...(options.encounterId ? { encounterId: options.encounterId } : {}) }
  const state: GameState = { schema: 1, options: gameOptions, phase: armyMode === 'reinforcement' ? 'battle' : 'deployment', initiative, turn: initiative, units, players, terrain: {}, items: {}, ply: 0, deploymentCount: 0, noProgress: 0, winner: null, finishReason: null, log: [], lastEvents: [], repetitions: {}, ...(options.encounterId ? { encounterProgress:{ whiteActions:0, enemyReplies:0 } } : {}) }
  if (options.encounterId) {
    applyEncounterSetup(state, options.encounterId)
    state.repetitions = { [canonicalSignature(state)]: 1 }
    return state
  }
  if (armyMode === 'reinforcement') {
    for (const side of ['w', 'b'] as Side[]) {
      const king = units.find(value => value.side === side && value.role === 'k')!
      king.square = side === 'w' ? 'e1' : 'e8'
    }
    players[initiative].ownTurn = 1
    event(state, { type: 'deal', text: 'Opening hand dealt', side: 'w', amount: 5 })
    event(state, { type: 'deal', text: 'Opening hand dealt', side: 'b', amount: 5 })
    state.repetitions[canonicalSignature(state)] = 1
    event(state, { type: 'turn', text: 'Reinforcement battle begins', side: initiative })
  }
  return state
}

export function isCaptureGame(state: GameState): boolean { return state.options.combatRules === 'capture' }

export function supportLimit(state: GameState): 3|5 { return state.options.supportLimit ?? SUPPORT_LIMIT }

export function handDrawInfo(state: GameState, side: Side): { handCount:number; deckCount:number; discardCount:number; nextDrawIn:number|null } {
  const player = state.players[side]
  const remainder = player.ownTurn % 3
  return { handCount: player.hand.length, deckCount: player.deck.length, discardCount: player.discard.length, nextDrawIn: player.deck.length ? remainder === 0 ? 3 : 3 - remainder : null }
}

function validateRoster(roster: string[]) { if (roster.length !== 16) throw new Error('A roster must contain 16 units'); const counts: Record<string, number> = {}; for (const id of roster) { const d = UNIT_DEFINITIONS[id]; if (!d) throw new Error('Unknown unit definition'); counts[d.role] = (counts[d.role] || 0) + 1 } for (const [role, limit] of Object.entries(ROLE_LIMITS)) if (counts[role] !== limit) throw new Error('Invalid roster role count') }
export function effectiveStats(state: GameState, id: string): EffectiveStats { const value = unit(state, id); if (!value) throw new Error('Unknown unit'); return { atk: value.atk + (value.equipment.weapon ? 1 : 0) + (status(value, 'inspired') ? 1 : 0), def: value.def + (value.equipment.armor ? 1 : 0) + (status(value, 'guarded') ? 1 : 0) + kingGuard(state, value), hp: value.hp, maxHp: value.maxHp } }
function kingGuard(state: GameState, value: Unit) { if (UNIT_DEFINITIONS[value.definitionId].passive !== 'king-guard' || !value.square) return 0; return state.units.some(otherUnit => otherUnit.side === value.side && otherUnit.role === 'k' && alive(otherUnit) && chebyshev(value.square!, otherUnit.square!) === 1) ? 1 : 0 }
export function isCardReady(state: GameState, cardId: string) { const player = state.players[state.turn]; const card = player.support.find(value => value.id === cardId); return Boolean(card && state.phase === 'battle' && card.usableOn <= player.ownTurn && card.readyOn <= player.ownTurn) }
export function legalDeploymentSquares(state: GameState, id: string): Square[] {
  const value = unit(state, id)
  const reinforcing = state.options.armyMode === 'reinforcement' && state.phase === 'battle'
  if (!value || (!reinforcing && state.phase !== 'deployment') || value.side !== state.turn || value.square || value.hp <= 0 || (reinforcing && value.role === 'k')) return []
  const kingPlaced = state.units.some(u => u.side === value.side && u.role === 'k' && u.square)
  if (!kingPlaced && value.role !== 'k') return []
  return squares.filter(square => {
    const rank = Number(square[1])
    const allowed = value.role === 'p' ? value.side === 'w' ? rank <= 3 : rank >= 6 : deploymentRank(value.side, square)
    return allowed && !occupied(state, square) && !terrainAt(state, square) && !obstacleAt(state, square) && !state.items[square]
  })
}
function clearLine(state: GameState, from: Square, to: Square, lineOfSight = false) { if (lineOfSight && (terrainAt(state, from) || terrainAt(state, to))) return false; if (obstacleAt(state, to)?.kind === 'wall') return false; return between(from, to).every(square => !occupied(state, square) && !obstacleAt(state, square) && (!terrainAt(state, square) || (!lineOfSight && terrainAt(state, square)!.kind === 'smoke'))) }
function moveTargets(state: GameState, value: Unit): Square[] {
  if (!alive(value) || rooted(value)) return []; const from = value.square!, p = point(from), result: Square[] = [], add = (square: Square | null) => { if (square && !occupied(state, square) && obstacleAt(state, square)?.kind !== 'wall' && (!terrainAt(state, square) || terrainAt(state, square)!.kind === 'smoke')) result.push(square) }
  if (value.veteran && value.role === 'p') { for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) if (x || y) add(squareAt(p.x + x, p.y + y)); return result }
  if (value.role === 'k') { for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) if (x || y) add(squareAt(p.x + x, p.y + y)); return result }
  if (value.role === 'n') { for (const [x, y] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(squareAt(p.x + x, p.y + y)); return result }
  if (value.role === 'p') { const one = squareAt(p.x, p.y + pawnForward(value.side)); add(one); if (!value.hasMoved && Number(from[1]) === homePawnRank(value.side) && one && !occupied(state, one) && !obstacleAt(state, one) && (!terrainAt(state, one) || terrainAt(state, one)!.kind === 'smoke')) add(squareAt(p.x, p.y + pawnForward(value.side) * 2)); return result }
  for (const square of squares) { if (square !== from && !occupied(state, square) && obstacleAt(state, square)?.kind !== 'wall' && (!terrainAt(state, square) || terrainAt(state, square)!.kind === 'smoke') && orthogonalOrDiagonal(from, square) && clearLine(state, from, square) && ((value.role === 'q') || (value.role === 'r' && (point(from).x === point(square).x || point(from).y === point(square).y)) || (value.role === 'b' && Math.abs(point(from).x - point(square).x) === Math.abs(point(from).y - point(square).y)))) result.push(square) }
  return result
}
function attackTargets(state: GameState, value: Unit): Square[] {
  if (!alive(value) || (isCaptureGame(state) && rooted(value))) return []; const from = value.square!, p = point(from); const enemies = state.units.filter(u => alive(u) && u.side !== value.side) as Unit[]
  return enemies.filter(target => { const to = target.square!; if (terrainAt(state, to)?.kind === 'log' || obstacleAt(state, to)?.kind === 'wall') return false; if (value.veteran && value.role === 'p') return chebyshev(from, to) === 1; if (value.role === 'p') return Math.abs(point(to).x - p.x) === 1 && point(to).y - p.y === pawnForward(value.side); if (value.role === 'n') return (Math.abs(point(to).x - p.x) === 1 && Math.abs(point(to).y - p.y) === 2) || (Math.abs(point(to).x - p.x) === 2 && Math.abs(point(to).y - p.y) === 1); const aligned = value.role === 'k' ? chebyshev(from, to) === 1 : value.role === 'q' ? orthogonalOrDiagonal(from, to) : value.role === 'r' ? point(from).x === point(to).x || point(from).y === point(to).y : Math.abs(point(from).x - point(to).x) === Math.abs(point(from).y - point(to).y); const smokeRay = isCaptureGame(state) && (value.role === 'q' || value.role === 'r' || value.role === 'b'); return aligned && chebyshev(from, to) <= value.range && clearLine(state, from, to, value.combat === 'ranged' || smokeRay) }).map(u => u.square!)
}
function rangeLine(state: GameState, from: Square, to: Square) { return chebyshev(from, to) <= 3 && orthogonalOrDiagonal(from, to) && clearLine(state, from, to, true) }
function sources(state: GameState, side: Side, to: Square) { return state.units.filter(u => alive(u) && u.side === side && rangeLine(state, u.square!, to)) as Unit[] }
function fireTargets(state: GameState, value: Unit): Square[] { if (!alive(value) || rooted(value) || obstacleAt(state, value.square!)?.kind !== 'tower' || obstacleAt(state, value.square!)?.spent) return []; return (state.units.filter(u => alive(u) && u.side !== value.side) as Unit[]).filter(target => { const to = target.square!, distance = chebyshev(value.square!, to); return distance >= 1 && distance <= 2 && orthogonalOrDiagonal(value.square!, to) && clearLine(state, value.square!, to, true) }).map(target => target.square!) }
export function legalActions(state: GameState): Action[] {
  if (state.phase === 'finished') return []; const player = state.players[state.turn]
  if (state.phase === 'deployment') return state.units.filter(u => u.side === state.turn && !u.square).flatMap(u => legalDeploymentSquares(state, u.id).map(to => ({ type: 'deploy', player: state.turn, unitId: u.id, to } as Action)))
  const actions: Action[] = []
  if (state.options.armyMode === 'reinforcement') actions.push(...state.units.filter(u => u.side === state.turn && !u.square && u.hp > 0 && u.role !== 'k' && (!state.options.encounterId || encounterReserveIds(state.options.encounterId).includes(u.id))).flatMap(u => legalDeploymentSquares(state, u.id).map(to => ({ type: 'deploy', player: state.turn, unitId: u.id, to } as Action))))
  for (const card of player.hand) if (player.support.length < supportLimit(state)) {
    if (isCaptureGame(state)) for (const u of state.units.filter(u => u.side === state.turn && alive(u))) { for (const to of moveTargets(state, u)) actions.push({ type: 'install', player: state.turn, cardId: card.id, unitId: u.id, kind: 'move', to }); for (const to of attackTargets(state, u)) actions.push({ type: 'install', player: state.turn, cardId: card.id, unitId: u.id, kind: 'attack', to }) }
    else actions.push({ type: 'install', player: state.turn, cardId: card.id })
  }
  for (const card of player.support) if (isCardReady(state, card.id)) { if (cardDef(state, card).burnable) actions.push(...burnActions(state, card)); for (const u of state.units.filter(u => u.side === state.turn && alive(u))) { for (const to of moveTargets(state, u)) actions.push({ type: 'order', player: state.turn, cardId: card.id, unitId: u.id, kind: 'move', to }); for (const to of attackTargets(state, u)) actions.push({ type: 'order', player: state.turn, cardId: card.id, unitId: u.id, kind: 'attack', to }); if (isCaptureGame(state)) for (const to of fireTargets(state, u)) actions.push({ type:'fire', player:state.turn, cardId:card.id, unitId:u.id, to }) } }
  if (!player.reserveCreated && !player.deck.length && !player.hand.length && !player.support.length) actions.push({ type: 'recover', player: state.turn })
  if (!actions.length) actions.push({ type: 'rest', player: state.turn })
  return actions
}
function burnActions(state: GameState, card: SupportCard): Action[] { const d = cardDef(state, card), side = state.turn, friendly = (state.units.filter(u => u.side === side && alive(u)) as Unit[]).filter(u => d.effect === 'inspire' ? !status(u, 'inspired') : d.effect === 'guard' ? !status(u, 'guarded') : d.effect === 'heal' ? u.hp < u.maxHp : d.effect === 'purify' ? isCaptureGame(state) ? Boolean(status(u, 'rooted')) : u.hp < u.maxHp || Boolean(status(u, 'poison') || status(u, 'rooted')) : d.effect === 'clear' ? u.role === 'p' && Boolean(u.square && obstacleAt(state, squareAt(point(u.square).x, point(u.square).y + pawnForward(u.side)) as Square)?.square && !occupied(state, squareAt(point(u.square).x, point(u.square).y + pawnForward(u.side)) as Square)) : d.effect === 'weapon' ? !u.equipment.weapon : d.effect === 'armor' ? !u.equipment.armor : true), enemy = (state.units.filter(u => u.side !== side && alive(u)) as Unit[]).filter(u => d.effect === 'poison' ? !status(u, 'poison') : d.effect === 'root' ? !status(u, 'rooted') : true); if (d.effect === 'clear') return friendly.map(u => ({ type:'burn', player:side, cardId:card.id, targetUnitId:u.id, targetSquare:squareAt(point(u.square!).x, point(u.square!).y + pawnForward(u.side))! })); if (d.target === 'friendly') return friendly.map(u => ({ type: 'burn', player: side, cardId: card.id, targetUnitId: u.id })); if (d.target === 'hostile') return enemy.flatMap(target => sources(state, side, target.square!).map(source => ({ type: 'burn', player: side, cardId: card.id, targetUnitId: target.id, sourceUnitId: source.id }))); if (d.target === 'square') return friendly.flatMap(source => squares.filter(square => { const terrain = terrainAt(state, square); return !occupied(state, square) && chebyshev(source.square!, square) <= 2 && (d.effect === 'snare' ? !state.items[square] && terrain?.kind !== 'log' : !terrain && (d.effect !== 'log' || !state.items[square])) }).map(targetSquare => ({ type: 'burn', player: side, cardId: card.id, targetSquare, sourceUnitId: source.id }))); return [] }
export function previewAction(state: GameState, action: Action): ActionPreview { try { const next = applyAction(state, action); const damage = next.lastEvents.find(e => e.type === 'damage'); const actor = (action.type === 'order' || action.type === 'fire' || (action.type === 'install' && action.unitId)) ? unit(next, action.unitId) : undefined; return { legal: true, reason: '', damage: damage?.amount, defenderHpAfter: damage?.targetUnitId ? unit(next, damage.targetUnitId)?.hp : undefined, attackerEnd: actor?.square ?? undefined, cardReadyOn: next.players[action.player].support.find(c => c.id === ('cardId' in action ? action.cardId : ''))?.readyOn, summary: next.lastEvents.map(e => e.text).join(' ') } } catch (error) { return { legal: false, reason: error instanceof Error ? error.message : 'Invalid action', summary: '' } } }
export function applyAction(input: GameState, action: Action): GameState {
  if (!validAction(action)) throw new Error('Invalid action')
  const legal = legalActions(input); if (!legal.some(value => key(value) === key(action))) throw new Error('Illegal action')
  return commonTransition(input, action, true)
}

export function simulateLegalAction(input: GameState, action: Action): GameState {
  return commonTransition(input, action, false)
}

function commonTransition(input: GameState, action: Action, record: boolean): GameState {
  const { log: _log, repetitions: _repetitions, ...mutable } = input
  const state = clone(mutable) as GameState
  state.log = record ? clone(input.log) : []
  state.repetitions = { ...input.repetitions }
  state.lastEvents = []
  if (record) state.log.push(clone(action))
  state.ply++
  let progress = false
  if (action.type === 'deploy') {
    const u = unit(state, action.unitId)!
    u.square = action.to
    state.deploymentCount++
    event(state, { type: 'deploy', text: 'Unit deployed', unitId: u.id, to: action.to, side: u.side })
    if (state.phase === 'deployment') {
      if (state.deploymentCount === 32) { state.phase = 'battle'; state.turn = state.initiative; state.players[state.turn].ownTurn = 1; event(state, { type: 'deal', text: 'Opening hand dealt', side: 'w', amount: 5 }); event(state, { type: 'deal', text: 'Opening hand dealt', side: 'b', amount: 5 }); drawAtStart(state, state.turn); state.repetitions[canonicalSignature(state)] = 1; event(state, { type: 'turn', text: 'Battle begins', side: state.turn }) } else state.turn = other(state.turn)
      return state
    }
    progress = true
  }
  if (action.type === 'install') {
    const p = state.players[action.player], i = p.hand.findIndex(c => c.id === action.cardId), card = p.hand.splice(i, 1)[0], d = cardDef(state, card)
    const support: SupportCard = { ...card, installedAt: p.ownTurn, usableOn: p.ownTurn + 1, readyOn: p.ownTurn + 1 }
    p.support.push(support)
    event(state, { type: 'install', text: `${d.name} installed`, cardId: card.id, side: action.player })
    if (isCaptureGame(state)) {
      const u = unit(state, action.unitId!)!
      if (action.kind === 'move') { const from = u.square!, pawnAdvance = u.role === 'p' && (point(action.to!).y - point(from).y) * pawnForward(u.side) > 0; u.square = action.to!; u.hasMoved = true; event(state, { type: 'move', text: 'Unit moved', unitId: u.id, from, to: action.to }); triggerSnare(state, u); promote(state, u); progress = pawnAdvance }
      else progress = resolveAttack(state, u, action.to!)
      exhaust(support, p.ownTurn, d.cooldown)
    } else progress = true
  }
  if (action.type === 'order') { const support = state.players[action.player].support.find(c => c.id === action.cardId)!; const u = unit(state, action.unitId)!; if (action.kind === 'move') { const from = u.square!, pawnAdvance = u.role === 'p' && (point(action.to).y - point(from).y) * pawnForward(u.side) > 0; u.square = action.to; u.hasMoved = true; event(state, { type: 'move', text: 'Unit moved', unitId: u.id, from, to: action.to }); triggerSnare(state, u); promote(state, u); if (pawnAdvance) progress = true } else { progress = resolveAttack(state, u, action.to) || progress } exhaust(support, state.players[action.player].ownTurn, cardDef(state, support).cooldown) }
  if (action.type === 'fire') { const support = state.players[action.player].support.find(c => c.id === action.cardId)!, u = unit(state, action.unitId)!; progress = resolveFire(state, u, action.to); state.obstacles![u.square!]!.spent = true; exhaust(support, state.players[action.player].ownTurn, cardDef(state, support).cooldown) }
  if (action.type === 'burn') { progress = burn(state, action) }
  if (action.type === 'recover') { const p = state.players[action.player]; const card = { id: `${action.player}-reserve`, definitionId: 'reserve-order' }; p.support.push({ ...card, installedAt: p.ownTurn, usableOn: p.ownTurn + 1, readyOn: p.ownTurn + 1, reserve: true }); p.reserveCreated = true; event(state, { type: 'recover', text: 'Reserve order created', side: action.player }); progress = !isCaptureGame(state) }
  if (action.type === 'rest') { event(state, { type: 'rest', text: 'Rested', side: action.player }) }
  if (state.options.encounterId) {
    const progress = state.encounterProgress ?? (state.encounterProgress = { whiteActions:0, enemyReplies:0 })
    if (action.player === 'w') progress.whiteActions++
    else progress.enemyReplies++
    if (state.phase !== 'finished') {
      const outcome = encounterOutcome(state, action.player)
      if (outcome) { state.phase = 'finished'; state.winner = outcome.winner; state.finishReason = outcome.reason; event(state, { type:'victory', text:outcome.reason, side:outcome.winner }) }
    }
  }
  if (state.phase === 'finished') return state
  endAction(state, action.player, progress)
  return state
}
function validAction(value: unknown): value is Action {
  if (!value || typeof value !== 'object') return false
  const action = value as Record<string, unknown>
  const allowed: Record<string, string[]> = { deploy: ['type', 'player', 'unitId', 'to'], install: ['type', 'player', 'cardId', 'unitId', 'kind', 'to'], order: ['type', 'player', 'cardId', 'unitId', 'kind', 'to'], fire: ['type','player','cardId','unitId','to'], burn: ['type', 'player', 'cardId', 'targetUnitId', 'targetSquare', 'sourceUnitId'], recover: ['type', 'player'], rest: ['type', 'player'] }
  if (typeof action.type !== 'string') return false
  const fields = allowed[action.type]
  if (!fields || (action.player !== 'w' && action.player !== 'b') || !Object.keys(action).every(field => fields.includes(field))) return false
  if ('to' in action && (typeof action.to !== 'string' || !/^[a-h][1-8]$/.test(action.to))) return false
  if (action.type === 'fire' && (typeof action.cardId !== 'string' || typeof action.unitId !== 'string' || typeof action.to !== 'string' || !/^[a-h][1-8]$/.test(action.to))) return false
  if (action.type === 'install') { const atomic = 'unitId' in action || 'kind' in action || 'to' in action; if (atomic && (typeof action.unitId !== 'string' || (action.kind !== 'move' && action.kind !== 'attack') || typeof action.to !== 'string' || !/^[a-h][1-8]$/.test(action.to))) return false }
  if ('targetSquare' in action && action.targetSquare !== undefined && (typeof action.targetSquare !== 'string' || !/^[a-h][1-8]$/.test(action.targetSquare))) return false
  return true
}
function exhaust(card: SupportCard, turn: number, cooldown: number) { card.readyOn = turn + cooldown + 1 }
function resolveAttack(state: GameState, attacker: Unit, to: Square) {
  const target = occupied(state, to)!, from = attacker.square!
  if (isCaptureGame(state)) {
    const pierce = Boolean(status(attacker, 'inspired'))
    const guarded = Boolean(status(target, 'guarded'))
    attacker.statuses = attacker.statuses.filter(s => s.kind !== 'inspired')
    event(state, { type: 'attack', text: 'Capture attempted', unitId: attacker.id, targetUnitId: target.id, from, to, combat: 'melee', lethal: !guarded || pierce })
    if (guarded && !pierce) { target.statuses = target.statuses.filter(s => s.kind !== 'guarded'); event(state, { type: 'status', text: 'Guard prevented capture', unitId: target.id }); return true }
    if (guarded) target.statuses = target.statuses.filter(s => s.kind !== 'guarded')
    defeat(state, target)
    attacker.square = to; attacker.hasMoved = true; triggerSnare(state, attacker); promote(state, attacker)
    event(state, { type: 'move', text: 'Attacker advanced', unitId: attacker.id, from, to })
    return true
  }
  const stats = effectiveStats(state, attacker.id), targetStats = effectiveStats(state, target.id), distance = chebyshev(attacker.square!, to), ignore = UNIT_DEFINITIONS[attacker.definitionId].passive === 'pierce' && distance >= 3 ? 1 : 0, amount = Math.max(1, stats.atk - Math.max(0, targetStats.def - ignore)); target.hp = Math.max(0, target.hp - amount); attacker.statuses = attacker.statuses.filter(s => s.kind !== 'inspired'); event(state, { type: 'attack', text: `Attack for ${amount}`, unitId: attacker.id, targetUnitId: target.id, from, to, combat: attacker.combat, amount, lethal: target.hp === 0 }); event(state, { type: 'damage', text: 'Damage dealt', unitId: attacker.id, targetUnitId: target.id, amount, lethal: target.hp === 0 }); if (target.hp === 0) { defeat(state, target); if (attacker.combat === 'melee') { attacker.square = to; attacker.hasMoved = true; triggerSnare(state, attacker); promote(state, attacker); event(state, { type: 'move', text: 'Attacker advanced', unitId: attacker.id, from, to }) } } else if (attacker.combat === 'melee' && attacker.role !== 'n' && attacker.role !== 'p') { const end = between(from, to).filter(square => !occupied(state, square) && (!terrainAt(state, square) || terrainAt(state, square)!.kind === 'smoke')).at(-1); if (end) { attacker.square = end; attacker.hasMoved = true; triggerSnare(state, attacker); promote(state, attacker); event(state, { type: 'move', text: 'Attacker withdrew', unitId: attacker.id, from, to: end }) } } return true }
function defeat(state: GameState, value: Unit) { value.hp = 0; value.square = null; value.equipment = {}; value.statuses = []; event(state, { type: 'defeat', text: 'Unit defeated', unitId: value.id, side: value.side }); if (value.role === 'k') { state.phase = 'finished'; state.winner = other(value.side); state.finishReason = 'king defeated'; event(state, { type: 'victory', text: 'King defeated', side: state.winner }) } }
function burn(state: GameState, action: Extract<Action, { type: 'burn' }>) { const p = state.players[action.player], i = p.support.findIndex(c => c.id === action.cardId), card = p.support.splice(i, 1)[0], d = cardDef(state, card); p.discard.push({ id: card.id, definitionId: card.definitionId }); event(state, { type: 'burn', text: `${d.name} burned`, cardId: card.id, side: action.player }); let progress = !isCaptureGame(state); const target = action.targetUnitId ? unit(state, action.targetUnitId) : undefined
  if (d.effect === 'inspire' && target) addStatus(state, target, { kind: 'inspired', amount: 1, expiresAtOwnEnd: state.players[target.side].ownTurn + 1 })
  if (d.effect === 'guard' && target) addStatus(state, target, isCaptureGame(state) ? { kind: 'guarded', amount: 1 } : { kind: 'guarded', amount: 1, expiresAtOwnEnd: state.players[target.side].ownTurn + 1 })
  if (d.effect === 'heal' && target) { const n = Math.min(2, target.maxHp - target.hp); target.hp += n; event(state, { type: 'heal', text: 'Healed', unitId: target.id, amount: n }); progress = n > 0 }
  if (d.effect === 'purify' && target) { target.statuses = target.statuses.filter(s => s.kind !== 'poison' && s.kind !== 'rooted'); if (!isCaptureGame(state)) { const n = Math.min(1, target.maxHp - target.hp); target.hp += n; event(state, { type: 'heal', text: 'Purified', unitId: target.id, amount: n }) } }
  if ((d.effect === 'shot' || d.effect === 'poison' || d.effect === 'root') && target) { if (d.effect === 'shot') { target.hp = Math.max(0, target.hp - 1); event(state, { type: 'damage', text: 'Aimed shot', targetUnitId: target.id, amount: 1, lethal: target.hp === 0 }); if (target.hp === 0) defeat(state, target) } else if (d.effect === 'poison') addStatus(state, target, { kind: 'poison', amount: 1, remaining: 2 }); else addStatus(state, target, { kind: 'rooted', amount: 1, expiresAtOwnEnd: state.players[target.side].ownTurn + 1 }) }
  if ((d.effect === 'smoke' || d.effect === 'log') && action.targetSquare) { const terrain: Terrain = { id: card.id, kind: d.effect, square: action.targetSquare, side: action.player, expiresOnOwnStart: state.players[action.player].ownTurn + 1 }; state.terrain[action.targetSquare] = terrain; event(state, { type: 'terrain', text: 'Terrain placed', to: action.targetSquare, cardId: card.id }) }
  if (d.effect === 'snare' && action.targetSquare) { state.items[action.targetSquare] = { id: card.id, kind: 'snare', square: action.targetSquare, side: action.player }; event(state, { type: 'item', text: 'Snare placed', to: action.targetSquare }) }
  if ((d.effect === 'weapon' || d.effect === 'armor') && target) { target.equipment[d.effect] = true; event(state, { type: 'equipment', text: 'Equipment fitted', unitId: target.id }) }
  if (d.effect === 'clear' && target && action.targetSquare && target.role === 'p' && target.square && action.targetSquare === squareAt(point(target.square).x, point(target.square).y + pawnForward(target.side)) && obstacleAt(state, action.targetSquare) && !occupied(state, action.targetSquare)) { delete state.obstacles![action.targetSquare]; progress = true; event(state, { type:'terrain', text:'Obstacle cleared', unitId:target.id, to:action.targetSquare }) }
  return progress
}
function resolveFire(state: GameState, attacker: Unit, to: Square) { const target = occupied(state, to)!, from = attacker.square!, pierce = Boolean(status(attacker, 'inspired')), guarded = Boolean(status(target, 'guarded')); attacker.statuses = attacker.statuses.filter(s => s.kind !== 'inspired'); attacker.statuses.push({ kind:'rooted', amount:1, expiresAtOwnEnd:state.players[attacker.side].ownTurn + 1 }); event(state, { type:'attack', text:'Tower fire', unitId:attacker.id, targetUnitId:target.id, from, to, combat:'ranged', lethal:!guarded || pierce }); if (guarded && !pierce) { target.statuses = target.statuses.filter(s => s.kind !== 'guarded'); return true } if (guarded) target.statuses = target.statuses.filter(s => s.kind !== 'guarded'); defeat(state, target); return true }
function addStatus(state: GameState, value: Unit, next: UnitStatus) { const old = status(value, next.kind); if (old) Object.assign(old, next); else value.statuses.push(next); event(state, { type: 'status', text: 'Status changed', unitId: value.id }) }
function triggerSnare(state: GameState, value: Unit) { const item = value.square && state.items[value.square]; if (item && item.side !== value.side) { delete state.items[item.square]; addStatus(state, value, { kind: 'rooted', amount: 1, expiresAtOwnEnd: state.players[value.side].ownTurn + 1 }); event(state, { type: 'item', text: 'Snare triggered', unitId: value.id, to: item.square }) } }
function promote(state: GameState, value: Unit) { if (value.role === 'p' && !value.veteran && value.square && Number(value.square[1]) === lastRank(value.side)) { value.veteran = true; if (isCaptureGame(state)) { value.definitionId = 'fox-duelist'; value.role = 'q'; value.combat = 'melee'; value.range = 7; value.hp = 1; value.maxHp = 1; value.atk = 0; value.def = 0; event(state, { type: 'promote', text: 'Pawn became Bramble Duelist', unitId: value.id }) } else { value.maxHp++; value.hp++; value.atk++; value.def++; event(state, { type: 'promote', text: 'Pawn became Veteran', unitId: value.id }) } } }
function endAction(state: GameState, side: Side, progress: boolean) {
  if (state.phase === 'finished') return
  const player = state.players[side]
  let poisonDamage = false
  for (const value of state.units.filter(u => u.side === side && alive(u))) {
    const poison = isCaptureGame(state) ? undefined : status(value, 'poison')
    if (poison) {
      value.hp = Math.max(0, value.hp - 1)
      poisonDamage = true
      poison.remaining!--
      event(state, { type: 'damage', text: 'Poison damage', targetUnitId: value.id, amount: 1, lethal: value.hp === 0 })
      if (value.hp === 0) defeat(state, value)
      if (poison.remaining! <= 0) value.statuses = value.statuses.filter(s => s !== poison)
    }
    value.statuses = value.statuses.filter(s => s.expiresAtOwnEnd === undefined || s.expiresAtOwnEnd > player.ownTurn)
  }
  if ((state as GameState).phase === 'finished') return
  state.noProgress = progress || poisonDamage ? 0 : state.noProgress + 1
  state.turn = other(side)
  const next = state.players[state.turn]
  next.ownTurn++
  for (const square of Object.keys(state.terrain) as Square[]) if (state.terrain[square]!.side === state.turn && state.terrain[square]!.expiresOnOwnStart <= next.ownTurn) delete state.terrain[square]
  drawAtStart(state, state.turn)
  event(state, { type: 'turn', text: 'Turn changed', side: state.turn })
  const signature = canonicalSignature(state)
  state.repetitions[signature] = (state.repetitions[signature] || 0) + 1
  if (state.repetitions[signature] >= 3) finishDraw(state, 'threefold repetition')
  else if (state.noProgress >= 100) finishDraw(state, 'no progress')
}
function drawAtStart(state: GameState, side: Side) { const p = state.players[side]; if (p.ownTurn > 0 && p.ownTurn % 3 === 0 && p.deck.length) { const card = p.deck.shift()!; p.hand.push(card); if (!isCaptureGame(state)) state.noProgress = 0; event(state, { type: 'draw', text: 'Drew a card', cardId: card.id, side, amount: 1 }) } }
function finishDraw(state: GameState, reason: string) { state.phase = 'finished'; state.winner = 'draw'; state.finishReason = reason; event(state, { type: 'draw', text: 'Draw declared' }) }
export function autoDeployRemaining(input: GameState): GameState {
  let state = input
  const home: Record<string, string[]> = { k: ['e1'], q: ['d1'], r: ['a1', 'h1'], b: ['c1', 'f1'], n: ['b1', 'g1'], p: ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'] }
  while (state.phase === 'deployment') {
    const actions = legalActions(state)
    if (!actions.length) throw new Error('Deployment stalled')
    const chosen = actions.find(action => { if (action.type !== 'deploy') return false; const value = unit(state, action.unitId)!; const desired = home[value.role].map(square => value.side === 'w' ? square : `${square[0]}${9 - Number(square[1])}`); return desired.includes(action.to) }) ?? actions[0]
    state = applyAction(state, chosen)
  }
  return state
}
export function canonicalSignature(state: GameState): string {
  const relative = (side: Side, value: number) => Math.max(0, value - state.players[side].ownTurn)
  return JSON.stringify({
    phase: state.phase,
    armyMode: state.options.armyMode ?? 'full',
    combatRules: state.options.combatRules ?? 'hp',
    encounterId: state.options.encounterId ?? null,
    encounterProgress: state.encounterProgress ?? null,
    turn: state.turn,
    supportLimit: supportLimit(state),
    ownTurns: { w: state.players.w.ownTurn % 3, b: state.players.b.ownTurn % 3 },
    units: [...state.units].sort((a, b) => a.id.localeCompare(b.id)).map(unit => ({ id: unit.id, definitionId: unit.definitionId, side: unit.side, role: unit.role, square: unit.square, hp: unit.hp, maxHp: unit.maxHp, atk: unit.atk, def: unit.def, combat: unit.combat, range: unit.range, moved: unit.hasMoved, veteran: unit.veteran, weapon: Boolean(unit.equipment.weapon), armor: Boolean(unit.equipment.armor), statuses: [...unit.statuses].sort((a, b) => a.kind.localeCompare(b.kind)).map(s => ({ kind: s.kind, amount: s.amount, remaining: s.remaining ?? 0, expires: s.expiresAtOwnEnd === undefined ? 0 : relative(unit.side, s.expiresAtOwnEnd) })) })),
    terrain: Object.values(state.terrain).filter(Boolean).map(value => value!).sort((a, b) => a.square.localeCompare(b.square)).map(value => [value.kind, value.square, value.side, relative(value.side, value.expiresOnOwnStart)]),
    items: Object.values(state.items).filter(Boolean).map(value => value!).sort((a, b) => a.square.localeCompare(b.square)).map(value => [value.kind, value.square, value.side]),
    ...(state.obstacles === undefined ? {} : { obstacles:Object.values(state.obstacles).filter(Boolean).map(value => value!).sort((a,b) => a.square.localeCompare(b.square)).map(value => [value.kind,value.square,value.spent ? 1 : 0]) }),
    support: (['w', 'b'] as Side[]).map(side => ({ reserveCreated: state.players[side].reserveCreated, cards: [...state.players[side].support].sort((a, b) => a.id.localeCompare(b.id)).map(card => [card.definitionId, card.reserve ? 1 : 0, relative(side, card.usableOn), relative(side, card.readyOn)]) })),
    hands: (['w', 'b'] as Side[]).map(side => state.players[side].hand.map(card => card.definitionId).sort()),
    decks: (['w', 'b'] as Side[]).map(side => state.players[side].deck.map(card => card.definitionId)),
    discards: (['w', 'b'] as Side[]).map(side => state.players[side].discard.map(card => card.definitionId).sort()),
  })
}
