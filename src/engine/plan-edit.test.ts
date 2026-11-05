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
  it("splits supersets: one pair, or all of them; a change that changes nothing is refused", () => {
    const paired: Plan = structuredClone(plan);
    paired.sessions[0]!.exercises = [{ ...pe("db_bench_press"), superset: 1 }, { ...pe("one_arm_db_row"), superset: 1 }, { ...pe("db_curl"), superset: 2 }, { ...pe("cable_pushdown"), superset: 2 }];
    const edit = (changes: object[]) => applyPlanEdits(paired, changes as never, EXERCISES, defaultProfile());

    const one = edit([{ op: "split_superset", session_key: "A", exercise_id: "one_arm_db_row" }]);
    if ("error" in one) throw new Error(one.error);
    expect(one.plan.sessions[0]!.exercises.map((e) => e.superset)).toEqual([undefined, undefined, 2, 2]);
    expect(one.lines).toEqual([{ kind: "split", session: "Góra", pair: ["one_arm_db_row", "db_bench_press"] }]);

    const all = edit([{ op: "split_superset", session_key: "*", exercise_id: null }]);
    if ("error" in all) throw new Error(all.error);
    expect(all.plan.sessions[0]!.exercises.every((e) => !("superset" in e))).toBe(true);

    // Removing one exercise of a pair leaves its partner as a normal exercise.
    const removed = edit([{ op: "remove_exercise", session_key: "A", exercise_id: "db_curl" }]);
    if ("error" in removed) throw new Error(removed.error);
    expect(removed.plan.sessions[0]!.exercises.find((e) => e.exerciseId === "cable_pushdown")!.superset).toBeUndefined();

    expect(edit([{ op: "split_superset", session_key: "B", exercise_id: null }])).toHaveProperty("error");
    expect(edit([{ op: "split_superset", session_key: "A", exercise_id: "lat_pulldown" }])).toHaveProperty("error");
    expect(edit([{ op: "set_exercise", session_key: "A", exercise_id: "db_curl" }])).toHaveProperty("error");
  });
  it("joins exercises into a superset of two or three, placed next to each other", () => {
    const solo: Plan = structuredClone(plan);
    solo.sessions[0]!.exercises = [pe("db_bench_press"), pe("lat_pulldown"), pe("db_curl"), pe("db_triceps_kickback")];
    const edit = (changes: object[]) => applyPlanEdits(solo, changes as never, EXERCISES, defaultProfile());

    const tri = edit([
      { op: "join_superset", session_key: "A", exercise_id: "db_bench_press", partner_id: "db_curl" },
      { op: "join_superset", session_key: "A", exercise_id: "db_curl", partner_id: "db_triceps_kickback" },
    ]);
    if ("error" in tri) throw new Error(tri.error);
    const ex = tri.plan.sessions[0]!.exercises;
    expect(ex.map((e) => e.exerciseId)).toEqual(["db_bench_press", "db_curl", "db_triceps_kickback", "lat_pulldown"]);
    expect(new Set(ex.slice(0, 3).map((e) => e.superset)).size).toBe(1);
    expect(ex[0]!.superset).toBeDefined();
    expect(ex[3]!.superset).toBeUndefined();
    expect(tri.lines.at(-1)).toEqual({ kind: "join", session: "Góra", ids: ["db_bench_press", "db_curl", "db_triceps_kickback"] });

    expect(edit([
      { op: "join_superset", session_key: "A", exercise_id: "db_bench_press", partner_id: "db_curl" },
      { op: "join_superset", session_key: "A", exercise_id: "db_curl", partner_id: "db_triceps_kickback" },
      { op: "join_superset", session_key: "A", exercise_id: "db_curl", partner_id: "lat_pulldown" },
    ])).toHaveProperty("error");
    expect(edit([{ op: "join_superset", session_key: "A", exercise_id: "db_curl", partner_id: null }])).toHaveProperty("error");
  });
});
