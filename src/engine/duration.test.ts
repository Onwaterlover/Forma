import { describe, expect, it } from "vitest";
import { estimateSeconds } from "./duration";
import { EXERCISE_BY_ID } from "./exercises";
import type { PlannedExercise } from "./types";

const pe = (exerciseId: string, superset?: number): PlannedExercise => ({
  exerciseId, sets: 3, repMin: 10, repMax: 12, restSec: 90, effort: "leave_1_3", progression: "double", pattern: "elbow_flex", priority: 2,
  ...(superset !== undefined ? { superset } : {}),
});
const secs = (list: PlannedExercise[]) => estimateSeconds(list, (id) => EXERCISE_BY_ID.get(id));

describe("session duration", () => {
  it("counts a superset of three as rounds: shorter than straight sets, longer than a pair", () => {
    const ids = ["db_bench_press", "db_curl", "db_triceps_kickback"];
    const straight = secs(ids.map((id) => pe(id)));
    const pair = secs([pe(ids[0]!, 1), pe(ids[1]!, 1), pe(ids[2]!)]);
    const tri = secs(ids.map((id) => pe(id, 1)));
    expect(tri).toBeLessThan(pair);
    expect(pair).toBeLessThan(straight);
  });
});
