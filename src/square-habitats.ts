import type { PieceSymbol } from "chess.js";

type Point = { x: number; y: number };

const ART_URL = "/assets/checkmate/habitat-squares-v1.webp";
const CACHE_SIZE = 256;
const TYPES: readonly PieceSymbol[] = ["r", "b", "n", "k", "q", "p"];
const ART_INDEX: Record<PieceSymbol, number> = { r: 0, b: 1, n: 2, k: 3, q: 4, p: 5 };

const GROUND: Record<PieceSymbol, { base: string; shade: string; grass: string; stone: string }> = {
  r: { base: "#668465", shade: "#405f52", grass: "#94a96d", stone: "#aab19b" },
  b: { base: "#536d69", shade: "#314d4d", grass: "#77916e", stone: "#a6aaa0" },
  n: { base: "#a78b57", shade: "#795e3d", grass: "#c5a96b", stone: "#c8b48a" },
  k: { base: "#9b8053", shade: "#6b5338", grass: "#b9a267", stone: "#c9b583" },
  q: { base: "#805d42", shade: "#4d392f", grass: "#aa8a57", stone: "#b9a27b" },
  p: { base: "#72844d", shade: "#4b613b", grass: "#a1b75d", stone: "#b7b18c" },
};

let art: HTMLImageElement | null = null;
let artPromise: Promise<void> | null = null;
const cache = new Map<PieceSymbol, HTMLCanvasElement>();
const rimCache = new Map<PieceSymbol, HTMLCanvasElement>();

const hash = (value: number): number => {
  let n = value | 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
};

const seeded = (seed: number, index: number): number => hash(seed + index * 0x9e3779b9) / 0xffffffff;

function newCanvas(size = CACHE_SIZE): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/** Loads the optional square-terrain atlas. Drawing remains deterministic if it is absent. */
export function loadSquareHabitatArt(): Promise<void> {
  if (artPromise) return artPromise;
  artPromise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      art = image;
      cache.clear();
      rimCache.clear();
      resolve();
    };
    image.onerror = () => resolve();
    image.src = ART_URL;
  });
  return artPromise;
}

function drawEdgeMask(ctx: CanvasRenderingContext2D, type: PieceSymbol): void {
  const block = 4;
  const feather = CACHE_SIZE * .10;
  const seed = ART_INDEX[type] * 173 + 29;
  ctx.fillStyle = "#000";
  for (let y = 0; y < CACHE_SIZE; y += block) for (let x = 0; x < CACHE_SIZE; x += block) {
    const cx = x + block / 2;
    const cy = y + block / 2;
    const edge = Math.min(cx, cy, CACHE_SIZE - cx, CACHE_SIZE - cy);
    if (edge >= feather) {
      ctx.globalAlpha = 1;
    } else {
      const noise = (seeded(seed, (x / block) * 71 + y / block) - .5) * block * 2.2;
      const alpha = Math.max(0, Math.min(1, (edge + noise) / feather));
      // A few irregular solid pixels keep the transition naturally ragged rather than airbrushed.
      ctx.globalAlpha = alpha < .13 && seeded(seed, x + y * 257) > .76 ? .36 : alpha;
    }
    if (ctx.globalAlpha > 0) ctx.fillRect(x, y, block, block);
  }
  ctx.globalAlpha = 1;
}

