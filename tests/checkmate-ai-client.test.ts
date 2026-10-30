import type { Action } from '../src/checkmate/types'
import { describe, expect, it, vi } from 'vitest'
import { CheckmateOpponent } from '../src/checkmate/ai-client'
import { createGame, legalActions } from '../src/checkmate/engine'
import type { AiWorkerResponse } from '../src/checkmate/ai-types'

class FakeWorker {
  onmessage: ((event: MessageEvent<AiWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  sent: unknown[] = []
  terminated = false
  postMessage(value: unknown) { this.sent.push(value) }
  terminate() { this.terminated = true }
  reply(value: AiWorkerResponse) { this.onmessage?.({ data: value } as MessageEvent<AiWorkerResponse>) }
}

describe('CheckmateOpponent', () => {
  it('accepts only a current, legal worker response', async () => {
    const worker = new FakeWorker()
    const statuses: string[] = []
    const opponent = new CheckmateOpponent(status => statuses.push(status), { createWorker: () => worker, timeoutMs: 500 })
    const state = createGame({ seed: 1 })
    const promise = opponent.choose(state, 'easy')
    const action = legalActions(state)[0]!
    worker.reply({ type: 'choice', requestId: 1, action, diagnostics: { nodes: 1, depth: 1, elapsedMs: 1, candidates: 1, timedOut: false, fallback: false } })
    await expect(promise).resolves.toEqual(action)
    expect(statuses).toEqual(['thinking', 'ready'])
  })

  it('falls back after invalid/stale replies and on timeout', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker()
    const opponent = new CheckmateOpponent(undefined, { createWorker: () => worker, timeoutMs: 10 })
    const state = createGame({ seed: 1 })
    const first = opponent.choose(state, 'easy')
    worker.reply({ type: 'choice', requestId: 999, action: legalActions(state)[0]!, diagnostics: { nodes: 0, depth: 0, elapsedMs: 0, candidates: 0, timedOut: false, fallback: false } })
    await vi.advanceTimersByTimeAsync(11)
    await expect(first).resolves.toEqual(expect.objectContaining({ type: 'deploy' }))
    vi.useRealTimers()
  })

  it('does not accept an illegal result even if its request id is current', async () => {
    const worker = new FakeWorker()
    const opponent = new CheckmateOpponent(undefined, { createWorker: () => worker, timeoutMs: 500 })
    const state = createGame({ seed: 1 })
    const pending = opponent.choose(state, 'easy')
    worker.reply({ type: 'choice', requestId: 1, action: { type: 'rest', player: 'w' }, diagnostics: { nodes: 0, depth: 0, elapsedMs: 0, candidates: 0, timedOut: false, fallback: false } })
    await expect(pending).resolves.toEqual(expect.objectContaining({ type: 'deploy' }))
  })

  it('rejects a malformed atomic install target rather than matching only its card', async () => {
    const worker = new FakeWorker()
    const opponent = new CheckmateOpponent(undefined, { createWorker: () => worker, timeoutMs: 500 })
    const state = createGame({ seed: 1, armyMode: 'reinforcement', combatRules: 'capture' })
    const legal = legalActions(state).find(action => action.type === 'install' && action.unitId && action.kind && action.to)!
    const malformed = { ...legal, to: 'h8' as const } as Action
    expect(legalActions(state)).not.toContainEqual(malformed)
    const pending = opponent.choose(state, 'easy')
    worker.reply({ type: 'choice', requestId: 1, action: malformed, diagnostics: { nodes: 0, depth: 0, elapsedMs: 0, candidates: 0, timedOut: false, fallback: false } })
    await expect(pending).resolves.not.toEqual(malformed)
  })

  it('safely falls back for a malformed current worker message', async () => {
    const worker = new FakeWorker()
    const opponent = new CheckmateOpponent(undefined, { createWorker: () => worker, timeoutMs: 500 })
    const pending = opponent.choose(createGame({ seed: 1 }), 'easy')
    worker.onmessage?.({ data: { requestId: 1, type: 'choice' } } as MessageEvent<AiWorkerResponse>)
    await expect(pending).resolves.toEqual(expect.objectContaining({ type: 'deploy' }))
  })

  it('cancels by rejecting AbortError and terminates its worker', async () => {
    const worker = new FakeWorker()
    const opponent = new CheckmateOpponent(undefined, { createWorker: () => worker })
    const promise = opponent.choose(createGame({ seed: 1 }), 'easy')
    opponent.cancel()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminated).toBe(true)
  })

  it('falls back when creating or posting to a worker fails', async () => {
    const state = createGame({ seed: 1 })
    const creationFailure = new CheckmateOpponent(undefined, { createWorker: () => { throw new Error('blocked') } })
    await expect(creationFailure.choose(state, 'easy')).resolves.toEqual(expect.objectContaining({ type: 'deploy' }))
    const postFailure = new FakeWorker()
    postFailure.postMessage = () => { throw new Error('post failed') }
    const postingFailure = new CheckmateOpponent(undefined, { createWorker: () => postFailure })
    await expect(postingFailure.choose(state, 'easy')).resolves.toEqual(expect.objectContaining({ type: 'deploy' }))
  })

  it('cannot start another worker after destruction', async () => {
    const opponent = new CheckmateOpponent(undefined, { createWorker: () => new FakeWorker() })
    opponent.destroy()
    await expect(opponent.choose(createGame({ seed: 1 }), 'easy')).rejects.toThrow('destroyed')
  })
})
