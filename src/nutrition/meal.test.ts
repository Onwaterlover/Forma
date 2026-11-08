import { describe, expect, it } from "vitest";
import { hourIn, suggestMeal } from "./meal";

const at = (hhmm: string) => Date.parse(`2026-11-05T${hhmm}:00Z`);
const e = (meal: string, hhmm: string) => ({ meal, createdAt: new Date(at(hhmm)).toISOString() });

describe("meal suggestion", () => {
  it("keeps adding to the meal logged within the last hour", () => {
    expect(suggestMeal([e("breakfast", "10:40")], 11.2, at("11:12"))).toBe("breakfast");
  });
  it("goes by the time of day, and a second one of the same meal later is a snack", () => {
    expect(suggestMeal([], 8, at("08:00"))).toBe("breakfast");
    expect(suggestMeal([], 13, at("13:00"))).toBe("lunch");
    // 11:00 is still breakfast time, not lunch.
    expect(suggestMeal([], 11, at("11:00"))).toBe("breakfast");
    expect(suggestMeal([], 19, at("19:00"))).toBe("dinner");
    expect(suggestMeal([e("breakfast", "07:30")], 10.5, at("10:30"))).toBe("snack");
    expect(suggestMeal([e("lunch", "13:00")], 15.75, at("15:45"))).toBe("snack");
    expect(suggestMeal([e("breakfast", "07:30")], 13, at("13:00"))).toBe("lunch");
  });
  it("reads the hour in a time zone", () => {
    expect(hourIn("UTC", new Date("2026-11-05T13:30:00Z"))).toBe(13.5);
    expect(hourIn("Europe/Warsaw", new Date("2026-11-05T13:30:00Z"))).toBe(14.5);
  });
});
