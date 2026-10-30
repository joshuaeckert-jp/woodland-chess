import { Chess } from 'chess.js'
import type { PieceSymbol, Square } from 'chess.js'

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert'
export type EngineStatus = 'ready' | 'thinking' | 'fallback'
type Choice = { from: Square; to: Square; promotion?: PieceSymbol }
type WorkerReply = { id: number; move?: { from: string; to: string }; error?: string }
type Pending = { resolve: (move: Choice) => void; reject: (error: Error) => void; timer: number }

const ENGINE_LEVEL: Record<Exclude<Difficulty, 'easy'>, number> = { normal: 1, hard: 2, expert: 3 }
const TIMEOUT_MS = 7_500

function abortError(): Error {
  const error = new Error('Engine request cancelled')
  error.name = 'AbortError'
  return error
}

export class Engine {
  private worker: Worker | undefined
  private pending: Pending | undefined
  private requestId = 0
  private destroyed = false

  constructor(private readonly onStatus?: (state: EngineStatus) => void) {}

  choose(fen: string, difficulty: Difficulty): Promise<Choice> {
    this.cancel()
    if (this.destroyed) return Promise.reject(new Error('Engine has been destroyed'))
    const chess = new Chess(fen)
    const legal = chess.moves({ verbose: true })
    if (!legal.length) return Promise.reject(new Error('No legal moves'))
    if (difficulty === 'easy') return Promise.resolve(this.randomLegal(legal)).then((move) => {
      this.onStatus?.('ready')
      return move
    })

    this.onStatus?.('thinking')
    const id = ++this.requestId
    this.pendingFen = fen
    return new Promise<Choice>((resolve, reject) => {
      const timer = window.setTimeout(() => this.fallback(id, chess, legal), TIMEOUT_MS)
      this.pending = { resolve, reject, timer }
      try {
        this.getWorker().postMessage({ id, fen, level: ENGINE_LEVEL[difficulty] })
      } catch {
        this.fallback(id, chess, legal)
      }
    })
  }

  cancel(): void {
    if (!this.pending) return
    window.clearTimeout(this.pending.timer)
    this.pending.reject(abortError())
    this.pending = undefined
    this.resetWorker()
    if (!this.destroyed) this.onStatus?.('ready')
  }

  destroy(): void {
    this.destroyed = true
    this.cancel()
    this.worker?.terminate()
    this.worker = undefined
  }

  private getWorker(): Worker {
    if (!this.worker) {
      const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
      this.worker = worker
      worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => { if (this.worker === worker) this.receive(data) }
      worker.onerror = () => { if (this.worker === worker) this.fallback(this.requestId) }
    }
    return this.worker
  }

  private receive(reply: WorkerReply): void {
    if (!this.pending || reply.id !== this.requestId) return
    if (reply.error || !reply.move) {
      this.fallback(reply.id)
      return
    }
    const chess = new Chess(this.pendingFen)
    const legal = chess.moves({ verbose: true })
    const matchingMoves = legal.filter((move) => move.from === reply.move!.from && move.to === reply.move!.to)
    const selected = matchingMoves.find((move) => move.promotion === 'q') ?? matchingMoves[0]
    if (!selected) {
      this.fallback(reply.id, chess, legal)
      return
    }
    this.finish(reply.id, this.toChoice(selected))
  }

  private pendingFen = ''
  private fallback(id: number, chess?: Chess, legal?: ReturnType<Chess['moves']> extends infer T ? T : never): void {
    if (!this.pending || id !== this.requestId) return
    const position = chess ?? new Chess(this.pendingFen)
    const candidates = legal ?? position.moves({ verbose: true })
    if (!candidates.length) {
      const pending = this.takePending(id)
      pending?.reject(new Error('No legal moves'))
      return
    }
    this.resetWorker()
    this.finish(id, this.randomLegal(candidates as ReturnType<Chess['moves']>), true)
  }

  private finish(id: number, move: Choice, fallback = false): void {
    const pending = this.takePending(id)
    if (!pending) return
    pending.resolve(move)
    this.onStatus?.(fallback ? 'fallback' : 'ready')
  }

  private takePending(id: number): Pending | undefined {
    if (!this.pending || id !== this.requestId) return undefined
    const pending = this.pending
    window.clearTimeout(pending.timer)
    this.pending = undefined
    return pending
  }

  private randomLegal(moves: ReturnType<Chess['moves']>): Choice {
    return this.toChoice(moves[Math.floor(Math.random() * moves.length)]!)
  }

  private toChoice(move: ReturnType<Chess['moves']>[number]): Choice {
    return move.promotion ? { from: move.from, to: move.to, promotion: move.promotion } : { from: move.from, to: move.to }
  }

  private resetWorker(): void {
    this.worker?.terminate()
    this.worker = undefined
  }
}
