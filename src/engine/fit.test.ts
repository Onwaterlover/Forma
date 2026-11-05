import { describe, expect, it } from "vitest";
import { EXERCISE_BY_ID } from "./exercises";
import { canPair } from "./fit";

const ex = (id: string) => EXERCISE_BY_ID.get(id)!;

describe("supersets", () => {
  it("pairs light antagonists, never two demanding lifts or a one-sided exercise", () => {
    expect(canPair(ex("db_curl"), ex("cable_pushdown"))).toBe(true);
    expect(canPair(ex("push_up"), ex("inverted_row"))).toBe(true);
    expect(canPair(ex("db_bench_press"), ex("one_arm_db_row"))).toBe(false);
    expect(canPair(ex("db_bench_press"), ex("chest_supported_db_row"))).toBe(false);
    expect(canPair(ex("handstand_push_up"), ex("lat_pulldown"))).toBe(false);
    expect(canPair(ex("handstand_push_up"), ex("pull_up"))).toBe(false);
  });

  it("knows the dumbbell hip thrust", () => {
    expect(ex("hip_thrust_db")).toMatchObject({ pattern: "hip_ext", kind: "dumbbell", primary: ["glutes"] });
  });
});
