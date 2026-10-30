export type CourtyardProject = (x: number, y: number) => { x: number; y: number };

/** Matte palette kept separate so the board frame can reuse the same materials. */
export const COURTYARD_PALETTE = {
  light: "#d4d2cc",
  lightStone: "#bcbab4",
  lightShade: "#9c9ca0",
  dark: "#3a3d42",
  darkStone: "#4d5055",
  darkShade: "#292c31",
  grout: "#202226",
} as const;

type Point = { x: number; y: number };
type CachedCourtyard = { key: string; canvas: HTMLCanvasElement; x: number; y: number };

const courtyardCache: CachedCourtyard[] = [];
let courtyardArt: HTMLImageElement | null = null;
let courtyardArtLoad: Promise<void> | null = null;

const clearCourtyardCache = (): void => { courtyardCache.length = 0; };

/** Optional atlas loader. Failure leaves the neutral procedural paving in place. */
export function loadCourtyardArt(): Promise<void> {
  if (courtyardArt) return Promise.resolve();
  if (courtyardArtLoad) return courtyardArtLoad;
  courtyardArtLoad = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      courtyardArt = image;
      clearCourtyardCache();
      resolve();
    };
    image.onerror = () => resolve();
    image.src = "/assets/checkmate/courtyard-stone-v1.webp";
  });
  return courtyardArtLoad;
}

const hash = (value: number): number => {
  let n = value | 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
};

const variation = (seed: number, step: number): number => hash(seed + step * 0x9e3779b9) / 0xffffffff;

const pointInTile = (corners: readonly Point[], u: number, v: number): Point => {
  const top = { x: corners[0].x + (corners[1].x - corners[0].x) * u, y: corners[0].y + (corners[1].y - corners[0].y) * u };
  const bottom = { x: corners[3].x + (corners[2].x - corners[3].x) * u, y: corners[3].y + (corners[2].y - corners[3].y) * u };
  return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
};

const polygon = (ctx: CanvasRenderingContext2D, points: readonly Point[]): void => {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) ctx.lineTo(points[index].x, points[index].y);
  ctx.closePath();
};

const roundedCobble = (ctx: CanvasRenderingContext2D, corners: readonly Point[], u: number, v: number, width: number, height: number, wobble: number): void => {
  const inset = Math.min(width, height) * .16;
  const points = [
    pointInTile(corners, u + inset + wobble, v + wobble),
    pointInTile(corners, u + width - inset, v - wobble),
    pointInTile(corners, u + width + wobble, v + inset),
    pointInTile(corners, u + width - wobble, v + height - inset),
    pointInTile(corners, u + width - inset, v + height + wobble),
    pointInTile(corners, u + inset, v + height - wobble),
    pointInTile(corners, u - wobble, v + height - inset),
    pointInTile(corners, u + wobble, v + inset),
  ];
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) {
    const next = points[(index + 1) % points.length];
    ctx.quadraticCurveTo(points[index].x, points[index].y, (points[index].x + next.x) / 2, (points[index].y + next.y) / 2);
  }
  ctx.closePath();
};

