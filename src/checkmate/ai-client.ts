import { fallbackAiAction } from './ai'
import type { AiDifficulty, AiWorkerRequest, AiWorkerResponse } from './ai-types'
import { legalActions } from './engine'
import type { Action, GameState } from './types'

type Status = 'thinking' | 'ready' | 'fallback'
type WorkerLike = Pick<Worker, 'postMessage' | 'terminate'> & { onmessage: ((event: MessageEvent<AiWorkerResponse>) => void) | null; onerror: ((event: ErrorEvent) => void) | null }
export interface CheckmateOpponentOptions { timeoutMs?:number; createWorker?:()=>WorkerLike }
const key = (action: Action) => action.type === 'deploy' ? `d|${action.player}|${action.unitId}|${action.to}` : action.type === 'install' ? `i|${action.player}|${action.cardId}|${action.unitId??''}|${action.kind??''}|${action.to??''}` : action.type === 'order' ? `o|${action.player}|${action.cardId}|${action.unitId}|${action.kind}|${action.to}` : action.type === 'fire' ? `f|${action.player}|${action.cardId}|${action.unitId}|${action.to}` : action.type === 'burn' ? `b|${action.player}|${action.cardId}|${action.targetUnitId ?? ''}|${action.targetSquare ?? ''}|${action.sourceUnitId ?? ''}` : `${action.type}|${action.player}`
const abortError = () => new DOMException('Opponent request cancelled', 'AbortError')

export class CheckmateOpponent {
  private worker: WorkerLike | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: { id:number; state:GameState; resolve:(action:Action)=>void; reject:(error:Error)=>void } | null = null
  private nextId = 1
  private destroyed = false
  private readonly timeoutMs: number
  private readonly createWorker: () => WorkerLike
  constructor(private readonly onStatus?: (status: Status) => void, options: CheckmateOpponentOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 2500
    this.createWorker = options.createWorker ?? (() => new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' }))
  }
  choose(state: GameState, difficulty: AiDifficulty): Promise<Action> {
    if (state.phase==='finished') return Promise.reject(new Error('No legal Checkmate action'))
    if (this.destroyed) return Promise.reject(new Error('CheckmateOpponent has been destroyed'))
    this.cancel()
    this.onStatus?.('thinking')
    const id = this.nextId++
    return new Promise<Action>((resolve, reject) => {
      this.pending = { id, state, resolve, reject }
      try {
        const worker = this.createWorker()
        this.worker = worker
        worker.onmessage = event => this.receive(event.data)
        worker.onerror = () => this.finishFallback(id)
        worker.postMessage({ type: 'choose', requestId: id, state, difficulty } satisfies AiWorkerRequest)
        if(this.pending?.id===id)this.timer = setTimeout(() => this.finishFallback(id), this.timeoutMs)
      } catch {
        this.finishFallback(id)
      }
    })
  }
  cancel() { if (!this.pending) return; const pending = this.pending; this.clear(); pending.reject(abortError()) }
  destroy() { this.cancel(); if (this.worker) this.worker.terminate(); this.worker = null; this.destroyed = true }
  private receive(message: unknown) {
    const pending = this.pending
    if (!pending) return
    if (!message || typeof message !== 'object') { this.finishFallback(pending.id); return }
    const response = message as Partial<AiWorkerResponse>
    if (response.requestId !== pending.id) return
    if (response.type === 'error') { this.finishFallback(pending.id); return }
    if (response.type !== 'choice' || !response.action) { this.finishFallback(pending.id); return }
    const valid = legalActions(pending.state).find(action => key(action) === key(response.action as Action))
    if (!valid) { this.finishFallback(pending.id); return }
    this.finish(valid, 'ready')
  }
  private finishFallback(id: number) { if (this.pending?.id !== id) return; try{this.finish(fallbackAiAction(this.pending.state), 'fallback')}catch(error){const pending=this.pending;this.clear();pending?.reject(error instanceof Error?error:new Error('No legal fallback action'))} }
  private finish(action: Action, status: Status) { const pending = this.pending; if (!pending) return; this.clear(); this.onStatus?.(status); pending.resolve(action) }
  private clear() { if (this.timer) clearTimeout(this.timer); this.timer = null; if (this.worker) this.worker.terminate(); this.worker = null; this.pending = null }
}
