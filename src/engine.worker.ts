/// <reference lib="webworker" />

import { Game } from 'js-chess-engine'

type Request = { id: number; fen: string; level: number }
type Response = { id: number; move?: { from: string; to: string }; error?: string }

self.onmessage = ({ data }: MessageEvent<Request>) => {
  try {
    const game = new Game(data.fen)
    const level = Number.isFinite(data.level) ? Math.max(1, Math.min(3, Math.trunc(data.level))) : 1
    const result = game.ai({ level, play: false, ttSizeMB: 4 })
    const [from, to] = Object.entries(result.move)[0] ?? []
    if (!from || !to) throw new Error('Engine returned no move')
    const response: Response = { id: data.id, move: { from: from.toLowerCase(), to: to.toLowerCase() } }
    self.postMessage(response)
  } catch (error) {
    self.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Engine failure' } satisfies Response)
  }
}

export {}
