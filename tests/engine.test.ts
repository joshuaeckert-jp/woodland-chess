import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { Engine } from '../src/engine'

type Reply = { id: number; move?: { from: string; to: string }; error?: string }

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<Reply>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  readonly postMessage = vi.fn()
  readonly terminate = vi.fn()

  constructor() {
    FakeWorker.instances.push(this)
  }

  reply(data: Reply): void {
    this.onmessage?.({ data } as MessageEvent<Reply>)
  }

  fail(): void {
    this.onerror?.(new Event('error'))
  }
}

function worker(): FakeWorker {
  return FakeWorker.instances.at(-1)!
}

describe('Engine', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('Worker', FakeWorker)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses a queen when an engine promotion omits its promotion piece', async () => {
    const engine = new Engine()
    const choice = engine.choose('k7/4P3/8/8/8/8/8/4K3 w - - 0 1', 'normal')
    worker().reply({ id: 1, move: { from: 'e7', to: 'e8' } })
    await expect(choice).resolves.toEqual({ from: 'e7', to: 'e8', promotion: 'q' })
  })

  it('rejects an illegal engine candidate and returns a chess.js legal fallback', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const states: string[] = []
    const engine = new Engine((state) => states.push(state))
    const chess = new Chess()
    const expected = chess.moves({ verbose: true })[0]!
    const choice = engine.choose(chess.fen(), 'normal')
    const activeWorker = worker()
    activeWorker.reply({ id: 1, move: { from: 'e2', to: 'e5' } })
    await expect(choice).resolves.toMatchObject({ from: expected.from, to: expected.to })
    expect(activeWorker.terminate).toHaveBeenCalledOnce()
    expect(states).toContain('fallback')
  })

  it('falls back after worker errors and the bounded timeout', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const engine = new Engine()
    const failed = engine.choose(new Chess().fen(), 'normal')
    worker().fail()
    await expect(failed).resolves.toMatchObject({ from: 'a2', to: 'a3' })

    const timedOut = engine.choose(new Chess().fen(), 'hard')
    const activeWorker = worker()
    await vi.advanceTimersByTimeAsync(7_500)
    await expect(timedOut).resolves.toMatchObject({ from: 'a2', to: 'a3' })
    expect(activeWorker.terminate).toHaveBeenCalledOnce()
  })

  it('rejects cancelled work and ignores a stale worker response', async () => {
    const engine = new Engine()
    const first = engine.choose(new Chess().fen(), 'normal')
    const staleWorker = worker()
    const rejection = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    engine.cancel()
    await rejection

    const next = engine.choose(new Chess().fen(), 'normal')
    const currentWorker = worker()
    let settled = false
    void next.then(() => { settled = true })
    staleWorker.reply({ id: 1, move: { from: 'e2', to: 'e4' } })
    await Promise.resolve()
    expect(settled).toBe(false)
    currentWorker.reply({ id: 2, move: { from: 'e2', to: 'e4' } })
    await expect(next).resolves.toMatchObject({ from: 'e2', to: 'e4' })
    expect(staleWorker.terminate).toHaveBeenCalledOnce()
  })
})
