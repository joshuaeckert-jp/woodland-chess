import { describe, expect, it } from "vitest";
import { animationStageAt, captureLayoutAt, createMovePlan, projectSquarePolygon, restFrameForPiece } from "../src/BoardRenderer";

describe("createMovePlan", () => {
  it("uses rear walking frames for upward travel", () => {
    const plan = createMovePlan("e2", "e4");
    expect(plan.walkFrames).toEqual([6, 7]);
    expect(plan.departureFrame).toBe(3);
  });

  it("uses front walking frames for downward travel", () => {
    const plan = createMovePlan("e7", "e5");
    expect(plan.walkFrames).toEqual([4, 5]);
  });

  it("uses display direction when the board is flipped", () => {
    expect(createMovePlan("e2", "e4", false, true).walkFrames).toEqual([4, 5]);
  });

  it("uses the slower requested duration bands", () => {
    expect(createMovePlan("a2", "a3").duration).toBeGreaterThanOrEqual(1300);
    expect(createMovePlan("a1", "h8").duration).toBeLessThanOrEqual(1800);
    expect(createMovePlan("a2", "a3", true).duration).toBeGreaterThanOrEqual(2200);
    expect(createMovePlan("a1", "h8", true).duration).toBeLessThanOrEqual(2600);
  });

  it("retains capture intent for the attack sequence", () => {
    expect(createMovePlan("e4", "d5", true).hasCapture).toBe(true);
  });

  it("keeps habitat travel separate from animal motion stages", () => {
    expect(animationStageAt(.17, false)).toBe("habitat");
    expect(animationStageAt(.18, false)).toBe("rise");
    expect(animationStageAt(.30, false)).toBe("turn-away");
    expect(animationStageAt(.38, false)).toBe("chase");
    expect(animationStageAt(.90, false)).toBe("turn-back");
    expect(animationStageAt(.94, false)).toBe("settle");
    expect(animationStageAt(.99, false)).toBe("sit");
  });

  it("reserves the attack window for captures only", () => {
    expect(animationStageAt(.80, true)).toBe("attack");
    expect(animationStageAt(.80, false)).toBe("turn-back");
  });

  it("plans mirrored side-stepping for a leftward lateral move", () => {
    const plan = createMovePlan("e4", "d4");
    expect(plan.facing).toBe("side");
    expect(plan.walkFrames).toEqual([2, 11]);
    expect(plan.mirror).toBe(true);
  });

  it("keeps both capture habitats in distinct corners then reclaims the tile", () => {
    expect(captureLayoutAt(.09).active).toBe(false);
    expect(captureLayoutAt(.10).active).toBe(true);
    const encounter = captureLayoutAt(.80);
    expect(encounter.defender).toMatchObject({ x: .2, y: -.18, scale: .72, opacity: 1 });
    expect(encounter.incoming).toMatchObject({ x: -.1, y: .1, scale: .78 });
    const reclaimed = captureLayoutAt(.95);
    expect(reclaimed.reclaim).toBe(true);
    expect(reclaimed.defender.opacity).toBeLessThan(1);
    expect(reclaimed.incoming.scale).toBeGreaterThan(.78);
  });

  it("projects every square inside the full board image", () => {
    for (const file of "abcdefgh") for (const rank of "12345678") {
      for (const point of projectSquarePolygon(`${file}${rank}` as never)) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(1);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("uses supplied exact projected corners and flips physical square placement", () => {
    const a8 = projectSquarePolygon("a8");
    expect(a8[0]).toEqual({ x: 136 / 1254, y: 98 / 1254 });
    const h1 = projectSquarePolygon("h1");
    expect(h1[2]).toEqual({ x: 1137 / 1254, y: 1084 / 1254 });
    expect(projectSquarePolygon("a8", true)).toEqual(h1);
  });

  it("shows the viewer-near army from behind so both sides face their enemy", () => {
    expect(restFrameForPiece("w", false)).toBe(16);
    expect(restFrameForPiece("b", false)).toBe(0);
    expect(restFrameForPiece("w", true)).toBe(0);
    expect(restFrameForPiece("b", true)).toBe(16);
  });
});

import { isFlightFrame, speciesMotion } from '../src/BoardRenderer'
describe('species movement continuity', () => {
  it('keeps rear seated and rising raven frames grounded', () => {
    expect(isFlightFrame(16)).toBe(false)
    expect(isFlightFrame(17)).toBe(false)
    expect(speciesMotion('b',16,0,100)).toEqual({x:0,y:0})
    expect(speciesMotion('b',14,.5,100).y).toBeLessThan(-20)
  })
  it('lets the hare land between its three hops', () => {
    expect(Math.abs(speciesMotion('n',4,1/3,100).y)).toBeLessThan(.001)
    expect(speciesMotion('n',4,1/6,100).y).toBeCloseTo(-25)
  })
})
