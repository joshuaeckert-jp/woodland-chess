import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { chooseAiAction } from '../src/checkmate/ai'
import { BALANCED_OPENING, defaultRosters } from '../src/checkmate/content'
import { applyAction, autoDeployRemaining, canonicalSignature, createGame, legalActions } from '../src/checkmate/engine'
import { restoreGame, serializeGame } from '../src/checkmate/persistence'
import type { Action, GameState, Side } from '../src/checkmate/types'

const CAPTURE = process.argv.includes('--capture')
const GAME_COUNT = Math.max(1,Math.min(50,Number(process.argv.find(v=>v.startsWith('--games='))?.split('=')[1]??50)))
const OUT = resolve(process.cwd(), CAPTURE?'review/selfplay-capture':'review/selfplay-50')
const MAX_BATTLE_ACTIONS = 600
const NOW = () => 0

type Counter = Record<string, number>
type UnitHit = { unitId: string; definitionId: string; side: Side; hits: number; totalDamage: number; combatDamage: number; effectDamage: number; poisonDamage: number; defeated: boolean }
type GameMetrics = {
  seed: number; mode: 'full'|'reinforcement'; difficulty: 'easy'|'normal'; opening: 'balanced'|'shuffled'
  outcome: Side|'draw'|'cutoff'; finishReason: string|null|'battle action cutoff'; actions: number; deploymentActions: number; battleActions: number
  firstAttack: number|null; firstDefeat: number|null; actionMix: Counter; cardBurns: Counter; cardOrders: Counter
  attacks: { total: number; lethal: number; nonlethal: number; damageBySourceDefinition: Counter; damageByVictimDefinition: Counter }
  unitHits: UnitHit[]; readiness: { noReadyTurns: number; zeroOrderForcedRest: number; zeroOrderAlternatives: number }
  supportCounts: Record<Side, number>; defeatedTypes: Counter; survivingKingsHp: Record<Side, number|null>
  ai: { nodes: number; maxDepth: number; fallbacks: number; timeouts: number; choices: number; elapsedMs: number }
  elapsedMs: number; trajectoryHash: string; trajectoryUnique: boolean; replayVerified: boolean; finalSignature: string; log: Action[]; save: string
}

const inc = (counter: Counter, key: string, amount = 1) => { counter[key] = (counter[key] ?? 0) + amount }
const key = (action: Action) => action.type === 'deploy' ? `d|${action.player}|${action.unitId}|${action.to}` : action.type === 'install' ? `i|${action.player}|${action.cardId}|${action.unitId??''}|${action.kind??''}|${action.to??''}` : action.type === 'order' ? `o|${action.player}|${action.cardId}|${action.unitId}|${action.kind}|${action.to}` : action.type === 'fire' ? `f|${action.player}|${action.cardId}|${action.unitId}|${action.to}` : action.type === 'burn' ? `b|${action.player}|${action.cardId}|${action.targetUnitId ?? ''}|${action.targetSquare ?? ''}|${action.sourceUnitId ?? ''}` : `${action.type}|${action.player}`
const cardDefinition = (state: GameState, action: Action) => 'cardId' in action ? [...state.players.w.hand, ...state.players.w.support, ...state.players.w.discard, ...state.players.b.hand, ...state.players.b.support, ...state.players.b.discard].find(card => card.id === action.cardId)?.definitionId ?? 'unknown' : 'none'
const unitDefinition = (state: GameState, unitId: string | undefined) => unitId ? state.units.find(unit => unit.id === unitId)?.definitionId ?? 'unknown' : 'effect'

function assertInvariants(state: GameState) {
  const occupied = new Set<string>()
  for (const unit of state.units) {
    if (!Number.isInteger(unit.hp) || unit.hp < 0 || unit.hp > unit.maxHp) throw new Error(`HP invariant failed: ${unit.id}=${unit.hp}/${unit.maxHp}`)
    if (unit.square && unit.hp > 0) {
      if (occupied.has(unit.square)) throw new Error(`Square invariant failed: ${unit.square}`)
      occupied.add(unit.square)
    }
    if (unit.hp === 0 && unit.square !== null) throw new Error(`Defeated unit remains deployed: ${unit.id}`)
  }
}