const drawAtlasTile = (ctx: CanvasRenderingContext2D, image: HTMLImageElement, cell: number, corners: readonly Point[]): void => {
  const sourceWidth = image.naturalWidth / 2;
  const sourceHeight = image.naturalHeight;
  const xAxis = { x: (corners[1].x - corners[0].x) / sourceWidth, y: (corners[1].y - corners[0].y) / sourceWidth };
  const yAxis = { x: (corners[3].x - corners[0].x) / sourceHeight, y: (corners[3].y - corners[0].y) / sourceHeight };
  ctx.save();
  ctx.transform(xAxis.x, xAxis.y, yAxis.x, yAxis.y, corners[0].x, corners[0].y);
  ctx.drawImage(image, cell * sourceWidth, 0, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  ctx.restore();
};

const paintCourtyardTiles = (ctx: CanvasRenderingContext2D, project: CourtyardProject, tile: number): void => {
  const groutWidth = Math.max(1, Math.round(tile * .026));
  const cobblesPerRow = 3;
  const cobbleRows = 3;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let row = 0; row < 8; row++) for (let column = 0; column < 8; column++) {
    const corners = [project(column, row), project(column + 1, row), project(column + 1, row + 1), project(column, row + 1)];
    const light = (row + column) % 2 === 0;
    const seed = hash(row * 8 + column + 91);
    const base = light ? COURTYARD_PALETTE.light : COURTYARD_PALETTE.dark;
    const stone = light ? COURTYARD_PALETTE.lightStone : COURTYARD_PALETTE.darkStone;
    const shade = light ? COURTYARD_PALETTE.lightShade : COURTYARD_PALETTE.darkShade;

    polygon(ctx, corners);
    ctx.fillStyle = base;
    ctx.fill();
    ctx.save();
    polygon(ctx, corners);
    ctx.clip();
    if (courtyardArt) {
      drawAtlasTile(ctx, courtyardArt, light ? 0 : 1, corners);
    } else {
      const gutter = .045;
      const cellWidth = (1 - gutter * 2) / cobblesPerRow;
      const cellHeight = (1 - gutter * 2) / cobbleRows;
      for (let y = 0; y < cobbleRows; y++) for (let x = 0; x < cobblesPerRow; x++) {
        const index = y * cobblesPerRow + x;
        const jitterX = (variation(seed, index * 3) - .5) * .020;
        const jitterY = (variation(seed, index * 3 + 1) - .5) * .020;
        const width = cellWidth * (.90 + variation(seed, index * 3 + 2) * .06);
        const height = cellHeight * (.89 + variation(seed, index * 3 + 3) * .07);
        const u = gutter + x * cellWidth + (cellWidth - width) / 2 + jitterX;
        const v = gutter + y * cellHeight + (cellHeight - height) / 2 + jitterY;
        roundedCobble(ctx, corners, u, v, width, height, (variation(seed, index * 5 + 4) - .5) * .012);
        ctx.fillStyle = variation(seed, index * 7 + 2) > .56 ? stone : shade;
        ctx.fill();
        if (variation(seed, index * 11 + 8) > .64) {
          const chip = pointInTile(corners, u + width * .28, v + height * .30);
          const px = Math.max(1, Math.round(tile * .018));
          ctx.fillStyle = light ? "#e1e0dc" : "#60646b";
          ctx.fillRect(Math.round(chip.x), Math.round(chip.y), px, px);
        }
      }
    }
    ctx.restore();

    polygon(ctx, corners);
    ctx.strokeStyle = COURTYARD_PALETTE.grout;
    ctx.lineWidth = groutWidth;
    ctx.stroke();
  }
  ctx.restore();
};

/**
 * Paints a deterministic, perspective-safe courtyard. `project` receives board-grid
 * coordinates: (0, 0) through (8, 8), in physical display order. The two most
 * recent projected boards are retained as textures, making idle redraws one blit.
 */
export function drawCourtyardTiles(ctx: CanvasRenderingContext2D, project: CourtyardProject, tile: number): void {
  const grid = Array.from({ length: 9 }, (_, y) => Array.from({ length: 9 }, (_, x) => project(x, y)));
  const key = `${tile}|${grid.flat().map(point => `${point.x},${point.y}`).join(";")}`;
  const cached = courtyardCache.find(entry => entry.key === key);
  if (cached) {
    ctx.drawImage(cached.canvas, cached.x, cached.y);
    return;
  }

  const points = grid.flat();
  const padding = Math.max(3, Math.ceil(tile * .05));
  const left = Math.floor(Math.min(...points.map(point => point.x)) - padding);
  const top = Math.floor(Math.min(...points.map(point => point.y)) - padding);
  const right = Math.ceil(Math.max(...points.map(point => point.x)) + padding);
  const bottom = Math.ceil(Math.max(...points.map(point => point.y)) + padding);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, right - left);
  canvas.height = Math.max(1, bottom - top);
  const cacheContext = canvas.getContext("2d");
  if (!cacheContext) {
    paintCourtyardTiles(ctx, project, tile);
    return;
  }
  cacheContext.imageSmoothingEnabled = false;
  paintCourtyardTiles(cacheContext, (x, y) => {
    const point = grid[y][x];
    return { x: point.x - left, y: point.y - top };
  }, tile);
  const entry = { key, canvas, x: left, y: top };
  courtyardCache.unshift(entry);
  if (courtyardCache.length > 2) courtyardCache.pop();
  ctx.drawImage(canvas, left, top);
}
