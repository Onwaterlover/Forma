import type { ExerciseSession, SetLog } from "./progression";
import type { Exercise, Muscle } from "./types";

/** How the best set compares with the previous session of the same exercise. */
export type Change =
  | { kind: "first" }
  | { kind: "weight"; delta: number }
  | { kind: "reps"; delta: number }
  | { kind: "time"; delta: number }
  | { kind: "same" }
  | { kind: "lower" };

export interface BestSet { weightKg: number | null; reps: number | null; durationS: number | null }

export interface SummaryExercise {
  exerciseId: string;
  name: string;
  sets: number;
  best: BestSet;
  change: Change;
  /** Heavier than ever before, or more reps than ever at the heaviest load (logged history only). */
  record: boolean;
}

export interface WorkoutSummary {
  minutes: number;
  sets: number;
  exercises: SummaryExercise[];
  /** Completed working sets per primary muscle (direct work only, no estimated indirect stimulus). */
  muscles: { muscle: Muscle; sets: number }[];
}

const done = (s: SetLog) => s.completed && s.type !== "warmup" && ((s.reps ?? 0) > 0 || (s.durationS ?? 0) > 0);
const key = (s: BestSet): [number, number, number] => [s.weightKg ?? 0, s.reps ?? 0, s.durationS ?? 0];

/** Heaviest set, then most reps, then longest hold. For assisted exercises less weight is harder. */
function best(sets: SetLog[], assisted: boolean): BestSet | null {
  let b: BestSet | null = null;
  for (const s of sets) {
    const c = { weightKg: s.weightKg, reps: s.reps, durationS: s.durationS ?? null };
    if (!b) { b = c; continue; }
    const [cw, cr, cd] = key(c);
    const [bw, br, bd] = key(b);
    const heavier = assisted ? cw < bw : cw > bw;
    if (heavier || (cw === bw && (cr > br || (cr === br && cd > bd)))) b = c;
  }
  return b;
}

function compare(now: BestSet, prev: BestSet, assisted: boolean): Change {
  const [w, r, d] = key(now);
  const [pw, pr, pd] = key(prev);
  if (w !== pw && (w > 0 || pw > 0)) {
    const better = assisted ? w < pw : w > pw;
    return better ? { kind: "weight", delta: Math.abs(w - pw) } : { kind: "lower" };
  }
  if (r !== pr) return r > pr ? { kind: "reps", delta: r - pr } : { kind: "lower" };
  if (d !== pd) return d > pd ? { kind: "time", delta: d - pd } : { kind: "lower" };
  return { kind: "same" };
}

export function summarizeWorkout(
  w: { startedAt: string; endedAt: string | null; exercises: { exerciseId: string; name: string; sets: SetLog[] }[] },
  lookup: (id: string) => Exercise | undefined,
  /** Earlier completed sessions per exercise, newest first (excluding this workout). */
  history: Record<string, ExerciseSession[]>,
): WorkoutSummary {
  const exercises: SummaryExercise[] = [];
  const muscles = new Map<Muscle, number>();
  for (const e of w.exercises) {
    const sets = e.sets.filter(done);
    if (!sets.length) continue;
    const ex = lookup(e.exerciseId);
    const assisted = ex?.loading === "assisted";
    const b = best(sets, assisted)!;
    const prevSessions = (history[e.exerciseId] ?? []).map((h) => h.sets.filter(done)).filter((s) => s.length > 0);
    const prev = prevSessions[0] ? best(prevSessions[0], assisted) : null;
    const allTime = best(prevSessions.flat(), assisted);
    const loaded = !assisted && (b.weightKg ?? 0) > 0;
    const record = !!allTime && loaded
      && ((b.weightKg ?? 0) > (allTime.weightKg ?? 0) || (b.weightKg === allTime.weightKg && (b.reps ?? 0) > (allTime.reps ?? 0)));
    exercises.push({ exerciseId: e.exerciseId, name: e.name, sets: sets.length, best: b, change: prev ? compare(b, prev, assisted) : { kind: "first" }, record });
    for (const m of ex?.primary ?? []) muscles.set(m, (muscles.get(m) ?? 0) + sets.length);
  }
  const end = w.endedAt ? Date.parse(w.endedAt) : Date.now();
  return {
    minutes: Math.max(0, Math.round((end - Date.parse(w.startedAt)) / 60_000)),
    sets: exercises.reduce((n, e) => n + e.sets, 0),
    exercises,
    muscles: [...muscles].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets),
  };
}
