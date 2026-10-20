import { describe, expect, it } from "vitest";
import { EXERCISE_BY_ID } from "./exercises";
import { estimated1RM, personalRecords, suggestNext, type ExerciseSession } from "./progression";

const ex = (id: string) => EXERCISE_BY_ID.get(id)!;
const sess = (date: string, sets: [number, number][]): ExerciseSession => ({
  date,
  sets: sets.map(([weightKg, reps]) => ({ weightKg, reps, type: "working", completed: true })),
});
const target = { repMin: 8, repMax: 12 };

describe("progression suggestions", () => {
  it("needs logged sets; a ticked-off workout is not evidence", () => {
    expect(suggestNext(ex("db_bench_press"), target, [])).toEqual({ kind: "insufficient_data" });
    expect(suggestNext(ex("db_bench_press"), target, [{ date: "d", sets: [{ weightKg: null, reps: null, type: "working", completed: true }] }])).toEqual({ kind: "insufficient_data" });
  });

  it("adds load only when every working set hit the top of the range", () => {
    expect(suggestNext(ex("bench_press_bb"), target, [sess("d", [[60, 12], [60, 12]])])).toEqual({ kind: "increase_load", weightKg: 62.5, reps: 8 });
    expect(suggestNext(ex("bench_press_bb"), target, [sess("d", [[60, 12], [60, 10]])])).toEqual({ kind: "add_reps", weightKg: 60, reps: 11 });
  });

  it("uses small, equipment-appropriate increments", () => {
    expect(suggestNext(ex("db_lateral_raise"), target, [sess("d", [[6, 12], [6, 12]])])).toMatchObject({ kind: "increase_load", weightKg: 7 });
    const r = suggestNext(ex("lat_pulldown"), target, [sess("d", [[10, 12], [10, 12]])]);
    expect(r.kind === "increase_load" && r.weightKg <= 11).toBe(true); // never more than +10%
  });

  it("one bad session does not trigger a reduction", () => {
    const h = [sess("3", [[80, 5], [80, 5]]), sess("2", [[80, 10], [80, 9]]), sess("1", [[80, 10], [80, 10]])];
    expect(suggestNext(ex("back_squat"), target, h).kind).toBe("add_reps");
  });

  it("a sustained decline suggests (not forces) a lighter load", () => {
    const h = [sess("3", [[80, 5], [80, 5]]), sess("2", [[80, 6], [80, 6]]), sess("1", [[80, 7], [80, 7]])];
    expect(suggestNext(ex("back_squat"), target, h)).toEqual({ kind: "consider_reduce", weightKg: 72 });
  });

  it("bodyweight and assisted exercises progress differently", () => {
    expect(suggestNext(ex("inverted_row"), { repMin: 6, repMax: 15 }, [sess("d", [[0, 15], [0, 15]])])).toEqual({ kind: "harder_variant" });
    expect(suggestNext(ex("pull_up"), target, [sess("d", [[0, 12], [0, 12]])])).toEqual({ kind: "add_weight", weightKg: 2.5 });
    expect(suggestNext(ex("assisted_pull_up_machine"), target, [sess("d", [[30, 12], [30, 12]])])).toEqual({ kind: "reduce_assistance", weightKg: 25 });
  });
});

describe("records", () => {
  it("labels estimates and separates record types", () => {
    expect(estimated1RM(100, 5)).toBe(116.7);
    expect(estimated1RM(100, 20)).toBeNull();
    const r = personalRecords(ex("bench_press_bb"), [sess("a", [[100, 3], [90, 8]]), sess("b", [[95, 6]])]);
    expect(r.maxLoad).toMatchObject({ weightKg: 100, reps: 3 });
    expect(r.repsAtLoad["90"]).toMatchObject({ reps: 8 });
    expect(r.bestE1rm!.value).toBe(114); // 95 x 6
  });
  it("no load records for assisted exercises (higher assistance = easier)", () => {
    expect(personalRecords(ex("assisted_pull_up_machine"), [sess("a", [[40, 10]])]).maxLoad).toBeUndefined();
  });
});
