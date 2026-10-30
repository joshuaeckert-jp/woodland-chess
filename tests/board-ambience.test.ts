import { describe, expect, it } from "vitest";
import { canRunBoardAmbience, idlePoseForPiece, rimMoteAt } from "../src/board-ambience";

describe("board ambience", () => {
  it("keeps idle motion smaller than a visible square transition", () => {
    const pose = idlePoseForPiece("n", 4, 1200, 100);
    expect(Math.abs(pose.animalY)).toBeLessThan(1);
    expect(pose.animalScale).toBeLessThan(1.01);
  });

  it("only runs while the board can be safely redrawn", () => {
    const base = { reducedMotion: false, documentHidden: false, canvasVisible: true, actionActive: false, dragActive: false, celebrationActive: false, settingEnabled: true };
    expect(canRunBoardAmbience(base)).toBe(true);
    expect(canRunBoardAmbience({ ...base, actionActive: true })).toBe(false);
    expect(canRunBoardAmbience({ ...base, documentHidden: true })).toBe(false);
    expect(canRunBoardAmbience({ ...base, settingEnabled: false })).toBe(false);
  });

  it("gives rim motes deterministic bounded positions", () => {
    const mote = rimMoteAt(2, 9837);
    expect(mote.progress).toBeGreaterThanOrEqual(0);
    expect(mote.progress).toBeLessThan(1);
    expect(mote.drift).toBeGreaterThanOrEqual(0);
    expect(mote.drift).toBeLessThanOrEqual(1);
  });
});