function recordTransition(before: GameState, after: GameState, action: Action, metrics: GameMetrics, hits: Map<string, UnitHit>) {
  inc(metrics.actionMix, action.type)
  if (action.type === 'burn') inc(metrics.cardBurns, cardDefinition(before, action))
  if (action.type === 'order' || action.type === 'fire') inc(metrics.cardOrders, cardDefinition(before, action))
  for (const event of after.lastEvents) {
    if (event.type === 'attack') {
      metrics.firstAttack ??= after.ply
      metrics.attacks.total++
      if (event.lethal) metrics.attacks.lethal++; else metrics.attacks.nonlethal++
    }
    if (event.type === 'damage' && event.amount) {
      const source = unitDefinition(before, event.unitId)
      const victim = unitDefinition(before, event.targetUnitId)
      inc(metrics.attacks.damageBySourceDefinition, source, event.amount)
      inc(metrics.attacks.damageByVictimDefinition, victim, event.amount)
      if (event.targetUnitId) {
        const target = before.units.find(unit => unit.id === event.targetUnitId) ?? after.units.find(unit => unit.id === event.targetUnitId)
        if (target) {
          const hit = hits.get(target.id) ?? { unitId: target.id, definitionId: target.definitionId, side: target.side, hits: 0, totalDamage: 0, combatDamage: 0, effectDamage: 0, poisonDamage: 0, defeated: false }
          hit.hits++; hit.totalDamage += event.amount
          if (event.text === 'Poison damage') hit.poisonDamage += event.amount
          else if (event.unitId) hit.combatDamage += event.amount
          else hit.effectDamage += event.amount
          hits.set(target.id, hit)
        }
      }
    }
    if (event.type === 'defeat') metrics.firstDefeat ??= after.ply
  }
}

function run(seed: number): GameMetrics {
  const mode = (CAPTURE?seed<101+Math.ceil(GAME_COUNT*.6):seed<=130) ? 'full' : 'reinforcement'
  const difficulty = seed % 2 ? 'easy' : 'normal'
  const opening = seed <= 110 ? 'balanced' : 'shuffled'
  let state = createGame({ seed, ...(CAPTURE?{combatRules:'capture' as const}:{}), rosters: defaultRosters(), supportLimit: 3, armyMode: mode, ...(opening === 'balanced' ? { openingHand: BALANCED_OPENING } : {}) })
  const metrics: GameMetrics = { seed, mode, difficulty, opening, outcome: 'cutoff', finishReason: 'battle action cutoff', actions: 0, deploymentActions: 0, battleActions: 0, firstAttack: null, firstDefeat: null, actionMix: {}, cardBurns: {}, cardOrders: {}, attacks: { total: 0, lethal: 0, nonlethal: 0, damageBySourceDefinition: {}, damageByVictimDefinition: {} }, unitHits: [], readiness: { noReadyTurns: 0, zeroOrderForcedRest: 0, zeroOrderAlternatives: 0 }, supportCounts: { w: 0, b: 0 }, defeatedTypes: {}, survivingKingsHp: { w: null, b: null }, ai: { nodes: 0, maxDepth: 0, fallbacks: 0, timeouts: 0, choices: 0, elapsedMs: 0 }, elapsedMs: 0, trajectoryHash: '', trajectoryUnique: false, replayVerified: false, finalSignature: '', log: [], save: '' }
  const hits = new Map<string, UnitHit>()
  const start = Date.now()
  if (mode === 'full') {
    state = autoDeployRemaining(state)
    inc(metrics.actionMix, 'deploy', state.log.length)
    assertInvariants(state)
  }
  while (state.phase !== 'finished' && metrics.battleActions < MAX_BATTLE_ACTIONS) {
    const legal = legalActions(state)
    if (!legal.length) throw new Error(`No legal actions at ply ${state.ply}`)
    const orders = legal.filter(action => action.type === 'order')
    const ready = state.players[state.turn].support.some(card => card.usableOn <= state.players[state.turn].ownTurn && card.readyOn <= state.players[state.turn].ownTurn)
    if (!ready) metrics.readiness.noReadyTurns++
    if (!orders.length) {
      if (legal.length === 1 && legal[0]!.type === 'rest') metrics.readiness.zeroOrderForcedRest++
      else metrics.readiness.zeroOrderAlternatives++
    }
    const budget = difficulty === 'easy' ? 32 : 260
    const choice = chooseAiAction(state, difficulty, { maxNodes: budget, now: NOW, deadlineMs: 1 })
    if (!legal.some(action => key(action) === key(choice.action))) throw new Error(`AI chose illegal action at ply ${state.ply}: ${key(choice.action)}`)
    metrics.ai.nodes += choice.diagnostics.nodes; metrics.ai.maxDepth = Math.max(metrics.ai.maxDepth, choice.diagnostics.depth); metrics.ai.fallbacks += Number(choice.diagnostics.fallback); metrics.ai.timeouts += Number(choice.diagnostics.timedOut); metrics.ai.choices++; metrics.ai.elapsedMs += choice.diagnostics.elapsedMs
    const before = state
    state = applyAction(state, choice.action)
    recordTransition(before, state, choice.action, metrics, hits)
    assertInvariants(state)
    metrics.battleActions++
  }
  metrics.actions = state.log.length
  metrics.deploymentActions = state.log.filter(action => action.type === 'deploy').length
  metrics.outcome = state.phase === 'finished' ? state.winner! : 'cutoff'
  metrics.finishReason = state.phase === 'finished' ? state.finishReason : 'battle action cutoff'
  metrics.supportCounts = { w: state.players.w.support.length, b: state.players.b.support.length }
  for (const unit of state.units) {
    const hit = hits.get(unit.id)
    if (hit) { hit.defeated = unit.hp === 0; metrics.unitHits.push(hit) }
    if (unit.hp === 0) inc(metrics.defeatedTypes, unit.definitionId)
    if (unit.role === 'k') metrics.survivingKingsHp[unit.side] = unit.hp
  }
  metrics.elapsedMs = Date.now() - start
  metrics.trajectoryHash = createHash('sha256').update(state.log.map(key).join('\n')).digest('hex')
  metrics.finalSignature = canonicalSignature(state)
  metrics.log = state.log
  metrics.save = serializeGame(state)
  const restored = restoreGame(metrics.save)
  metrics.replayVerified = canonicalSignature(restored) === metrics.finalSignature && JSON.stringify(restored.log) === JSON.stringify(state.log)
  if (!metrics.replayVerified) throw new Error(`Replay verification failed for seed ${seed}`)
  return metrics
}

