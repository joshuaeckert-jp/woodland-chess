import { Chess } from 'chess.js'
import type { Color, Move, PieceSymbol, Square } from 'chess.js'

export { Chess } from 'chess.js'
export type { Color, Move, PieceSymbol, Square } from 'chess.js'

export type RenderPiece = { square: Square; type: PieceSymbol; color: Color }

export function pieces(chess: Chess): RenderPiece[] {
  return chess.board().flat().filter((piece): piece is RenderPiece => piece !== null)
}

export type MoveEffect = {
  from: Square
  to: Square
  piece: PieceSymbol
  color: Color
  capturedSquare?: Square
  rook?: { from: Square; to: Square }
  promotion?: PieceSymbol
}

export function effectForMove(move: Move): MoveEffect {
  const effect: MoveEffect = {
    from: move.from,
    to: move.to,
    piece: move.piece,
    color: move.color,
  }

  if (move.isEnPassant()) {
    effect.capturedSquare = `${move.to[0]}${move.color === 'w' ? Number(move.to[1]) - 1 : Number(move.to[1]) + 1}` as Square
  } else if (move.captured) {
    effect.capturedSquare = move.to
  }
  if (move.isKingsideCastle()) {
    effect.rook = move.color === 'w' ? { from: 'h1', to: 'f1' } : { from: 'h8', to: 'f8' }
  } else if (move.isQueensideCastle()) {
    effect.rook = move.color === 'w' ? { from: 'a1', to: 'd1' } : { from: 'a8', to: 'd8' }
  }
  if (move.promotion) effect.promotion = move.promotion
  return effect
}

type StoredMove = { from: Square; to: Square; promotion?: PieceSymbol }
type SavedGame = { schema: 1; moves: StoredMove[] }

export function serializeGame(chess: Chess): string {
  const moves = chess.history({ verbose: true }).map(({ from, to, promotion }) =>
    promotion ? { from, to, promotion } : { from, to },
  )
  return JSON.stringify({ schema: 1, moves } satisfies SavedGame)
}

function isSquare(value: unknown): value is Square {
  return typeof value === 'string' && /^[a-h][1-8]$/.test(value)
}

function isPromotion(value: unknown): value is PieceSymbol {
  return value === 'q' || value === 'r' || value === 'b' || value === 'n'
}

export function restoreGame(raw: string): Chess {
  let saved: unknown
  try {
    saved = JSON.parse(raw)
  } catch {
    throw new Error('Invalid saved game')
  }
  if (!saved || typeof saved !== 'object') throw new Error('Invalid saved game')
  const candidate = saved as { schema?: unknown; moves?: unknown }
  if (
    candidate.schema !== 1 ||
    !Array.isArray(candidate.moves) ||
    Object.keys(candidate).length !== 2 ||
    !Object.prototype.hasOwnProperty.call(candidate, 'schema') ||
    !Object.prototype.hasOwnProperty.call(candidate, 'moves')
  ) {
    throw new Error('Invalid saved game')
  }

  const chess = new Chess()
  for (const item of candidate.moves) {
    if (!item || typeof item !== 'object') throw new Error('Invalid saved game')
    const move = item as { from?: unknown; to?: unknown; promotion?: unknown }
    const keys = Object.keys(move)
    if (
      !isSquare(move.from) ||
      !isSquare(move.to) ||
      (move.promotion !== undefined && !isPromotion(move.promotion)) ||
      !keys.every((key) => key === 'from' || key === 'to' || key === 'promotion') ||
      keys.length < 2 ||
      keys.length > 3
    ) {
      throw new Error('Invalid saved game')
    }
    try {
      chess.move({ from: move.from, to: move.to, promotion: move.promotion })
    } catch {
      throw new Error('Invalid saved game')
    }
  }
  return chess
}

export function getStatus(chess: Chess): string {
  if (chess.isCheckmate()) return `Checkmate — ${chess.turn() === 'w' ? 'Black' : 'White'} wins`
  if (chess.isStalemate()) return 'Draw — stalemate'
  if (chess.isThreefoldRepetition()) return 'Draw — threefold repetition'
  if (chess.isDrawByFiftyMoves()) return 'Draw — fifty-move rule'
  if (chess.isInsufficientMaterial()) return 'Draw — insufficient material'
  const side = chess.turn() === 'w' ? 'White' : 'Black'
  return chess.isCheck() ? `Check — ${side} to move` : `${side} to move`
}
