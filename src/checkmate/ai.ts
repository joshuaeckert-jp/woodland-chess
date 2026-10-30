import {chooseEncounterAction} from './encounters'
import { CARD_DEFINITIONS, UNIT_DEFINITIONS, getCardDefinitions } from './content'
import { canonicalSignature, effectiveStats, legalActions, simulateLegalAction } from './engine'
import { chebyshev, between, point, pawnForward } from './geometry'
import type { Action, GameState, Role, Side, Square, Unit } from './types'
import type { AiChoice, AiDiagnostics, AiDifficulty, AiSearchOptions } from './ai-types'

export type { AiChoice, AiDiagnostics, AiDifficulty, AiSearchOptions } from './ai-types'

const other = (side: Side): Side => side === 'w' ? 'b' : 'w'
const nowDefault = () => typeof performance !== 'undefined' ? performance.now() : Date.now()
const actionKey = (action: Action) => action.type === 'deploy' ? `d|${action.player}|${action.unitId}|${action.to}` : action.type === 'install' ? `i|${action.player}|${action.cardId}|${action.unitId ?? ''}|${action.kind ?? ''}|${action.to ?? ''}` : action.type === 'order' ? `o|${action.player}|${action.cardId}|${action.unitId}|${action.kind}|${action.to}` : action.type === 'fire' ? `f|${action.player}|${action.cardId}|${action.unitId}|${action.to}` : action.type === 'burn' ? `b|${action.player}|${action.cardId}|${action.targetUnitId ?? ''}|${action.targetSquare ?? ''}|${action.sourceUnitId ?? ''}` : `${action.type}|${action.player}`
const alive = (unit: Unit) => unit.hp > 0 && unit.square !== null
const captureRules = (state: GameState) => state.options.combatRules === 'capture'
type AttackAction = (Extract<Action, { type: 'order' }> & { kind: 'attack' }) | (Extract<Action, { type: 'install' }> & { unitId: string; kind: 'attack'; to: Square }) | Extract<Action, { type: 'fire' }>
const isAttack = (action: Action): action is AttackAction => action.type === 'fire' || ((action.type === 'order' || action.type === 'install') && action.kind === 'attack' && typeof action.unitId === 'string' && typeof action.to === 'string')
const actionUnit = (state: GameState, action: Action) => (action.type === 'order' || action.type === 'install' || action.type === 'fire') && action.unitId ? state.units.find(unit => unit.id === action.unitId) : undefined
const actionTo = (action: Action) => (action.type === 'order' || action.type === 'install' || action.type === 'fire') ? action.to : undefined

function piercesGuard(state: GameState, attacker: Unit, to: Square) {
  return captureRules(state)
    ? attacker.statuses.some(status => status.kind === 'inspired')
    : UNIT_DEFINITIONS[attacker.definitionId].passive === 'pierce' && attacker.square !== null && chebyshev(attacker.square, to) >= 3
}

const limits: Record<AiDifficulty, { depth:number; widths:number[]; nodes:number; ms:number }> = {
  easy: { depth: 1, widths: [32], nodes: 32, ms: 100 },
  normal: { depth: 2, widths: [20, 10], nodes: 260, ms: 400 },
  hard: { depth: 3, widths: [16, 8, 4], nodes: 900, ms: 1200 },
}

function directKingKill(state: GameState, action: Action, side: Side) {
  const king = state.units.find(unit => unit.side === other(side) && unit.role === 'k' && alive(unit))
  if (!king) return false
  if (action.type === 'burn') return !captureRules(state) && action.targetUnitId === king.id && state.players[side].support.find(card => card.id === action.cardId)?.definitionId === 'aimed-shot' && king.hp <= 1
  if (!isAttack(action) || actionTo(action) !== king.square) return false
  const attacker = actionUnit(state, action)
  if (!attacker || !attacker.square) return false
  if (captureRules(state)) return !king.statuses.some(status => status.kind === 'guarded') || piercesGuard(state, attacker, king.square)
  const stats = effectiveStats(state, attacker.id)
  const target = effectiveStats(state, king.id)
  const pierce = UNIT_DEFINITIONS[attacker.definitionId].passive === 'pierce' && chebyshev(attacker.square, king.square!) >= 3 ? 1 : 0
  return Math.max(1, stats.atk - Math.max(0, target.def - pierce)) >= king.hp
}

