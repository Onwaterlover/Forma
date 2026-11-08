// Which meal a new diary entry most likely belongs to, when the user didn't say. Shared by the diary and the
// assistant so both decide the same way.

export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];

/**
 * 1. Something added in the last hour: the same meal (a meal is often logged item by item).
 * 2. Otherwise the time of day (before 12 breakfast, before 17 lunch, before 22 dinner, later a snack); but when
 *    that meal is already logged and more than 1.5 hours ago, it is a snack (a yoghurt at 10:30 after breakfast).
 * `hour`: local time of day as a decimal (13.5 = 13:30); `now`: epoch ms; entries are today's.
 */
export function suggestMeal(entries: { meal: string | null; createdAt: string }[], hour: number, now: number): Meal {
  const sorted = [...entries].filter((e) => e.meal).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const last = sorted[0];
  if (last && now - Date.parse(last.createdAt) <= 60 * 60_000 && (MEALS as readonly string[]).includes(last.meal!)) return last.meal as Meal;
  const base: Meal = hour < 12 ? "breakfast" : hour < 17 ? "lunch" : hour < 22 ? "dinner" : "snack";
  const earlier = sorted.find((e) => e.meal === base);
  return base !== "snack" && earlier && now - Date.parse(earlier.createdAt) > 90 * 60_000 ? "snack" : base;
}

/** Local time of day (decimal hours) in a time zone, e.g. the app's when deciding on the server. */
export function hourIn(timeZone: string, at = new Date()): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(at);
  return Number(p.find((x) => x.type === "hour")?.value ?? 0) + Number(p.find((x) => x.type === "minute")?.value ?? 0) / 60;
}
