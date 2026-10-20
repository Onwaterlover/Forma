// Bodyweight trend and energy-expenditure estimates. Conservative by design: when the data can't support
// a conclusion we say so instead of producing a number.

export interface WeighIn {
  date: string; // YYYY-MM-DD
  kg: number;
}

export interface TrendPoint extends WeighIn {
  trend: number;
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** Time-aware exponential smoothing (10% per day), so gaps between weigh-ins are handled sensibly. */
export function weightTrend(entries: WeighIn[]): TrendPoint[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const out: TrendPoint[] = [];
  let trend: number | null = null;
  let prev: string | null = null;
  for (const e of sorted) {
    if (trend === null || prev === null) trend = e.kg;
    else {
      const alpha = 1 - 0.9 ** Math.max(1, days(prev, e.date));
      trend = trend + alpha * (e.kg - trend);
    }
    prev = e.date;
    out.push({ ...e, trend: Math.round(trend * 100) / 100 });
  }
  return out;
}

/** Least-squares slope in kg/day with its standard error. */
export function slope(entries: WeighIn[]): { perDay: number; se: number } | null {
  if (entries.length < 3) return null;
  const t0 = Date.parse(entries[0]!.date);
  const xs = entries.map((e) => (Date.parse(e.date) - t0) / DAY);
  const ys = entries.map((e) => e.kg);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i]! - (my + b * (xs[i]! - mx))) ** 2;
  const se = Math.sqrt(sse / Math.max(1, n - 2) / sxx);
  return { perDay: b, se };
}

export type Sex = "female" | "male" | "unspecified";

/** Mifflin–St Jeor resting energy × activity factor. An estimate (typically ±10–15%), not a measurement. */
export function initialEstimate(i: { sex: Sex; age: number; heightCm: number; weightKg: number; activity: 1.2 | 1.375 | 1.55 | 1.725 }) {
  const base = 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age;
  const ree = i.sex === "male" ? base + 5 : i.sex === "female" ? base - 161 : base - 78;
  const tdee = ree * i.activity;
  const r50 = (x: number) => Math.round(x / 50) * 50;
  return { ree: r50(ree), tdee: r50(tdee), low: r50(tdee * 0.88), high: r50(tdee * 1.12) };
}

export interface IntakeDay {
  date: string;
  kcal: number;
  /** false = user said the log is incomplete; undefined = not marked. */
  complete?: boolean;
}

/** Energy per kg of bodyweight change. A heuristic: real tissue changes vary; documented in docs/evidence.md. */
export const KCAL_PER_KG = 7700;

export type AdaptiveResult =
  | { status: "insufficient"; reasons: string[] }
  | {
      status: "ok" | "uncertain";
      tdee: number;
      low: number;
      high: number;
      avgIntake: number;
      kgPerWeek: number;
      loggedDays: number;
      weighIns: number;
    };

export function adaptiveTdee(intake: IntakeDay[], weights: WeighIn[], opts: { windowDays?: number; today?: string } = {}): AdaptiveResult {
  const window = opts.windowDays ?? 28;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const inWindow = (d: string) => days(d, today) >= 0 && days(d, today) < window;
  const reasons: string[] = [];

  let logged = intake.filter((d) => inWindow(d.date) && d.complete !== false && d.kcal > 0);
  if (logged.length >= 5) {
    // Days far below the user's usual intake are most likely partially logged.
    const sorted = logged.map((d) => d.kcal).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    logged = logged.filter((d) => d.kcal >= median * 0.5);
  }
  const w = weights.filter((x) => inWindow(x.date)).sort((a, b) => a.date.localeCompare(b.date));
  const span = w.length >= 2 ? days(w[0]!.date, w[w.length - 1]!.date) : 0;

  if (logged.length < 10) reasons.push("too_few_logged_days");
  if (w.length < 6) reasons.push("too_few_weigh_ins");
  if (span < 14) reasons.push("weigh_in_span_too_short");
  if (reasons.length) return { status: "insufficient", reasons };

  const sl = slope(w)!;
  const avgIntake = logged.reduce((a, d) => a + d.kcal, 0) / logged.length;
  const tdee = avgIntake - sl.perDay * KCAL_PER_KG;
  // 95% interval from weight-slope uncertainty plus a margin for logging error (±5% of intake).
  const half = 1.96 * sl.se * KCAL_PER_KG + avgIntake * 0.05;
  const r50 = (x: number) => Math.round(x / 50) * 50;
  return {
    status: half > 400 ? "uncertain" : "ok",
    tdee: r50(tdee),
    low: r50(tdee - half),
    high: r50(tdee + half),
    avgIntake: Math.round(avgIntake),
    kgPerWeek: Math.round(sl.perDay * 7 * 100) / 100,
    loggedDays: logged.length,
    weighIns: w.length,
  };
}

export type WeightGoal = "maintain" | "lose" | "gain" | "recomp";

export type TargetSuggestion =
  | { kind: "none"; reason: string }
  | { kind: "change"; kcal: number; reason: string };

/**
 * Suggest a modest target change. Never applied automatically. Losing: ~0.5% bodyweight/week with a
 * 500 kcal cap; gaining: +200 kcal; changes smaller than 100 kcal are not worth suggesting.
 */
export function suggestTarget(r: AdaptiveResult, goal: WeightGoal, currentTarget: number | null, bodyweightKg: number): TargetSuggestion {
  if (r.status === "insufficient") return { kind: "none", reason: "insufficient_data" };
  if (r.status === "uncertain") return { kind: "none", reason: "too_uncertain" };
  const r50 = (x: number) => Math.round(x / 50) * 50;
  let target: number;
  if (goal === "maintain" || goal === "recomp") target = r.tdee;
  else if (goal === "lose") target = r.tdee - Math.min(500, (bodyweightKg * 0.005 * KCAL_PER_KG) / 7);
  else target = r.tdee + 200;
  target = r50(Math.max(target, 1200, r.tdee * 0.75));

  const onTrack =
    (goal === "maintain" && Math.abs(r.kgPerWeek) <= 0.2) ||
    (goal === "recomp" && Math.abs(r.kgPerWeek) <= 0.25) ||
    (goal === "lose" && r.kgPerWeek <= -0.1 && r.kgPerWeek >= -bodyweightKg * 0.01) ||
    (goal === "gain" && r.kgPerWeek >= 0.05 && r.kgPerWeek <= bodyweightKg * 0.005);
  if (onTrack) return { kind: "none", reason: "on_track" };
  if (currentTarget !== null && Math.abs(target - currentTarget) < 100) return { kind: "none", reason: "change_too_small" };
  return { kind: "change", kcal: target, reason: `goal_${goal}` };
}
