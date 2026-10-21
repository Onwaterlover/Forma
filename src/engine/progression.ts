import type { Exercise, PlannedExercise } from "./types";

export interface SetLog {
  reps: number | null;
  weightKg: number | null;
  durationS?: number | null;
  type: "warmup" | "working" | "drop" | "failure";
  completed: boolean;
}

export interface ExerciseSession {
  date: string;
  sets: SetLog[];
}

export type Suggestion =
  | { kind: "insufficient_data" }
  | { kind: "increase_load"; weightKg: number; reps: number }
  | { kind: "add_reps"; weightKg: number | null; reps: number }
  | { kind: "harder_variant" }
  | { kind: "add_weight"; weightKg: number }
  | { kind: "reduce_assistance"; weightKg: number }
  | { kind: "longer_hold"; seconds: number }
  | { kind: "consider_reduce"; weightKg: number };

const working = (s: ExerciseSession) => s.sets.filter((x) => x.completed && x.type !== "warmup" && x.reps !== null && x.reps > 0);

/** Most common weight among working sets (the "top" load the user actually trained with). */
function mainWeight(sets: SetLog[]): number | null {
  const counts = new Map<number, number>();
  for (const s of sets) if (s.weightKg !== null) counts.set(s.weightKg, (counts.get(s.weightKg) ?? 0) + 1);
  let best: number | null = null;
  let n = 0;
  for (const [w, c] of counts) {
    if (c > n || (c === n && best !== null && w > best)) {
      best = w;
      n = c;
    }
  }
  return best;
}

export function loadIncrement(ex: Exercise, weight: number): number {
  if (ex.loading === "per_dumbbell") return weight < 10 ? 1 : 2;
  if (ex.loading === "per_side") return 2.5;
  if (ex.kind === "barbell" || ex.kind === "smith") return 2.5;
  return weight < 20 ? 2.5 : 5;
}

const round = (x: number) => Math.round(x * 4) / 4;

/**
 * Double progression with damping: suggest more load only when every working set reached the top of the
 * rep range; never react to one bad day. History is newest first and only includes sessions with set data
 * (a workout ticked off in simple mode is not evidence of progress).
 */
export function suggestNext(ex: Exercise, target: Pick<PlannedExercise, "repMin" | "repMax" | "seconds">, history: ExerciseSession[]): Suggestion {
  const logged = history.filter((h) => working(h).length > 0 || h.sets.some((s) => s.durationS));
  const last = logged[0];
  if (!last) return { kind: "insufficient_data" };

  if (ex.loading === "time") {
    const best = Math.max(0, ...last.sets.map((s) => s.durationS ?? 0));
    if (!best) return { kind: "insufficient_data" };
    return best >= 60 ? { kind: "harder_variant" } : { kind: "longer_hold", seconds: Math.min(best + 5, 60) };
  }

  const sets = working(last);
  const allTop = sets.every((s) => (s.reps ?? 0) >= target.repMax);
  const weight = mainWeight(sets);

  if (ex.loading === "bodyweight") return allTop ? { kind: "harder_variant" } : { kind: "add_reps", weightKg: null, reps: Math.min(target.repMax, Math.min(...sets.map((s) => s.reps ?? 0)) + 1) };
  if (ex.loading === "bodyweight_plus" && (weight === null || weight === 0)) {
    return allTop ? { kind: "add_weight", weightKg: 2.5 } : { kind: "add_reps", weightKg: null, reps: Math.min(target.repMax, Math.min(...sets.map((s) => s.reps ?? 0)) + 1) };
  }
  if (weight === null) return { kind: "insufficient_data" };
  if (ex.loading === "assisted") {
    return allTop ? { kind: "reduce_assistance", weightKg: Math.max(0, round(weight - (weight > 20 ? 5 : 2.5))) } : { kind: "add_reps", weightKg: weight, reps: Math.min(...sets.map((s) => s.reps ?? 0)) + 1 };
  }

  // Sustained decline: three sessions in a row at the same load, each below the bottom of the range and worse than before.
  const recent = logged.slice(0, 3).map((h) => ({ w: mainWeight(working(h)), reps: working(h).reduce((a, s) => a + (s.reps ?? 0), 0), min: Math.min(...working(h).map((s) => s.reps ?? 0)) }));
  if (
    recent.length === 3 &&
    recent.every((r) => r.w === weight && r.min < target.repMin) &&
    recent[0]!.reps < recent[1]!.reps && recent[1]!.reps < recent[2]!.reps
  ) {
    return { kind: "consider_reduce", weightKg: round(weight * 0.9) };
  }

  if (allTop) {
    const inc = Math.min(loadIncrement(ex, weight), Math.max(1, weight * 0.1));
    return { kind: "increase_load", weightKg: round(weight + inc), reps: target.repMin };
  }
  const lowest = Math.min(...sets.filter((s) => s.weightKg === weight).map((s) => s.reps ?? 0));
  return { kind: "add_reps", weightKg: weight, reps: Math.min(target.repMax, lowest + 1) };
}

