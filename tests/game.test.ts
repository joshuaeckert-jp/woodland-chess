import { describe, expect, it } from 'vitest'
import { Chess, effectForMove, getStatus, restoreGame, serializeGame } from '../src/game'

describe('chess rules helpers', () => {
  it('describes both castling rook moves', () => {
    const white = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
    expect(effectForMove(white.move('O-O'))).toMatchObject({ rook: { from: 'h1', to: 'f1' } })
    const black = new Chess('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1')
    expect(effectForMove(black.move('O-O-O'))).toMatchObject({ rook: { from: 'a8', to: 'd8' } })
  })

  it('places an en passant capture on the adjacent square', () => {
    const chess = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1')
    expect(effectForMove(chess.move({ from: 'e5', to: 'd6' }))).toMatchObject({
      capturedSquare: 'd5',
    })
  })

  it('does not expose pinned pieces as legal moves', () => {
    const chess = new Chess('k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1')
    expect(chess.moves({ square: 'e2', verbose: true }).some((move) => move.to === 'a2')).toBe(false)
  })

  it('includes all four legal promotion choices', () => {
    const chess = new Chess('k7/4P3/8/8/8/8/8/4K3 w - - 0 1')
    expect(chess.moves({ square: 'e7', verbose: true }).map((move) => move.promotion).sort()).toEqual(['b', 'n', 'q', 'r'])
  })

  it('round-trips full history, preserving threefold repetition', () => {
    const chess = new Chess()
    for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) chess.move(move)
    const restored = restoreGame(serializeGame(chess))
    expect(restored.fen()).toBe(chess.fen())
    expect(restored.isThreefoldRepetition()).toBe(true)
    expect(getStatus(restored)).toContain('threefold repetition')
  })

  it('reports terminal positions and rejects corrupt saves', () => {
    expect(getStatus(new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'))).toBe('Checkmate — White wins')
    expect(getStatus(new Chess('7k/5Q2/7K/8/8/8/8/8 b - - 0 1'))).toBe('Draw — stalemate')
    expect(() => restoreGame('{"schema":1,"moves":[{"from":"e2","to":"e5"}]}')).toThrow('Invalid saved game')
    expect(() => restoreGame('{"schema":1,"moves":[],"fen":"bad"}')).toThrow('Invalid saved game')
    expect(() => restoreGame('not json')).toThrow('Invalid saved game')
  })
})
