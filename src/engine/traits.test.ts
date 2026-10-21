import { describe, expect, it } from "vitest";
import { EXERCISES } from "./exercises";
import { compareTo } from "./compare";
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

  it("explains alternatives by their differences from the recommended exercise", () => {
    const diffs = compareTo(ex("push_up"), ex("db_bench_press"));
    expect(diffs.map((d) => d.key)).toContain("progressionWorse");
    expect(compareTo(ex("db_bench_press"), ex("push_up")).map((d) => d.key)).toContain("progressionBetter");
    expect(compareTo(ex("db_bench_press"), ex("db_bench_press"))).toEqual([{ key: "similar", good: true }]);
    // At most two "how" differences plus one "what it trains" line.
    for (const a of EXERCISES.slice(0, 30)) for (const b of EXERCISES.slice(0, 30)) {
      const d = compareTo(a, b);
      expect(d.filter((x) => x.key !== "focus").length).toBeLessThanOrEqual(2);
      expect(d.filter((x) => x.key === "focus").length).toBeLessThanOrEqual(1);
    }
    // Incline vs flat press: same pattern, different focus — said explicitly, both ways.
    expect(compareTo(ex("incline_db_press"), ex("db_bench_press"))[0]).toMatchObject({ key: "focus", emphasis: "upper_chest" });
    expect(compareTo(ex("db_bench_press"), ex("incline_db_press"))[0]).toMatchObject({ key: "focus", emphasis: "upper_chest_off" });
    expect(compareTo(ex("dip"), ex("db_bench_press"))[0]).toMatchObject({ key: "focus", muscles: ["triceps"] });
  });
});