function deploymentAction(state: GameState, source: Action[]): Action | null {
  const actions = source.filter((action): action is Extract<Action, {type:'deploy'}> => action.type === 'deploy')
  const king = actions.find(action => state.units.find(unit => unit.id === action.unitId)?.role === 'k')
  if (king) {
    const desired = state.turn === 'w' ? 'e1' : 'e8'
    return actions.find(action => action.unitId === king.unitId && action.to === desired) ?? king
  }
  const home: Record<Role, string[]> = { q:['d1'], r:['a1','h1'], b:['c1','f1'], n:['b1','g1'], p:['a2','b2','c2','d2','e2','f2','g2','h2'], k:['e1'] }
  return actions.find(action => {
    const role = state.units.find(unit => unit.id === action.unitId)?.role
    if (!role) return false
    const desired = home[role].map(square => state.turn === 'w' ? square : `${square[0]}${9 - Number(square[1])}`)
    return desired.includes(action.to)
  }) ?? actions[0] ?? null
}

/** Deterministic legal action suitable for a worker failure or a zero-budget search. */
export function fallbackAiAction(state: GameState, source = legalActions(state)): Action {
  const authored=chooseEncounterAction(state,source);if(authored)return authored
  if (state.phase === 'deployment') {
    const action = deploymentAction(state, source)
    if (action) return action
  }
  const actions = [...source].sort((a, b) => actionKey(a).localeCompare(actionKey(b)))
  if (!actions.length) throw new Error('No legal Checkmate action')
  const real = actions.filter(action => action.type !== 'rest')
  const candidates = real.length ? real : actions
  const winning = candidates.find(action => directKingKill(state, action, state.turn))
  if (winning) return winning
  let best=candidates[0]!,bestScore=-Infinity
  for(const action of candidates){const score=actionOrder(state,action,state.turn);if(score>bestScore){best=action;bestScore=score}}
  return best
}

function cardCost(state: GameState, action: Action) {
  if (!('cardId' in action)) return 0
  const card = [...state.players[action.player].support, ...state.players[action.player].hand].find(value => value.id === action.cardId)
  return card ? getCardDefinitions(state.options.combatRules)[card.definitionId].cooldown : 0
}

function actionOrder(state: GameState, action: Action, side: Side) {
  if (directKingKill(state, action, side)) return 2_000_000
  if (action.type === 'deploy') {
    const unit = state.units.find(value => value.id === action.unitId)
    const role = unit?.role === 'q' ? 700 : unit?.role === 'r' ? 620 : unit?.role === 'b' || unit?.role === 'n' ? 560 : 440
    const rank = Number(action.to[1])
    const advance = side === 'w' ? rank - 1 : 8 - rank
    return 3_900 + role + advance * 25
  }
  if (isAttack(action)) {
    const target = state.units.find(unit => unit.square === action.to)
    const attacker = actionUnit(state, action)
    if (captureRules(state)) {
      const role = target?.role === 'k' ? 50_000 : target?.role === 'q' ? 4_000 : target?.role === 'r' ? 3_000 : target?.role === 'b' || target?.role === 'n' ? 1_800 : 900
      const guarded = Boolean(target?.statuses.some(status => status.kind === 'guarded'))
      const bypass = attacker && action.to ? piercesGuard(state, attacker, action.to) : false
      return 20_000 + role + (guarded && !bypass ? -7_000 : 0) + (bypass ? 900 : 0) + (action.type === 'install' ? 1_500 : 0) + (action.type === 'fire' ? 200 : 0)
    }
    const damage = attacker && target ? Math.max(1, effectiveStats(state, attacker.id).atk - effectiveStats(state, target.id).def) : 1
    const role = target?.role === 'k' ? 50_000 : target?.role === 'q' ? 4_000 : target?.role === 'r' ? 3_000 : 1_000
    return 20_000 + role + damage * 500 + (target && damage >= target.hp ? 10_000 : 0)
  }
  if ((action.type === 'order' && action.kind === 'move') || (action.type === 'install' && action.kind === 'move' && action.to)) {
    const unit = actionUnit(state, action)
    const enemyKing = state.units.find(value => value.side !== side && value.role === 'k' && alive(value))
    const closer = unit?.square && enemyKing?.square ? Math.max(0, chebyshev(unit.square, enemyKing.square) - chebyshev(action.to!, enemyKing.square)) : 0
    return 2_000 + closer * 80 - cardCost(state, action) * 10
  }
  if (action.type === 'burn') {
    const definition = state.players[action.player].support.find(card => card.id === action.cardId)?.definitionId
    const target = action.targetUnitId ? state.units.find(unit => unit.id === action.targetUnitId) : undefined
    const tactical = captureRules(state) ? (definition === 'brace' || definition === 'field-dressing' || definition === 'armor-cache' ? (target?.role === 'k' ? 1_800 : 500) : definition === 'banner' || definition === 'weapon-cache' ? 700 : definition === 'vines' || definition === 'aimed-shot' || definition === 'venom' ? 650 : 100) : definition === 'field-dressing' ? (target ? (target.maxHp - target.hp) * 300 : 0) : definition === 'aimed-shot' ? (target?.role==='k'?900:target?.hp===1?1500:180) : definition === 'brace' || definition === 'banner' ? 300 : 100
    return tactical - cardCost(state, action) * 15 - (state.players[action.player].support.length === 1 ? 2_000 : 0)
  }
  if (action.type === 'install') return state.players[side].support.some(card => card.usableOn <= state.players[side].ownTurn && card.readyOn <= state.players[side].ownTurn) ? 400 : 3_000
  return 0
}

