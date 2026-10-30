import { describe, expect, it } from "vitest";
import { TERRAIN_TRAIL_RECEDE_MS, terrainTrailOpacity, terrainTrailSamples } from "../src/terrain-trail";

describe("terrain trail", () => {
  it("samples legal linear routes in every board direction", () => {
    const routes = [
      terrainTrailSamples("r", "a1", "a8"),
      terrainTrailSamples("r", "h8", "a8"),
      terrainTrailSamples("b", "a1", "h8"),
      terrainTrailSamples("b", "h1", "a8"),
    ];

    for (const route of routes) {
      expect(route.length).toBeGreaterThan(2);
      expect(route[0].t).toBe(0);
      expect(route.at(-1)?.t).toBe(1);
      for (const patch of route) {
        expect(patch.x).toBeGreaterThanOrEqual(0);
        expect(patch.x).toBeLessThanOrEqual(7);
        expect(patch.y).toBeGreaterThanOrEqual(0);
        expect(patch.y).toBeLessThanOrEqual(7);
        expect(patch.scale).toBeGreaterThanOrEqual(.70);
        expect(patch.scale).toBeLessThanOrEqual(.78);
      }
    }
  });

  it("returns no trail for stationary and geometrically invalid routes", () => {
    expect(terrainTrailSamples("q", "d4", "d4")).toEqual([]);
    expect(terrainTrailSamples("r", "a1", "b2")).toEqual([]);
  });

  it("renders the engine-authorized king castling route", () => {
    const patches = terrainTrailSamples("k", "e1", "g1");
    expect(patches[0]).toMatchObject({ x: 4, y: 0, t: 0 });
    expect(patches.at(-1)).toMatchObject({ x: 6, y: 0, t: 1 });
  });

  it("uses discrete hare landing patches rather than a continuous route", () => {
    const patches = terrainTrailSamples("n", "b1", "c3");
    expect(patches.map(patch => patch.t)).toEqual([0, .45, 1]);
    expect(patches[1].scale).toBe(.70);
  });

  it("clamps opacity inputs and recedes from origin before the tail", () => {
    expect(terrainTrailOpacity("preview", -10, 4)).toBe(.25);
    expect(terrainTrailOpacity("follow", 10, -4)).toBe(.45);
    expect(terrainTrailOpacity("recede", 0, 0)).toBe(.45);
    expect(terrainTrailOpacity("recede", .5, 0)).toBeLessThan(terrainTrailOpacity("recede", .5, 1));
    expect(terrainTrailOpacity("recede", 1, .5)).toBe(0);
    expect(TERRAIN_TRAIL_RECEDE_MS).toBe(360);
  });

  it("is deterministic without random sampling", () => {
    expect(terrainTrailSamples("q", "a1", "h8")).toEqual(terrainTrailSamples("q", "a1", "h8"));
  });
});
