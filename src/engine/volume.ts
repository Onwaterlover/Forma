import type { Exercise, Muscle, MusclePriority, PlannedSession, TrainingProfile } from "./types";

// Approximate contribution model: a working set counts 1 for each primary muscle and 0.5 for each
// secondary muscle. This is a planning heuristic, not a measurement of stimulus.
export const PRIMARY_WEIGHT = 1;
export const SECONDARY_WEIGHT = 0.5;

/** Muscles we actively balance. Forearms, lower back and front delts are covered indirectly. */
export const BALANCED: Muscle[] = [
  "chest", "lats", "upper_back", "side_delts", "rear_delts", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "abs",
];
const MINOR: Muscle[] = ["calves", "abs", "rear_delts"];

export function weeklySets(sessions: PlannedSession[], lookup: (id: string) => Exercise | undefined) {
  const out: Partial<Record<Muscle, number>> = {};
  for (const s of sessions) {
    for (const pe of s.exercises) {
      const ex = lookup(pe.exerciseId);
      if (!ex || ex.pattern === "conditioning") continue;
      for (const m of ex.primary) out[m] = (out[m] ?? 0) + pe.sets * PRIMARY_WEIGHT;
      for (const m of ex.secondary) out[m] = (out[m] ?? 0) + pe.sets * SECONDARY_WEIGHT;
    }
  }
  for (const k of Object.keys(out) as Muscle[]) out[k] = Math.round(out[k]! * 10) / 10;
  return out;
}

const BASE = { beginner: 6, intermediate: 9, advanced: 12 };
const GOAL = { muscle: 1, strength: 0.9, sport: 0.8, conditioning: 0.7, health: 0.7, start: 0.6, unsure: 0.7 };
const PRIO: Record<MusclePriority, number> = { high: 1.5, normal: 1, low: 0.6, maintain: 0.35 };

/** Weekly direct-equivalent set target used only to decide where extra sets help most. */
export function weeklyTarget(p: TrainingProfile, m: Muscle): number {
  const t = BASE[p.experience] * GOAL[p.goal] * PRIO[p.priorities[m] ?? "normal"] * (MINOR.includes(m) ? 0.7 : 1);
  // Capped at 20: more weekly sets per muscle rarely add growth and mostly add fatigue.
  return Math.min(20, Math.max(2, Math.round(t * 10) / 10));
}
