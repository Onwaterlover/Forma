import { describe, expect, it } from "vitest";
import { adjustRest, pauseRest, restLeftMs, resumeRest, startRest } from "./rest-timer";

describe("rest timer", () => {
  it("counts down, freezes while paused and continues from where it stopped", () => {
    const r = startRest(90, 0);
    expect(restLeftMs(r, 30_000)).toBe(60_000);
    const p = pauseRest(r, 30_000);
    expect(restLeftMs(p, 100_000)).toBe(60_000);
    expect(pauseRest(p, 50_000)).toBe(p); // pausing twice changes nothing
    const q = resumeRest(p, 100_000);
    expect(restLeftMs(q, 110_000)).toBe(50_000);
    expect(restLeftMs(q, 500_000)).toBe(0);
    expect(resumeRest(q, 120_000)).toBe(q);
  });

  it("±15 s works while running and while paused, never below zero", () => {
    const r = startRest(60, 0);
    expect(restLeftMs(adjustRest(r, 15, 10_000), 10_000)).toBe(65_000);
    expect(adjustRest(r, 15, 10_000).total).toBe(75);
    expect(restLeftMs(adjustRest(r, -15, 50_000), 50_000)).toBe(0);
    const p = pauseRest(r, 50_000);
    expect(restLeftMs(adjustRest(p, 15, 80_000), 90_000)).toBe(25_000);
    expect(restLeftMs(adjustRest(p, -15, 80_000), 90_000)).toBe(0);
    expect(adjustRest(p, -15, 80_000).pausedLeft).toBe(0);
  });
});
