import { describe, expect, it } from 'vitest'
import { inInspectionCorridor, placeInspection, type InspectionRect } from '../src/checkmate/inspection-placement'

const reader = { width: 280, height: 360 }
const viewport = { width: 1280, height: 900 }
const board: InspectionRect = { left: 400, top: 160, right: 880, bottom: 640, width: 480, height: 480 }
const rect = (left: number, top: number, width: number, height: number): InspectionRect => ({ left, top, width, height, right: left + width, bottom: top + height })

describe('placeInspection', () => {
  it('uses the board gutter nearest the source horizontal half when it fits', () => {
    expect(placeInspection(rect(500, 330, 64, 78), reader, viewport, board)).toEqual({ left: 110, top: 189, side: 'left' })
    expect(placeInspection(rect(740, 330, 64, 78), reader, viewport, board)).toEqual({ left: 890, top: 189, side: 'right' })
  })

  it('keeps a tall reader in its board gutter near a bottom source', () => {
    expect(placeInspection(rect(500, 760, 64, 78), { width: 280, height: 500 }, viewport, board)).toEqual({ left: 110, top: 390, side: 'left' })
  })

  it('places a source at either viewport edge on its available horizontal side', () => {
    expect(placeInspection(rect(16, 300, 64, 78), reader, viewport)).toMatchObject({ left: 90, side: 'right' })
    expect(placeInspection(rect(1200, 300, 64, 78), reader, viewport)).toMatchObject({ left: 910, side: 'left' })
  })

  it('keeps a narrow near-bottom placement inside the safe viewport', () => {
    const placement = placeInspection(rect(154, 760, 64, 70), { width: 240, height: 180 }, { width: 390, height: 844 })
    expect(placement.top).toBeLessThanOrEqual(654)
    expect(placement.top).toBeGreaterThanOrEqual(54)
    expect(placement.left).toBeGreaterThanOrEqual(10)
    expect(placement.left + 240).toBeLessThanOrEqual(380)
  })

  it('uses the shorter landscape bottom inset while retaining the top safe area', () => {
    const placement = placeInspection(rect(140, 170, 64, 60), { width: 250, height: 170 }, { width: 568, height: 320 })
    expect(placement.top).toBeGreaterThanOrEqual(54)
    expect(placement.top + 170).toBeLessThanOrEqual(312)
  })

  it('remains clamped and deterministic at the 320px minimum width', () => {
    const placement = placeInspection(rect(120, 300, 64, 70), { width: 280, height: 240 }, { width: 320, height: 640 })
    expect(placement.left).toBeGreaterThanOrEqual(10)
    expect(placement.left + 280).toBeLessThanOrEqual(310)
    expect(placement.top).toBeGreaterThanOrEqual(54)
    expect(placement.top + 240).toBeLessThanOrEqual(630)
  })

  it('keeps a fitting preferred gutter side stable', () => {
    expect(placeInspection(rect(1000, 330, 64, 78), reader, viewport, board, 'left')).toEqual({ left: 110, top: 189, side: 'left' })
  })
})

describe('inInspectionCorridor', () => {
  const home = rect(610, 70, 60, 60)
  const reader = rect(0, 54, 316, 496)

  it('keeps the finite diagonal bridge from the home card to its reader', () => {
    expect(inInspectionCorridor(170, 300, home, reader)).toBe(true)
    expect(inInspectionCorridor(480, 180, home, reader)).toBe(true)
    expect(inInspectionCorridor(780, 300, home, reader)).toBe(false)
  })

  it('supports the analogous vertical bridge without widening into a half-plane', () => {
    const lowerHome = rect(300, 650, 60, 60)
    const upperReader = rect(200, 54, 280, 226)
    expect(inInspectionCorridor(330, 420, lowerHome, upperReader)).toBe(true)
    expect(inInspectionCorridor(90, 420, lowerHome, upperReader)).toBe(false)
  })

  it('accepts an identical home and reader rectangle without producing an unbounded corridor', () => {
    const same = rect(200, 200, 80, 120)
    expect(inInspectionCorridor(240, 260, same, same)).toBe(true)
    expect(inInspectionCorridor(500, 260, same, same)).toBe(false)
  })
})