/** Geometric danger only orders candidates; actual safety is checked after real transitions. */
function possibleThreats(state:GameState){
 if(captureRules(state)){
  const attackerSide=other(state.turn),view=projectTurn(state,attackerSide)
  return legalActions(view).filter(isAttack).filter(action=>directKingKill(view,action,attackerSide)).flatMap(action=>{const attacker=actionUnit(state,action);return attacker?[attacker]:[]})
 }
 const king=state.units.find(u=>u.side===state.turn&&u.role==='k'&&alive(u))
 if(!king?.square)return []
 return state.units.filter(u=>u.side!==state.turn&&alive(u)&&Math.max(1,effectiveStats(state,u.id).atk-effectiveStats(state,king.id).def)>=king.hp).filter(u=>{
  const a=point(u.square!),b=point(king.square!),dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y)
  if(u.role==='n')return dx*dy===2
  if(u.role==='p')return u.veteran?Math.max(dx,dy)===1:dx===1&&b.y-a.y===pawnForward(u.side)
  if(u.role==='k')return Math.max(dx,dy)===1
  return (u.role==='r'?(dx===0||dy===0):u.role==='b'?dx===dy:(dx===0||dy===0||dx===dy))&&Math.max(dx,dy)<=u.range
 })
}
function projectTurn(state:GameState,side:Side):GameState{
 if(side===state.turn)return state
 return {...state,turn:side,players:{...state.players,[side]:{...state.players[side],ownTurn:state.players[side].ownTurn+1}}}
}
function physicalKey(action:Action){return action.type==='fire'?`${action.unitId}|fire|${action.to}`:action.type==='order'||(action.type==='install'&&action.unitId&&action.kind&&action.to)?`${action.unitId}|${action.kind}|${action.to}`:actionKey(action)}
function isMove(action:Action):action is Extract<Action,{type:'order'}>|(Extract<Action,{type:'install'}>&{unitId:string;kind:'move';to:Square}){return (action.type==='order'||action.type==='install')&&action.kind==='move'&&typeof action.unitId==='string'&&typeof action.to==='string'}
function pruneCandidates(state: GameState, difficulty: AiDifficulty, width: number, source = legalActions(state)) {
 const side=state.turn,groups=new Map<string,Action[]>(),scores=new Map<Action,number>()
 for(const action of source){
  const signature=(action.type==='fire'||action.type==='order'||(action.type==='install'&&action.unitId&&action.kind&&action.to))?`${physicalKey(action)}|${action.type}`:action.type==='burn'?`burn|${getCardDefinitions(state.options.combatRules)[state.players[side].support.find(c=>c.id===action.cardId)?.definitionId ?? '']?.id ?? ''}|${action.targetUnitId??action.targetSquare??''}`:actionKey(action)
  const group=groups.get(signature)??[];group.push(action);groups.set(signature,group)
 }
 const list=[...groups.values()].flatMap(group=>group.sort((a,b)=>cardCost(state,a)-cardCost(state,b)||actionKey(a).localeCompare(actionKey(b))).slice(0,difficulty==='hard'&&group[0].type==='order'?2:1))
 for(const action of list)scores.set(action,actionOrder(state,action,side))
 list.sort((a,b)=>scores.get(b)!-scores.get(a)!||actionKey(a).localeCompare(actionKey(b)))
 const winning=list.find(action=>directKingKill(state,action,side));if(winning)return [winning]
 const threats=possibleThreats(state),king=state.units.find(u=>u.side===side&&u.role==='k'&&alive(u))
 const blocks=new Set(threats.flatMap(u=>between(u.square!,king!.square!)))
 const defensive=list.filter(a=>isMove(a)&&(a.unitId===king?.id||blocks.has(a.to))||a.type==='burn'&&(a.targetUnitId===king?.id||a.targetSquare&&blocks.has(a.targetSquare)))
 const moveList=list.filter(isMove)
 const uniqueMoves:Action[]=[],seenMoves=new Set<string>()
 for(const action of (threats.length?[...defensive.filter(isMove),...moveList]:moveList)){const key=physicalKey(action);if(!seenMoves.has(key)){seenMoves.add(key);uniqueMoves.push(action)}}
 const attacks=list.filter(isAttack),installs=list.filter(a=>a.type==='install'&&!isAttack(a)),burns=list.filter(a=>a.type==='burn'),deployments=list.filter(a=>a.type==='deploy')
 const priority=[...uniqueMoves.slice(0,4),...(threats.length?defensive.slice(0,4):[]),...deployments.slice(0,6),...burns.slice(0,2),...installs.slice(0,2),...attacks.slice(0,8),...burns.slice(2,4),...list]
 return [...new Map(priority.map(a=>[actionKey(a),a])).values()].slice(0,width)
}

