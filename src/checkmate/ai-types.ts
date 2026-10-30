import type { Action, GameState } from './types'

export type AiDifficulty = 'easy' | 'normal' | 'hard'

export interface AiDiagnostics {
  nodes: number
  depth: number
  elapsedMs: number
  candidates: number
  timedOut: boolean
  fallback: boolean
  physicalMoves?: number
}

export interface AiSearchOptions {
  /** Primarily useful for deterministic tests and benchmark harnesses. */
  now?: () => number
  maxNodes?: number
  deadlineMs?: number
}

export interface AiChoice {
  action: Action
  diagnostics: AiDiagnostics
}

export interface AiWorkerRequest { type: 'choose'; requestId: number; state: GameState; difficulty: AiDifficulty }
export type AiWorkerResponse =
 | { type: 'choice'; requestId: number; action: Action; diagnostics: AiDiagnostics }
 | { type: 'error'; requestId: number; message: string }