function drawFallback(ctx: CanvasRenderingContext2D, type: PieceSymbol): void {
  const palette = GROUND[type];
  const seed = ART_INDEX[type] * 251 + 41;
  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, CACHE_SIZE, CACHE_SIZE);

  for (let index = 0; index < 74; index++) {
    const x = Math.floor(seeded(seed, index * 3) * CACHE_SIZE / 4) * 4;
    const y = Math.floor(seeded(seed, index * 3 + 1) * CACHE_SIZE / 4) * 4;
    const size = 3 + Math.floor(seeded(seed, index * 3 + 2) * 7);
    ctx.fillStyle = index % 3 === 0 ? palette.shade : palette.grass;
    ctx.globalAlpha = .24 + seeded(seed, index + 101) * .22;
    ctx.fillRect(x, y, size, Math.max(2, Math.floor(size * .46)));
  }

  for (let index = 0; index < 13; index++) {
    const x = Math.floor(seeded(seed, index + 301) * (CACHE_SIZE - 12));
    const y = Math.floor(seeded(seed, index + 337) * (CACHE_SIZE - 12));
    const size = 3 + Math.floor(seeded(seed, index + 373) * 4);
    ctx.fillStyle = palette.stone;
    ctx.globalAlpha = .45;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = palette.shade;
    ctx.fillRect(x + size, y + size, Math.max(2, size - 1), 2);
  }

  // Reeds and low grass: compact vertical marks, never animals or scenery silhouettes.
  for (let index = 0; index < 18; index++) {
    const x = Math.floor(seeded(seed, index + 419) * (CACHE_SIZE - 3));
    const y = Math.floor(seeded(seed, index + 443) * (CACHE_SIZE - 10));
    const height = 4 + Math.floor(seeded(seed, index + 467) * 8);
    ctx.fillStyle = palette.grass;
    ctx.globalAlpha = .65;
    ctx.fillRect(x, y, 2, height);
    if (index % 2 === 0) ctx.fillRect(x + 2, y + 3, 2, Math.max(2, height - 4));
  }
  ctx.globalAlpha = 1;
}

function buildTile(type: PieceSymbol): HTMLCanvasElement {
  const canvas = newCanvas();
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;

  if (art && art.naturalWidth > 0 && art.naturalHeight > 0) {
    const column = ART_INDEX[type] % 3;
    const row = Math.floor(ART_INDEX[type] / 3);
    const cellWidth = art.naturalWidth / 3;
    const cellHeight = art.naturalHeight / 2;
    ctx.drawImage(art, column * cellWidth, row * cellHeight, cellWidth, cellHeight, 0, 0, CACHE_SIZE, CACHE_SIZE);
  } else {
    drawFallback(ctx, type);
  }

  const mask = newCanvas();
  const maskContext = mask.getContext("2d");
  if (!maskContext) return canvas;
  maskContext.imageSmoothingEnabled = false;
  drawEdgeMask(maskContext, type);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

function tileFor(type: PieceSymbol): HTMLCanvasElement {
  let tile = cache.get(type);
  if (!tile) {
    tile = buildTile(type);
    cache.set(type, tile);
  }
  return tile;
}

/** Reuse the terrain's ragged silhouette, keeping soft corners out of the stone grid. */
function rimFor(type: PieceSymbol): HTMLCanvasElement {
  let rim = rimCache.get(type);
  if (!rim) {
    rim = newCanvas();
    const ctx = rim.getContext("2d");
    if (ctx) {
      ctx.drawImage(tileFor(type), 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = GROUND[type].shade;
      ctx.fillRect(0, 0, CACHE_SIZE, CACHE_SIZE);
    }
    rimCache.set(type, rim);
  }
  return rim;
}

/**
 * Draws a pixel-crisp habitat footprint. `center` is the board-square center;
 * the footprint's bottom is anchored to `center.y + tile / 2` as it scales.
 */
export function drawSquareHabitat(
  ctx: CanvasRenderingContext2D,
  type: PieceSymbol,
  center: Point,
  tile: number,
  opacity = 1,
  scale = 1,
): void {
  if (tile <= 0 || opacity <= 0 || scale <= 0) return;
  const size = tile * scale;
  const x = Math.round(center.x - size / 2);
  const y = Math.round(center.y + tile / 2 - size);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const alpha = Math.max(0, Math.min(1, opacity));
  const rim = rimFor(type);
  const depth = Math.max(1, Math.round(size * .035));
  ctx.globalAlpha = alpha * .24;
  ctx.drawImage(rim, x + Math.max(1, Math.round(size * .015)), y + Math.max(2, Math.round(size * .065)), Math.round(size), Math.round(size));
  ctx.globalAlpha = alpha;
  ctx.drawImage(rim, x, y + depth, Math.round(size), Math.round(size));
  ctx.drawImage(tileFor(type), x, y, Math.round(size), Math.round(size));
  ctx.restore();
}
