import { describe, expect, it } from "vitest";
import { EXERCISES } from "./exercises";
import { matchesQuery, regionsOf } from "./regions";

describe("exercise categories and search", () => {
  const ex = (id: string) => EXERCISES.find((e) => e.id === id)!;
  it("finds crunches by everyday names, without Polish letters too", () => {
    const hits = (q: string) => EXERCISES.filter((e) => matchesQuery(e, q)).map((e) => e.id);
    expect(hits("brzuszki")).toEqual(expect.arrayContaining(["crunch", "machine_crunch", "cable_crunch"]));
    expect(hits("brzuszki na maszynie")).toContain("machine_crunch");
    expect(hits("maszyna do brzuszkow")).toContain("machine_crunch");
    expect(hits("Bauchmaschine")).toContain("machine_crunch");
    expect(hits("brzuszki maszyn")).toContain("machine_crunch");
    expect(hits("maszynie brzuszki")).toContain("machine_crunch");
  });
  it("puts every exercise in at least one body-part category", () => {
    expect(EXERCISES.filter((e) => regionsOf(e).length === 0).map((e) => e.id)).toEqual([]);
    expect(regionsOf(ex("machine_crunch"))).toEqual(["core"]);
    expect(regionsOf(ex("hip_adduction_machine"))).toEqual(["legs"]);
  });
});
