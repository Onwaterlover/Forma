import { describe, expect, it } from "vitest";
import { EXERCISES } from "./exercises";
import { applyPlanEdits } from "./plan-edit";
import { defaultProfile } from "./profile";
import type { Plan, PlannedExercise } from "./types";

const pe = (exerciseId: string): PlannedExercise => ({ exerciseId, sets: 3, repMin: 8, repMax: 12, restSec: 90, effort: "leave_1_3", progression: "double", pattern: "h_push", priority: 2 });
const plan: Plan = {
  engineVersion: "1", split: "imported", weeklySets: {}, tradeoffs: [], notes: [],
  sessions: [
    { key: "A", template: "IMPORTED", name: "Góra", day: null, locationId: "", exercises: [pe("lat_pulldown"), pe("db_curl")], estimatedMinutes: 30 },
    { key: "B", template: "IMPORTED", name: "Pośladki A", day: null, locationId: "", exercises: [pe("hip_thrust_bb")], estimatedMinutes: 30 },
    { key: "C", template: "IMPORTED", name: "Nogi + pośladki B", day: null, locationId: "", exercises: [pe("leg_press")], estimatedMinutes: 30 },
  ] as Plan["sessions"],
};
const run = (changes: object[]) => applyPlanEdits(plan, changes as never, EXERCISES, defaultProfile(), "2026-10-21T10:00:00.000Z");

describe("plan edits by the assistant", () => {
  it("4x a week with upper twice: copies Upper into the rotation, keeps everything else", () => {
    const r = run([{ op: "duplicate_session", session_key: "A", position: 3 }]);
    if ("error" in r) throw new Error(r.error);
    expect(r.plan.sessions.map((s) => s.name)).toEqual(["Góra", "Pośladki A", "Góra", "Nogi + pośladki B"]);
    expect(new Set(r.plan.sessions.map((s) => s.key)).size).toBe(4);
    expect(r.plan.sessions[2]!.exercises.map((e) => e.exerciseId)).toEqual(["lat_pulldown", "db_curl"]);
    expect(plan.sessions).toHaveLength(3); // input untouched
  });
  it("swaps in machine hip thrust, sets numbers and kg, and validates input", () => {
    const r = run([
      { op: "remove_exercise", session_key: "B", exercise_id: "hip_thrust_bb" },
      { op: "add_exercise", session_key: "B", exercise_id: "hip_thrust_machine", sets: 4, rep_min: 8, rep_max: 10, kg: 60 },
      { op: "set_exercise", session_key: "A", exercise_id: "db_curl", rest_sec: 60 },
      { op: "set_day", session_key: "C", day: 4 },
    ]);
    if ("error" in r) throw new Error(r.error);
    expect(r.plan.sessions[1]!.exercises[0]).toMatchObject({ exerciseId: "hip_thrust_machine", sets: 4, repMin: 8, repMax: 10, startKg: 60 });
    expect(r.plan.sessions[0]!.exercises[1]!.restSec).toBe(60);
    expect(r.plan.sessions[2]!.day).toBe(4);
    expect(run([{ op: "add_exercise", session_key: "A", exercise_id: "nope" }])).toHaveProperty("error");
    expect(run([{ op: "remove_session", session_key: "Z" }])).toHaveProperty("error");
    expect(run([{ op: "set_exercise", session_key: "A", exercise_id: "db_curl", sets: 40 }])).toHaveProperty("error");
  });
  it("sets every rest in the plan to 2 minutes in one change", () => {
    const r = run([{ op: "set_all_exercises", session_key: "*", rest_sec: 120 }]);
    if ("error" in r) throw new Error(r.error);
    expect(r.plan.sessions.flatMap((s) => s.exercises.map((e) => e.restSec))).toEqual([120, 120, 120, 120]);
    expect(run([{ op: "set_all_exercises", session_key: "*", kg: 50 }])).toHaveProperty("error");
  });
});
