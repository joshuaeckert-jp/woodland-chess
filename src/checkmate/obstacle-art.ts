/** Renderer-local obstacle data. Keeping this separate avoids an engine dependency in BoardRenderer. */
export type BoardObstacle = { kind: 'wall' | 'tower'; square: string; spent?: boolean }

export type ObstacleGeometry = {
  footprint: number
  height: number
  perchElevation: number
}

export type ObstacleSpriteLayout = {
  footprint: number
  groundAnchor: number
  deckAnchor?: number
}

export const OBSTACLE_SPRITE_LAYOUT: Record<BoardObstacle['kind'], ObstacleSpriteLayout> = {
  wall: { footprint: 1.28, groundAnchor: .85 },
  tower: { footprint: 1.28, groundAnchor: .86, deckAnchor: .24 },
}

/** Tile-unit dimensions deliberately leave corners readable on the projected board. */
export function obstacleGeometry(obstacle: Pick<BoardObstacle, 'kind'>): ObstacleGeometry {
  return obstacle.kind === 'tower'
    // The perch is measured from the shared ground baseline (+.18 tile), not
    // from an animal's habitat baseline. This keeps every atlas's feet on stone.
    ? { footprint: OBSTACLE_SPRITE_LAYOUT.tower.footprint, height: 1.28 * 562 / 512, perchElevation: 1.28 * 562 / 512 * (.86 - .24) }
    : { footprint: OBSTACLE_SPRITE_LAYOUT.wall.footprint, height: .84 * 1.28 / 1.10, perchElevation: 0 }
}

export function towerPerchElevation(obstacles: readonly BoardObstacle[], square: string): number {
  const obstacle = obstacles.find(value => value.square === square)
  return obstacle?.kind === 'tower' ? obstacleGeometry(obstacle).perchElevation : 0
}

export function removedObstacles(before: readonly BoardObstacle[], after: readonly BoardObstacle[]): BoardObstacle[] {
  return before.filter(obstacle => !after.some(next => next.square === obstacle.square && next.kind === obstacle.kind))
}