function evaluate(state: GameState, root: Side) {
  if (state.phase === 'finished') return state.winner === root ? 1_000_000 : state.winner === other(root) ? -1_000_000 : 0
  if (captureRules(state)) return evaluateCapture(state, root)
  let value = 0
  for (const unit of state.units) {
    if (!alive(unit)) continue
    const stats = effectiveStats(state, unit.id)
    const rank = Number(unit.square![1])
    const advance = unit.side === 'w' ? rank - 1 : 8 - rank
    const weight = unit.role === 'k' ? 120 : 14
    const score = weight * stats.hp + stats.atk * 10 + stats.def * 8 + advance * (unit.role === 'p' ? 2 : 0.4)
    value += unit.side === root ? score : -score
  }
  for (const side of ['w', 'b'] as Side[]) {
    const player = state.players[side]
    const waits=player.support.map(card=>Math.max(0,card.usableOn-player.ownTurn,card.readyOn-player.ownTurn))
    const runway=waits.reduce((sum,wait)=>sum+(wait===0?36:wait===1?22:wait===2?12:5),0)+player.hand.length*8+player.deck.length*2-(waits.some(wait=>wait<=1)?0:70)-(waits.length?0:80)
    value += side === root ? runway : -runway
  }
  return value
}

function evaluateCapture(state: GameState, root: Side) {
  const material: Record<Role, number> = { k: 20_000, q: 900, r: 520, b: 340, n: 330, p: 120 }
  let value = 0
  for (const unit of state.units) {
    if (!alive(unit)) {
      if (state.options.armyMode === 'reinforcement' && unit.hp > 0 && unit.role !== 'k') value += (unit.side === root ? 1 : -1) * Math.round(material[unit.role] * 0.08)
      continue
    }
    const advance = unit.role === 'p' ? (unit.side === 'w' ? Number(unit.square![1]) - 1 : 8 - Number(unit.square![1])) * 8 : 0
    const statusValue = unit.statuses.some(status => status.kind === 'guarded') ? 80 : 0
    const pierceValue = unit.statuses.some(status => status.kind === 'inspired') ? 70 : 0
    const rootPenalty = unit.statuses.some(status => status.kind === 'rooted') ? -90 : 0
    value += (unit.side === root ? 1 : -1) * (material[unit.role] + advance + statusValue + pierceValue + rootPenalty)
  }
  for (const side of ['w', 'b'] as Side[]) {
    const perspective = side === root ? 1 : -1
    const view = projectTurn(state, side)
    const captures = [...new Map(legalActions(view).filter(isAttack).map(action => [physicalKey(action), action])).values()]
    const enemyKing = state.units.find(unit => unit.side === other(side) && unit.role === 'k' && alive(unit))
    const ownKing = state.units.find(unit => unit.side === side && unit.role === 'k' && alive(unit))
    const kingPressure = enemyKing ? captures.filter(action => actionTo(action) === enemyKing.square).some(action => directKingKill(view, action, side)) : false
    const kingExposure = ownKing ? captures.filter(action => actionTo(action) === ownKing.square).some(action => directKingKill(view, action, side)) : false
    value += perspective * (captures.length * 9 + (kingPressure ? 1_500 : 0) - (kingExposure ? 1_500 : 0))
  }
  const repetition = state.repetitions[canonicalSignature(state)] ?? 0
  const cyclePenalty = state.noProgress * 2 + Math.max(0, repetition - 1) * 35
  value += value < 0 ? cyclePenalty : -cyclePenalty
  return value
}

interface Search { root:Side; difficulty:AiDifficulty; start:number; now:()=>number; deadline:number; maxNodes:number; nodes:number; timedOut:boolean }
function expired(search: Search) { return search.nodes >= search.maxNodes || search.now() >= search.deadline }