mkdirSync(OUT, { recursive: true })
const summarize = () => {
  const all = Array.from({ length: GAME_COUNT }, (_, index) => JSON.parse(readFileSync(resolve(OUT, `seed-${index + 101}.json`), 'utf8')) as GameMetrics)
  const trajectories = new Set<string>()
  for (const game of all) {
    game.trajectoryUnique = !trajectories.has(game.trajectoryHash)
    trajectories.add(game.trajectoryHash)
    writeFileSync(resolve(OUT, `seed-${game.seed}.json`), JSON.stringify(game, null, 2))
  }
  const summary = {
    generatedAt: new Date().toISOString(), maxBattleActions: MAX_BATTLE_ACTIONS, gameCount: all.length,
    outcomes: all.reduce<Counter>((outcomes, game) => (inc(outcomes, game.outcome), outcomes), {}),
    finishReasons: all.reduce<Counter>((reasons, game) => (inc(reasons, game.finishReason ?? 'none'), reasons), {}),
    uniqueTrajectories: trajectories.size,
    totalBattleActions: all.reduce((sum, game) => sum + game.battleActions, 0),
    totalElapsedMs: all.reduce((sum, game) => sum + game.elapsedMs, 0),
    replayVerified: all.every(game => game.replayVerified), games: all,
  }
  writeFileSync(resolve(OUT, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({ games: all.length, outcomes: summary.outcomes, uniqueTrajectories: summary.uniqueTrajectories, totalElapsedMs: summary.totalElapsedMs, replayVerified: summary.replayVerified }))
}

if (process.env.SUMMARIZE === '1') summarize()
else {
const startSeed = Number(process.env.START_SEED ?? 101)
const endSeed = Number(process.env.END_SEED ?? (100 + GAME_COUNT))
const all: GameMetrics[] = []
const trajectories = new Set<string>()
for (let seed = startSeed; seed <= endSeed; seed++) {
  const game = run(seed)
  game.trajectoryUnique = !trajectories.has(game.trajectoryHash); trajectories.add(game.trajectoryHash)
  all.push(game)
  writeFileSync(resolve(OUT, `seed-${seed}.json`), JSON.stringify(game, null, 2))
  console.log(`${seed - 100}/${GAME_COUNT} seed=${seed} ${game.outcome} ${game.battleActions} battle actions ${game.elapsedMs}ms`)
}
}
