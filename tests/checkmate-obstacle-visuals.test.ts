import { describe, expect, it } from 'vitest'
import { OBSTACLE_SPRITE_LAYOUT, obstacleGeometry, removedObstacles, towerPerchElevation } from '../src/checkmate/obstacle-art'

describe('checkmate obstacle visuals', () => {
  it('aligns the authored tower deck with the animal foot and projectile baseline', () => {
    const layout = OBSTACLE_SPRITE_LAYOUT.tower
    const renderedHeight = layout.footprint * 562 / 512
    expect(renderedHeight * (layout.groundAnchor - layout.deckAnchor!)).toBeCloseTo(towerPerchElevation([{ kind: 'tower', square: 'd3' }], 'd3'), 2)
  })
  it('gives scenery a full tile presence while elevating only tower occupants', () => {
    expect(obstacleGeometry({ kind: 'wall' }).height).toBeLessThan(obstacleGeometry({ kind: 'tower' }).height)
    expect(obstacleGeometry({ kind: 'wall' }).footprint).toBeGreaterThan(1)
    expect(obstacleGeometry({ kind: 'tower' }).footprint).toBeGreaterThan(1)
    expect(towerPerchElevation([{ kind: 'tower', square: 'd4' }], 'd4')).toBe(obstacleGeometry({ kind: 'tower' }).perchElevation)
    expect(towerPerchElevation([{ kind: 'wall', square: 'd4' }], 'd4')).toBe(0)
  })

  it('finds removed masonry without treating a spent tower as removed', () => {
    const before=[{ kind:'tower' as const, square:'d4', spent:false },{ kind:'wall' as const, square:'e4' }]
    expect(removedObstacles(before,[{ kind:'tower' as const, square:'d4', spent:true }])).toEqual([{ kind:'wall', square:'e4' }])
  })
})
