export interface InspectionRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface InspectionSize {
  width: number
  height: number
}

export interface InspectionPlacement {
  left: number
  top: number
  side: 'left' | 'right' | 'above' | 'below'
}

type Side = InspectionPlacement['side']
type Candidate = InspectionPlacement
type Point = { x: number; y: number }

const margin = 10

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function overlaps(a: InspectionRect, b: InspectionRect): number {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
}

function rect(candidate: Candidate, size: InspectionSize): InspectionRect {
  return { left: candidate.left, top: candidate.top, right: candidate.left + size.width, bottom: candidate.top + size.height, width: size.width, height: size.height }
}

function contains(rectangle: InspectionRect, point: Point): boolean {
  return point.x >= rectangle.left && point.x <= rectangle.right && point.y >= rectangle.top && point.y <= rectangle.bottom
}

function expandedCorners(rectangle: InspectionRect, padding: number): Point[] {
  return [
    { x: rectangle.left - padding, y: rectangle.top - padding },
    { x: rectangle.right + padding, y: rectangle.top - padding },
    { x: rectangle.right + padding, y: rectangle.bottom + padding },
    { x: rectangle.left - padding, y: rectangle.bottom + padding },
  ]
}

function cross(origin: Point, a: Point, b: Point): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y).filter((point, index, all) => index === 0 || point.x !== all[index - 1].x || point.y !== all[index - 1].y)
  if (sorted.length <= 1) return sorted
  const half = (items: Point[]): Point[] => {
    const hull: Point[] = []
    for (const point of items) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop()
      hull.push(point)
    }
    return hull
  }
  const lower = half(sorted)
  const upper = half([...sorted].reverse())
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function insideConvexHull(point: Point, hull: Point[]): boolean {
  if (hull.length === 0) return false
  if (hull.length === 1) return point.x === hull[0].x && point.y === hull[0].y
  if (hull.length === 2) return Math.abs(cross(hull[0], hull[1], point)) < 0.0001 && point.x >= Math.min(hull[0].x, hull[1].x) && point.x <= Math.max(hull[0].x, hull[1].x) && point.y >= Math.min(hull[0].y, hull[1].y) && point.y <= Math.max(hull[0].y, hull[1].y)
  let positive = false
  let negative = false
  for (let index = 0; index < hull.length; index++) {
    const value = cross(hull[index], hull[(index + 1) % hull.length], point)
    positive ||= value > 0.0001
    negative ||= value < -0.0001
    if (positive && negative) return false
  }
  return true
}

/** Returns the finite pointer bridge between a card's home and its reader. */
export function inInspectionCorridor(x: number, y: number, homeRect: InspectionRect, readerRect: InspectionRect, padding = 10): boolean {
  const point = { x, y }
  const home = { ...homeRect, left: homeRect.left - padding, top: homeRect.top - padding, right: homeRect.right + padding, bottom: homeRect.bottom + padding }
  const reader = { ...readerRect, left: readerRect.left - padding, top: readerRect.top - padding, right: readerRect.right + padding, bottom: readerRect.bottom + padding }
  return contains(home, point) || contains(reader, point) || insideConvexHull(point, convexHull([...expandedCorners(homeRect, padding), ...expandedCorners(readerRect, padding)]))
}

/** Places the reader beside its source without needlessly covering the board. */
export function placeInspection(anchor: InspectionRect, size: InspectionSize, viewport: InspectionSize, board?: InspectionRect, preferredSide?: 'left' | 'right'): InspectionPlacement {
  const bottomInset = viewport.height < 500 ? 8 : 10
  const minX = margin
  const maxX = viewport.width - size.width - margin
  const minY = 54
  const maxY = viewport.height - size.height - bottomInset
  const centerX = anchor.left + anchor.width / 2
  const centerY = anchor.top + anchor.height / 2
  const origin = {
    left: anchor.left - 8,
    top: anchor.top - 8,
    right: anchor.right + 8,
    bottom: anchor.bottom + 8,
    width: anchor.width + 16,
    height: anchor.height + 16,
  }
  const sourceCandidates: Candidate[] = [
    { side: 'left', left: anchor.left - size.width - margin, top: clamp(centerY - size.height / 2, minY, maxY) },
    { side: 'right', left: anchor.right + margin, top: clamp(centerY - size.height / 2, minY, maxY) },
    { side: 'above', left: centerX - size.width / 2, top: anchor.top - size.height - margin },
    { side: 'below', left: centerX - size.width / 2, top: anchor.bottom + margin },
  ]
  const fits = (candidate: Candidate, outsideBoard = false): boolean => {
    const placement = rect(candidate, size)
    return candidate.left >= minX && candidate.left <= maxX && candidate.top >= minY && candidate.top <= maxY && overlaps(placement, origin) === 0 && (!outsideBoard || !board || overlaps(placement, board) === 0)
  }

  if (board) {
    const gutter = (side: 'left' | 'right'): Candidate => ({
      side,
      left: side === 'left' ? board.left - size.width - margin : board.right + margin,
      top: clamp(centerY - size.height / 2, minY, maxY),
    })
    const nearest: 'left' | 'right' = centerX <= board.left + board.width / 2 ? 'left' : 'right'
    const gutters = [gutter(nearest), gutter(nearest === 'left' ? 'right' : 'left')]
    const preferred = preferredSide ? gutters.find(candidate => candidate.side === preferredSide) : undefined
    if (preferred && fits(preferred, true)) return preferred
    const usableGutter = gutters.find(candidate => fits(candidate, true))
    if (usableGutter) return usableGutter
  }

  const preferredSource = preferredSide ? sourceCandidates.find(candidate => candidate.side === preferredSide) : undefined
  if (preferredSource && fits(preferredSource)) return preferredSource
  const fullyFitting = sourceCandidates.find(candidate => fits(candidate))
  if (fullyFitting) return fullyFitting

  const fallback = sourceCandidates.map(candidate => ({
    ...candidate,
    left: clamp(candidate.left, minX, maxX),
    top: clamp(candidate.top, minY, maxY),
  })).sort((a, b) => {
    const aRect = rect(a, size)
    const bRect = rect(b, size)
    const aOverlap = overlaps(aRect, origin) * 3 + (board ? overlaps(aRect, board) : 0)
    const bOverlap = overlaps(bRect, origin) * 3 + (board ? overlaps(bRect, board) : 0)
    return aOverlap - bOverlap
  })[0]

  return fallback
}
