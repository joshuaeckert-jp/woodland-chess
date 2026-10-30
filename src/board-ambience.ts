import type { PieceSymbol } from "chess.js";

export const BOARD_AMBIENCE_FRAME_MS = 84;

export type IdlePose = {
  animalY: number;
  animalScale: number;
  grassSway: number;
  ripple: number;
};

const offsetFor = (index: number) => ((index * 47) % 31) / 31 * Math.PI * 2;

/**
 * A small, deterministic rest pose. Values are tile-relative so the same pose
 * remains quiet at every board size and never reads as a square-to-square move.
 */
export function idlePoseForPiece(type: PieceSymbol, index: number, now: number, tile: number): IdlePose {
  const phase = now / 1000 * (.54 + (index % 3) * .07) + offsetFor(index);
  const breath = .5 + Math.sin(phase) * .5;
  const pause = Math.sin(phase * .37 + index) > -.35 ? 1 : .24;
  const lift = type === "r" ? .004 : type === "p" ? .006 : type === "n" ? .009 : .007;
  return {
    animalY: -tile * lift * breath * pause,
    animalScale: 1 + (type === "r" ? .003 : .006) * breath * pause,
    grassSway: Math.sin(phase * .82) * pause,
    ripple: type === "r" ? (.5 + Math.sin(phase * 1.35) * .5) : 0,
  };
}

export function rimMoteAt(index: number, now: number): { edge: "left" | "right" | "top"; progress: number; drift: number } {
  const phase = now / 1000 * (.032 + (index % 2) * .006) + index * .173;
  const progress = phase - Math.floor(phase);
  return {
    edge: index % 3 === 0 ? "top" : index % 2 === 0 ? "left" : "right",
    progress,
    drift: Math.sin(phase * Math.PI * 2) * .5 + .5,
  };
}

export function canRunBoardAmbience(input: {
  reducedMotion: boolean;
  documentHidden: boolean;
  canvasVisible: boolean;
  actionActive: boolean;
  dragActive: boolean;
  celebrationActive: boolean;
  settingEnabled: boolean;
}): boolean {
  return !input.reducedMotion && !input.documentHidden && input.canvasVisible && !input.actionActive
    && !input.dragActive && !input.celebrationActive && input.settingEnabled;
}
