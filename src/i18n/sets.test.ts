import { describe, expect, it } from "vitest";
import { prescriptionText, setsText } from "./index";

describe("sets text", () => {
  it("Polish plural and the range only when asked", () => {
    expect([1, 2, 3, 4, 5, 12, 22].map((n) => setsText("pl", n))).toEqual(["1 seria", "2 serie", "3 serie", "4 serie", "5 serii", "12 serii", "22 serie"]);
    expect(prescriptionText("pl", { sets: 3, repMin: 8, repMax: 12 }, false)).toBe("3 serie");
    expect(prescriptionText("pl", { sets: 3, repMin: 8, repMax: 12 }, true)).toBe("3 × 8–12");
    expect(prescriptionText("en", { sets: 2, repMin: 0, repMax: 0, seconds: 40 }, false)).toBe("2 × 40 s");
  });
});
