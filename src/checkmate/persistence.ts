import { applyAction, createGame } from './engine'
import type { Action, EncounterId, GameState } from './types'

const LEGACY_RULESET = 'project-checkmate-0.1'
const PREVIOUS_RULESET = 'project-checkmate-0.2'
const RULESET = 'project-checkmate-0.3'
const CURRENT_RULESET = 'project-checkmate-0.4'
const ENCOUNTER_RULESET = 'project-checkmate-0.5'
const TOWER_RULESET = 'project-checkmate-0.6'
const MAX_SAVE_BYTES = 2 * 1024 * 1024
type SavedBase = { schema: 1; seed: number; rosters: GameState['options']['rosters']; log: Action[]; openingHand?: string[] }
type LegacySaved = SavedBase & { ruleset: typeof LEGACY_RULESET }
type PreviousSaved = SavedBase & { ruleset: typeof PREVIOUS_RULESET; supportLimit: 3|5 }
type Saved = SavedBase & { ruleset: typeof RULESET; supportLimit: 3|5; armyMode:'full'|'reinforcement' }
type CurrentSaved = SavedBase & { ruleset: typeof CURRENT_RULESET; supportLimit: 3|5; armyMode:'full'|'reinforcement'; combatRules:'hp'|'capture' }
type EncounterSaved = SavedBase & { ruleset: typeof ENCOUNTER_RULESET; supportLimit: 3|5; armyMode:'full'|'reinforcement'; combatRules:'capture'; encounterId:EncounterId }
type TowerSaved = SavedBase & { ruleset:typeof TOWER_RULESET; supportLimit:3|5; armyMode:'full'|'reinforcement'; combatRules:'capture'; encounterId:'tower' }

export function serializeGame(state: GameState): string {
  const saved: CurrentSaved | EncounterSaved | TowerSaved = state.options.encounterId
    ? { schema: 1, ruleset: state.options.encounterId === 'tower' ? TOWER_RULESET : ENCOUNTER_RULESET, seed: state.options.seed, rosters: state.options.rosters, log: state.log, supportLimit: state.options.supportLimit ?? 3, armyMode: state.options.armyMode ?? 'full', combatRules: 'capture', encounterId: state.options.encounterId } as EncounterSaved | TowerSaved
    : { schema: 1, ruleset: CURRENT_RULESET, seed: state.options.seed, rosters: state.options.rosters, log: state.log, supportLimit: state.options.supportLimit ?? 3, armyMode: state.options.armyMode ?? 'full', combatRules: state.options.combatRules ?? 'hp' }
  if (state.options.openingHand) saved.openingHand = state.options.openingHand
  return JSON.stringify(saved)
}

export function restoreGame(raw: string): GameState {
  if (typeof raw !== 'string' || raw.length > MAX_SAVE_BYTES || new TextEncoder().encode(raw).byteLength > MAX_SAVE_BYTES) throw new Error('Invalid ProjectCheckmate save')
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('Invalid ProjectCheckmate save') }
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid ProjectCheckmate save')
  const saved = parsed as Partial<SavedBase> & { ruleset?: unknown; supportLimit?: unknown; armyMode?: unknown; combatRules?:unknown; encounterId?:unknown }
  const keys = Object.keys(saved)
  const legacy = saved.ruleset === LEGACY_RULESET
  const previous = saved.ruleset === PREVIOUS_RULESET
  const current = saved.ruleset === RULESET
  const newest = saved.ruleset === CURRENT_RULESET
  const encounter = saved.ruleset === ENCOUNTER_RULESET
  const tower = saved.ruleset === TOWER_RULESET
  const allowedKeys = legacy ? ['schema', 'ruleset', 'seed', 'rosters', 'log', 'openingHand'] : previous ? ['schema', 'ruleset', 'seed', 'rosters', 'log', 'openingHand', 'supportLimit'] : current ? ['schema', 'ruleset', 'seed', 'rosters', 'log', 'openingHand', 'supportLimit', 'armyMode'] : newest ? ['schema', 'ruleset', 'seed', 'rosters', 'log', 'openingHand', 'supportLimit', 'armyMode', 'combatRules'] : ['schema', 'ruleset', 'seed', 'rosters', 'log', 'openingHand', 'supportLimit', 'armyMode', 'combatRules', 'encounterId']
  const expectedKeyCounts = legacy ? [5, 6] : previous ? [6, 7] : current ? [7, 8] : newest ? [8, 9] : [9, 10]
  if (saved.schema !== 1 || (!legacy && !previous && !current && !newest && !encounter && !tower) || !Number.isInteger(saved.seed) || !saved.rosters || !Array.isArray(saved.log) || saved.log.length > 10_000 || !keys.every(key => allowedKeys.includes(key)) || !expectedKeyCounts.includes(keys.length) || !Array.isArray(saved.rosters.w) || !Array.isArray(saved.rosters.b) || ('openingHand' in saved && !Array.isArray(saved.openingHand)) || ((previous || current || newest || encounter || tower) && saved.supportLimit !== 3 && saved.supportLimit !== 5) || ((current || newest || encounter || tower) && saved.armyMode !== 'full' && saved.armyMode !== 'reinforcement') || (newest && saved.combatRules !== 'hp' && saved.combatRules !== 'capture') || (encounter && (saved.combatRules !== 'capture' || (saved.encounterId !== 'blockade' && saved.encounterId !== 'rescue' && saved.encounterId !== 'crossing'))) || (tower && (saved.combatRules !== 'capture' || saved.encounterId !== 'tower'))) throw new Error('Invalid ProjectCheckmate save')
  let state: GameState
  try { state = createGame({ seed: saved.seed, rosters: saved.rosters, supportLimit: legacy ? 5 : saved.supportLimit as 3|5, armyMode: (current || newest || encounter || tower) ? saved.armyMode as 'full'|'reinforcement' : 'full', combatRules: (newest || encounter || tower) ? saved.combatRules as 'hp'|'capture' : 'hp', ...((encounter || tower) ? { encounterId: saved.encounterId as EncounterId } : {}), ...(saved.openingHand === undefined ? {} : { openingHand: saved.openingHand }) }) } catch { throw new Error('Invalid ProjectCheckmate save') }
  try { for (const action of saved.log) state = applyAction(state, action) } catch { throw new Error('Invalid ProjectCheckmate save') }
  return state
}
