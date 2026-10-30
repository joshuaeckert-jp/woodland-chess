import { describe, expect, it } from 'vitest'
import { DEPLOYMENT_DURATION, deploymentFrameAt } from '../src/BoardRenderer'

describe('deployment animation timing', () => {
  it('uses a fixed, readable arrival duration', () => {
    expect(DEPLOYMENT_DURATION).toBe(1600)
  })

  it('grounds the habitat before the animal appears', () => {
    const beforeGround = deploymentFrameAt(.33)
    const grounded = deploymentFrameAt(.58)
    const beforeAnimal = deploymentFrameAt(.59)
    const animal = deploymentFrameAt(.72)
    expect(beforeGround.habitatOpacity).toBe(0)
    expect(grounded.habitatOpacity).toBe(1)
    expect(grounded.habitatScale).toBe(1)
    expect(beforeAnimal.animalOpacity).toBe(0)
    expect(animal.animalOpacity).toBe(1)
    expect(animal.animalStage).toBe('arrive')
  })

  it('clamps safely and finishes seated at rest', () => {
    expect(deploymentFrameAt(-1)).toEqual(deploymentFrameAt(0))
    expect(deploymentFrameAt(2)).toEqual(deploymentFrameAt(1))
    expect(deploymentFrameAt(1)).toMatchObject({ habitatOpacity: 1, habitatScale: 1, animalOpacity: 1, animalStage: 'rest' })
  })
})
