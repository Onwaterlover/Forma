import { describe, expect, it } from "vitest";
import { emptyMeasurement, measurementTrends } from "./measurements";

describe("measurement trends", () => {
  it("follows each site separately, oldest first, skipping days it wasn't measured", () => {
    const trends = measurementTrends([
      { ...emptyMeasurement("2026-10-15"), waist: 80.2, arm: 35 },
      { ...emptyMeasurement("2026-09-01"), waist: 82.5 },
      { ...emptyMeasurement("2026-10-01"), waist: 81 },
    ]);
    expect(trends.map((s) => s.site)).toEqual(["waist", "arm"]);
    expect(trends[0]).toMatchObject({ first: { date: "2026-09-01", cm: 82.5 }, latest: { date: "2026-10-15", cm: 80.2 }, change: -2.3 });
    expect(trends[0]!.points.map((p) => p.date)).toEqual(["2026-09-01", "2026-10-01", "2026-10-15"]);
    expect(trends[1]).toMatchObject({ points: [{ date: "2026-10-15", cm: 35 }], change: null });
  });

  it("is empty without any readings", () => {
    expect(measurementTrends([])).toEqual([]);
    expect(measurementTrends([emptyMeasurement("2026-10-01")])).toEqual([]);
  });
});