function unsafeForRoot(state: GameState, search: Search) {
  if (search.now() >= search.deadline) return null
  const king = state.units.find(unit => unit.side === search.root && unit.role === 'k' && alive(unit))
  if (!king || state.turn === search.root) return false
  const replies = legalActions(state)
  return replies.some(action => directKingKill(state, action, state.turn))
}

function minimax(state: GameState, depth: number, widths: number[], search: Search): number | null {
  if (state.phase === 'finished' || depth === 0) return evaluate(state, search.root)
  if (expired(search)) return null
  const candidates = pruneCandidates(state, search.difficulty, widths[0] ?? 6)
  if (!candidates.length) return evaluate(state, search.root)
  const maximizing = state.turn === search.root
  let best = maximizing ? -Infinity : Infinity
  for (const action of candidates) {
    if (expired(search)) return null
    search.nodes++
    const score = minimax(simulateLegalAction(state, action), depth - 1, widths.slice(1), search)
    if (score === null) return null
    best = maximizing ? Math.max(best, score) : Math.min(best, score)
  }
  return best
}

function completedDepth(state: GameState, depth: number, widths:number[], search: Search, choices: Action[]): {action:Action; score:number; ranked:{action:Action;score:number}[]} | null {
  const ranked:{action:Action;score:number}[]=[]
  let best: {action:Action; score:number} | null = null
  for (const action of choices) {
    if (expired(search)) return null
    search.nodes++
    const next = simulateLegalAction(state, action)
    const unsafe = unsafeForRoot(next, search)
    if (unsafe === null) return null
    const score = unsafe ? -900_000 : minimax(next, depth - 1, widths.slice(1), search)
    if (score === null) return null
    ranked.push({action,score})
    if (!best || score > best.score || (score === best.score && actionKey(action) < actionKey(best.action))) best = { action, score }
  }
  return best?{...best,ranked}:null
}

export function chooseAiAction(state: GameState, difficulty: AiDifficulty, options: AiSearchOptions = {}): AiChoice {
  const now = options.now ?? nowDefault
  const start = now()
  const spec = limits[difficulty]
  const search: Search = { root: state.turn, difficulty, start, now, deadline: start + (options.deadlineMs ?? spec.ms), maxNodes: options.maxNodes ?? spec.nodes, nodes: 0, timedOut: false }
  const rootActions = legalActions(state)
  const authored=chooseEncounterAction(state,rootActions)
  if(authored)return{action:authored,diagnostics:{nodes:0,depth:0,elapsedMs:now()-start,candidates:rootActions.length,timedOut:false,fallback:false}}
  const fallback = fallbackAiAction(state, rootActions)
  if (state.phase === 'deployment') return { action: fallback, diagnostics: { nodes: 0, depth: 0, elapsedMs: now() - start, candidates: rootActions.length, timedOut: false, fallback: false } }
  const immediate = rootActions.find(action => directKingKill(state, action, state.turn))
  if (immediate) return { action: immediate, diagnostics: { nodes: 0, depth: 0, elapsedMs: now() - start, candidates: rootActions.length, timedOut: false, fallback: false } }
  if(expired(search))return {action:fallback,diagnostics:{nodes:0,depth:0,elapsedMs:now()-start,candidates:rootActions.length,physicalMoves:0,timedOut:true,fallback:true}}
  const rootCandidates=pruneCandidates(state,difficulty,spec.widths[0],rootActions)
  let result: {action:Action; score:number;ranked:{action:Action;score:number}[]} | null = null
  let finishedDepth = 0
  for (let depth = 1; depth <= spec.depth; depth++) {
    const candidate = completedDepth(state, depth, spec.widths, search, rootCandidates)
    if (!candidate) { search.timedOut = true; break }
    result = candidate
    finishedDepth = depth
  }
  let action = result?.action ?? fallback
  if (difficulty === 'easy' && result) {
    const top=[...result.ranked].sort((a,b)=>b.score-a.score||actionKey(a.action).localeCompare(actionKey(b.action))).filter(candidate=>candidate.score>-900_000||result!.score<=-900_000).slice(0,3)
    if (top.length) action = top[(state.options.seed + state.ply) % top.length]!.action
  }
  const physicalMoves = new Set(rootCandidates.filter(isMove).map(physicalKey)).size
  return { action, diagnostics: { nodes: search.nodes, depth: finishedDepth, elapsedMs: now() - start, candidates: rootActions.length, physicalMoves, timedOut: search.timedOut, fallback: !result } }
}
