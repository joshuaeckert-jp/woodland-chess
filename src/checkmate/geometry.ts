import type { Side, Square } from './types'

const files = 'abcdefgh'
export const squares = Array.from({ length: 64 }, (_, i) => `${files[i % 8]}${Math.floor(i / 8) + 1}` as Square)
export const point = (square: Square) => ({ x: files.indexOf(square[0]), y: Number(square[1]) - 1 })
export const squareAt = (x: number, y: number): Square | null => x >= 0 && x < 8 && y >= 0 && y < 8 ? `${files[x]}${y + 1}` as Square : null
export const chebyshev = (a: Square, b: Square) => Math.max(Math.abs(point(a).x - point(b).x), Math.abs(point(a).y - point(b).y))
export const orthogonalOrDiagonal = (a: Square, b: Square) => { const A = point(a), B = point(b); const dx = Math.abs(A.x - B.x), dy = Math.abs(A.y - B.y); return dx === 0 || dy === 0 || dx === dy }
export function between(a: Square, b: Square): Square[] {
  const A = point(a), B = point(b), dx = Math.sign(B.x - A.x), dy = Math.sign(B.y - A.y)
  if (!orthogonalOrDiagonal(a, b)) return []
  const result: Square[] = []; for (let x = A.x + dx, y = A.y + dy; x !== B.x || y !== B.y; x += dx, y += dy) { const square = squareAt(x, y); if (square) result.push(square) }
  return result
}
export const pawnForward = (side: Side) => side === 'w' ? 1 : -1
export const lastRank = (side: Side) => side === 'w' ? 8 : 1
export const homePawnRank = (side: Side) => side === 'w' ? 2 : 7
export const deploymentRank = (side: Side, square: Square) => side === 'w' ? Number(square[1]) <= 2 : Number(square[1]) >= 7