/** Epley estimate; only meaningful for sets of 1–12 reps. Always labelled as an estimate in the UI. */
export function estimated1RM(weightKg: number, reps: number): number | null {
  if (reps < 1 || reps > 12 || weightKg <= 0) return null;
  return reps === 1 ? weightKg : Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export interface Records {
  maxLoad?: { weightKg: number; reps: number; date: string };
  bestE1rm?: { value: number; weightKg: number; reps: number; date: string };
  repsAtLoad: Record<string, { reps: number; date: string }>;
}

export type TrendMetric = "e1rm" | "load" | "reps" | "time" | "assistance";

export interface BestSetPoint {
  date: string;
  /** In the trend's metric; null only for an "e1rm" session whose best set is outside 1–12 reps. */
  value: number | null;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  e1rm: number | null;
}

const LOADED = ["total", "per_dumbbell", "per_side", "bodyweight_plus"];

/**
 * The best set of each logged session, oldest first, in the measure that suits the exercise: loaded lifts use
 * the estimated 1RM (an estimate, labelled as one) or, when most sessions are outside the 1–12 rep range, the
 * heaviest set; bodyweight lifts use reps; holds use seconds; assisted lifts use the assistance (less is better).
 */
export function exerciseTrend(ex: Exercise, history: ExerciseSession[]): { metric: TrendMetric; points: BestSetPoint[] } {
  const sessions = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const point = (date: string, s: SetLog, value: number | null): BestSetPoint => ({
    date, value, weightKg: s.weightKg, reps: s.reps, durationS: s.durationS ?? null, e1rm: estimated1RM(s.weightKg ?? 0, s.reps ?? 0),
  });
  const best = (sets: SetLog[], better: (a: SetLog, b: SetLog) => boolean) => sets.reduce<SetLog | null>((b, s) => (!b || better(s, b) ? s : b), null);
  const each = (metric: TrendMetric, fn: (h: ExerciseSession) => BestSetPoint | null) => ({ metric, points: sessions.map(fn).filter((p): p is BestSetPoint => p !== null) });

  if (ex.loading === "time") {
    return each("time", (h) => {
      const b = best(h.sets.filter((s) => s.completed && s.type !== "warmup" && (s.durationS ?? 0) > 0), (a, c) => a.durationS! > c.durationS!);
      return b && point(h.date, b, b.durationS!);
    });
  }
  if (ex.loading === "assisted") {
    return each("assistance", (h) => {
      const b = best(working(h).filter((s) => s.weightKg !== null), (a, c) => a.weightKg! < c.weightKg! || (a.weightKg === c.weightKg && a.reps! > c.reps!));
      return b && point(h.date, b, b.weightKg);
    });
  }
  const heaviest = (a: SetLog, c: SetLog) => a.weightKg! > c.weightKg! || (a.weightKg === c.weightKg && a.reps! > c.reps!);
  if (LOADED.includes(ex.loading) && sessions.some((h) => working(h).some((s) => (s.weightKg ?? 0) > 0))) {
    // Highest estimate first; sets without one (13+ reps) rank by load, so a session of only those keeps its heaviest set.
    const e1 = (s: SetLog) => estimated1RM(s.weightKg!, s.reps!) ?? -1;
    const bests = sessions.flatMap((h) => {
      const b = best(working(h).filter((s) => (s.weightKg ?? 0) > 0), (a, c) => e1(a) > e1(c) || (e1(a) === e1(c) && heaviest(a, c)));
      return b ? [point(h.date, b, null)] : [];
    });
    const byE1rm = bests.filter((p) => p.e1rm !== null).length * 2 >= bests.length;
    return { metric: byE1rm ? "e1rm" : "load", points: bests.map((p) => ({ ...p, value: byE1rm ? p.e1rm : p.weightKg })) };
  }
  return each("reps", (h) => {
    const b = best(working(h), (a, c) => a.reps! > c.reps!);
    return b && point(h.date, b, b.reps);
  });
}

/** The best session of a trend: the highest value, or the lowest for assistance. */
export function bestPoint({ metric, points }: { metric: TrendMetric; points: BestSetPoint[] }): BestSetPoint | null {
  return points.reduce<BestSetPoint | null>((b, p) => (p.value === null ? b : !b || (metric === "assistance" ? p.value < b.value! : p.value > b.value!) ? p : b), null);
}

export function personalRecords(ex: Exercise, history: ExerciseSession[]): Records {
  const rec: Records = { repsAtLoad: {} };
  if (!["total", "per_dumbbell", "per_side", "bodyweight_plus"].includes(ex.loading)) return rec;
  for (const h of history) {
    for (const s of working(h)) {
      const w = s.weightKg ?? 0;
      const r = s.reps ?? 0;
      if (w > 0 && (!rec.maxLoad || w > rec.maxLoad.weightKg || (w === rec.maxLoad.weightKg && r > rec.maxLoad.reps))) rec.maxLoad = { weightKg: w, reps: r, date: h.date };
      const key = String(w);
      if (!rec.repsAtLoad[key] || r > rec.repsAtLoad[key]!.reps) rec.repsAtLoad[key] = { reps: r, date: h.date };
      const e = estimated1RM(w, r);
      if (e !== null && (!rec.bestE1rm || e > rec.bestE1rm.value)) rec.bestE1rm = { value: e, weightKg: w, reps: r, date: h.date };
    }
  }
  return rec;
}
