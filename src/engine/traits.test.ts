import { describe, expect, it } from "vitest";
import { EXERCISES } from "./exercises";
import { traitsOf } from "./traits";

const ex = (id: string) => EXERCISES.find((e) => e.id === id)!;

describe("exercise traits for the plan review", () => {
  it("gives at most two short, factual reasons", () => {
    for (const e of EXERCISES) expect(traitsOf(e).length).toBeLessThanOrEqual(2);
    expect(traitsOf(ex("dip"))).toContain("bodyweight");
    expect(traitsOf(ex("db_bench_press"))).toContain("loadable");
  });

  it("puts the user's favourites first", () => {
    expect(traitsOf(ex("dip"), "favorite")[0]).toBe("favorite");
  });

  it("tells the level: push-ups are too easy for experienced lifters, technical lifts are for later", () => {
    expect(traitsOf(ex("push_up"), undefined, "advanced")).toContain("tooEasy");
    expect(traitsOf(ex("push_up"), undefined, "beginner")).not.toContain("tooEasy");
    const technical = EXERCISES.find((e) => e.skill === 3)!;
    expect(traitsOf(technical, undefined, "beginner")).toContain("forAdvanced");
  });
});
