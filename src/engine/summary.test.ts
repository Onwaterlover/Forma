import { describe, expect, it } from "vitest";
import { EXERCISES } from "./exercises";
import { summarizeWorkout } from "./summary";

const lookup = (id: string) => EXERCISES.find((e) => e.id === id);
const set = (weightKg: number | null, reps: number, extra: Partial<{ type: "warmup" | "working"; completed: boolean }> = {}) =>
  ({ weightKg, reps, durationS: null, type: extra.type ?? "working", completed: extra.completed ?? true }) as const;
const w = (exercises: { exerciseId: string; sets: ReturnType<typeof set>[] }[]) => ({
  startedAt: "2026-10-21T17:00:00.000Z", endedAt: "2026-10-21T17:52:00.000Z", exercises: exercises.map((e) => ({ ...e, name: e.exerciseId, sets: [...e.sets] })),
});
const hist = (...sessions: ReturnType<typeof set>[][]) => sessions.map((sets, i) => ({ date: `2026-10-${10 - i}`, sets: [...sets] }));

describe("workout summary", () => {
  it("counts only completed working sets, by primary muscle", () => {
    const s = summarizeWorkout(w([{ exerciseId: "db_bench_press", sets: [set(10, 12, { type: "warmup" }), set(20, 10), set(20, 9), set(20, 8, { completed: false })] }]), lookup, {});
    expect(s.minutes).toBe(52);
    expect(s.sets).toBe(2);
    expect(s.muscles[0]).toEqual({ muscle: "chest", sets: 2 });
    expect(s.exercises[0]!.change).toEqual({ kind: "first" });
  });

  it("compares the best set with last time and flags real records only", () => {
    const heavier = summarizeWorkout(w([{ exerciseId: "db_bench_press", sets: [set(22.5, 8)] }]), lookup, { db_bench_press: hist([set(20, 10)], [set(20, 8)]) });
    expect(heavier.exercises[0]).toMatchObject({ change: { kind: "weight", delta: 2.5 }, record: true });

    const moreReps = summarizeWorkout(w([{ exerciseId: "db_bench_press", sets: [set(20, 11)] }]), lookup, { db_bench_press: hist([set(20, 10)], [set(24, 6)]) });
    expect(moreReps.exercises[0]).toMatchObject({ change: { kind: "reps", delta: 1 }, record: false });

    const lower = summarizeWorkout(w([{ exerciseId: "db_bench_press", sets: [set(17.5, 10)] }]), lookup, { db_bench_press: hist([set(20, 10)]) });
    expect(lower.exercises[0]!.change.kind).toBe("lower");
  });

  it("treats less assistance as progress", () => {
    const s = summarizeWorkout(w([{ exerciseId: "assisted_pull_up_machine", sets: [set(30, 8)] }]), lookup, { assisted_pull_up_machine: hist([set(35, 8)]) });
    expect(s.exercises[0]!.change).toEqual({ kind: "weight", delta: 5 });
    expect(s.exercises[0]!.record).toBe(false);
  });
});
