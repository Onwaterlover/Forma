import type { Effort, Exercise, PlannedExercise, Progression, TrainingProfile } from "./types";

// Default prescriptions. All are starting points the user can edit; see docs/evidence.md for rationale.

export const REST = {
  heavyCompound: 150,
  compound: 120,
  isolation: 75,
  minCompound: 90,
  minIsolation: 60,
};

export function baseSets(p: TrainingProfile, ex: Exercise, priority: 1 | 2 | 3): number {
  if (ex.pattern === "conditioning") return 1;
  if (p.experience === "advanced") return priority === 3 ? 2 : 3;
  if (p.experience === "intermediate") return priority === 1 && ex.mechanics === "compound" ? 3 : 2;
  return 2;
}

export function repRange(p: TrainingProfile, ex: Exercise, priority: 1 | 2 | 3): [number, number] {
  if (ex.loading === "bodyweight") {
    if (ex.id === "negative_pull_up") return [3, 6];
    return ex.mechanics === "compound" ? [6, 15] : [10, 20];
  }
  const general = p.goal === "health" || p.goal === "start" || p.goal === "unsure" || p.goal === "conditioning" || p.goal === "sport";
  if (ex.mechanics === "isolation") return ex.smallMuscle ? [12, 20] : general ? [12, 15] : [10, 15];
  if (p.goal === "strength" && priority === 1 && ex.fatigue !== "low") {
    return p.experience === "beginner" ? [6, 8] : [4, 6];
  }
  if (general) return [8, 12];
  return ex.fatigue === "high" ? [6, 10] : [8, 12];
}

export function restFor(p: TrainingProfile, ex: Exercise): number {
  if (ex.pattern === "conditioning") return 0;
  if (ex.mechanics === "isolation") return REST.isolation;
  if (ex.fatigue === "high") return p.goal === "strength" ? 180 : REST.heavyCompound;
  return REST.compound;
}

export function effortFor(p: TrainingProfile, ex: Exercise): Effort {
  if (p.experience === "beginner" || p.goal === "start") return "leave_2_3";
  if (!ex.stable || ex.fatigue === "high") return "leave_1_3";
  if (ex.mechanics === "isolation" || ex.kind === "machine" || ex.kind === "cable") return "last_set_failure_ok";
  return "leave_0_2";
}

export function progressionFor(ex: Exercise): Progression {
  if (ex.loading === "time") return "time";
  if (ex.loading === "assisted") return "assist_reduce";
  if (ex.loading === "bodyweight") return "reps_then_variant";
  return "double";
}

export function prescribe(p: TrainingProfile, ex: Exercise, priority: 1 | 2 | 3): PlannedExercise {
  const base = { exerciseId: ex.id, pattern: ex.pattern, priority, effort: effortFor(p, ex), progression: progressionFor(ex) };
  if (ex.pattern === "conditioning") {
    return { ...base, sets: 1, repMin: 0, repMax: 0, seconds: (p.experience === "beginner" ? 8 : 10) * 60, restSec: 0 };
  }
  if (ex.loading === "time") {
    return { ...base, sets: 2, repMin: 0, repMax: 0, seconds: p.experience === "beginner" ? 20 : 40, restSec: 60 };
  }
  const [repMin, repMax] = repRange(p, ex, priority);
  return { ...base, sets: baseSets(p, ex, priority), repMin, repMax, restSec: restFor(p, ex), ...(ex.grips?.[0] ? { grip: ex.grips[0] } : {}) };
}
