import { OBSTACLE_SPRITE_LAYOUT, type BoardObstacle } from './obstacle-art'

/** Retain the building, blending only its baked diamond pad into the board's square foundation. */
export function createAlignedStructureSprite(image: HTMLImageElement, kind: BoardObstacle['kind']): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, 0, 0)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const width = canvas.width, height = canvas.height, tile = width / OBSTACLE_SPRITE_LAYOUT[kind].footprint
  const band = kind === 'wall' ? .60 : .70, fadeStart = kind === 'wall' ? .80 : .84
  const contactEnd = kind === 'wall' ? .89 : .90, contactHalf = kind === 'wall' ? .26 : .22
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  for (let y = Math.ceil(height * band); y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4 + 3
    if (!pixels.data[at]) continue
    const v = y / height, distance = Math.abs(x - width / 2)
    const sides = clamp((tile * .55 - distance) / (tile * .035))
    const enter = clamp((v - band) / .045)
    const vertical = 1 - clamp((v - fadeStart) / (.985 - fadeStart))
    const lane = clamp((width * contactHalf - distance) / (tile * .04)) * (1 - clamp((v - contactEnd) / .06))
    const alpha = (1 - enter + enter * sides) * Math.max(vertical, lane)
    // Stepped alpha keeps the foliage fringe crisp instead of blurring the original RGB art.
    pixels.data[at] = Math.round(pixels.data[at] * Math.round(alpha * 8) / 8)
  }
  ctx.putImageData(pixels, 0, 0)
  return canvas
}
