import type { PieceSymbol, Square } from "chess.js";

export const TERRAIN_TRAIL_RECEDE_MS = 360;
export const TERRAIN_TRAIL_PREVIEW_OPACITY = .50;
export const TERRAIN_TRAIL_FOLLOW_OPACITY = .75;

export type TerrainTrailSample = {
  x: number;
  y: number;
  t: number;
  scale: number;
};

type GridPoint = { x: number; y: number };

const clamp = (value: number, minimum = 0, maximum = 1): number => Math.min(maximum, Math.max(minimum, value));

const smoothstep = (value: number): number => {
  const clamped = clamp(value);
  return clamped * clamped * (3 - 2 * clamped);
};

const hash = (value: number): number => {
  let n = value | 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
};

const toPoint = (square: Square): GridPoint | null => {
  const match = /^([a-h])([1-8])$/.exec(square);
  if (!match) return null;
  return { x: match[1].charCodeAt(0) - 97, y: Number(match[2]) - 1 };
};

const isLegalRoute = (type: PieceSymbol, from: GridPoint, to: GridPoint): boolean => {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  if (dx === 0 && dy === 0) return false;

  switch (type) {
    case "r": return dx === 0 || dy === 0;
    case "b": return dx === dy;
    case "q": return dx === 0 || dy === 0 || dx === dy;
    // Castling is authorized by the engine; this presentation model only needs
    // to render its two-square king route when it is supplied.
    case "k": return Math.max(dx, dy) === 1 || (dx === 2 && dy === 0);
    case "n": return (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
    // Color is deliberately absent from this presentation model, so either board direction is valid.
    case "p": return (dx === 0 && (dy === 1 || dy === 2)) || (dx === 1 && dy === 1);
  }
};

const sampleScale = (from: GridPoint, to: GridPoint, index: number): number => {
  const seed = from.x + from.y * 8 + to.x * 31 + to.y * 67;
  return .70 + (hash(seed + index * 0x9e3779b9) / 0xffffffff) * .08;
};

/**
 * Returns board-space terrain patches for a move. This is presentation-only: it
 * never decides collisions, occupancy, or the move itself.
 */
export function terrainTrailSamples(type: PieceSymbol, from: Square, to: Square): TerrainTrailSample[] {
  const origin = toPoint(from);
  const destination = toPoint(to);
  if (!origin || !destination || !isLegalRoute(type, origin, destination)) return [];

  if (type === "n") {
    return [0, .45, 1].map((t, index) => ({
      x: origin.x + (destination.x - origin.x) * t,
      y: origin.y + (destination.y - origin.y) * t,
      t,
      scale: index === 1 ? .70 : sampleScale(origin, destination, index),
    }));
  }

  const distance = Math.hypot(destination.x - origin.x, destination.y - origin.y);
  const segments = Math.max(1, Math.ceil(distance / .20));
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    return {
      x: origin.x + (destination.x - origin.x) * t,
      y: origin.y + (destination.y - origin.y) * t,
      t,
      scale: sampleScale(origin, destination, index),
    };
  });
}

/** Opacity for one terrain patch as a move trail is previewed, followed, then removed. */
export function terrainTrailOpacity(phase: "preview" | "follow" | "recede", progress: number, t: number): number {
  if (phase === "preview") return TERRAIN_TRAIL_PREVIEW_OPACITY;
  if (phase === "follow") return TERRAIN_TRAIL_FOLLOW_OPACITY;

  const clampedProgress = clamp(progress);
  if (clampedProgress === 0) return TERRAIN_TRAIL_FOLLOW_OPACITY;
  if (clampedProgress === 1) return 0;

  // The fading edge travels origin-to-destination. Its soft edge avoids popping
  // individual patches while preserving the tail until the edge reaches it.
  const retreat = clamp((clampedProgress - .05) / .95);
  return TERRAIN_TRAIL_FOLLOW_OPACITY * smoothstep((clamp(t) - retreat) / .22);
}
