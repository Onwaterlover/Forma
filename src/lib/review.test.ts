import { describe, expect, it } from "vitest";
import { weeklyReview, type ReviewInput } from "./review";

const base: ReviewInput = {
  goal: "lose",
  trend: [{ date: "2026-10-25", trend: 80 }, { date: "2026-11-01", trend: 80 }],
  days: Array.from({ length: 6 }, () => ({ kcal: 2000, protein: 140 })),
  target: { kcal: 2000, protein: 150 },
  workouts: { done: 3, planned: 3, sets: 45, setsBefore: 40 },
  weekStart: "2026-10-26",
  weekEnd: "2026-11-01",
};

describe("weekly review", () => {
  it("weight not moving on a cut with the log on target: eat a little less", () => {
    const r = weeklyReview(base);
    expect(r.weight).toBe(0);
    expect(r.food).toEqual({ days: 6, kcal: 2000, protein: 140 });
    expect(r.tip).toEqual({ key: "lowerKcal" });
  });
  it("weight not moving while the log shows a big deficit: probably not everything is logged", () => {
    expect(weeklyReview({ ...base, days: base.days.map((d) => ({ ...d, kcal: 1500 })) }).tip).toEqual({ key: "underlog", kcal: 1500 });
  });
  it("losing too fast, low protein, missed workouts, all fine", () => {
    expect(weeklyReview({ ...base, trend: [{ date: "2026-10-25", trend: 80 }, { date: "2026-11-01", trend: 78.8 }] }).tip).toEqual({ key: "tooFast", pct: 1.5 });
    const ok = { ...base, trend: [{ date: "2026-10-25", trend: 80 }, { date: "2026-11-01", trend: 79.5 }] };
    expect(weeklyReview({ ...ok, days: ok.days.map((d) => ({ ...d, protein: 90 })) }).tip).toEqual({ key: "protein", avg: 90, target: 150 });
    expect(weeklyReview({ ...ok, workouts: { done: 1, planned: 3, sets: 15, setsBefore: 40 } }).tip).toEqual({ key: "fewerWorkouts", done: 1, planned: 3 });
    expect(weeklyReview(ok).tip).toEqual({ key: "keep" });
  });
  it("says when there is too little to judge", () => {
    const r = weeklyReview({ ...base, trend: [], days: [], workouts: { done: 0, planned: null, sets: 0, setsBefore: 0 } });
    expect(r).toMatchObject({ weight: null, food: null, training: null, tip: { key: "lowData" } });
  });
});
