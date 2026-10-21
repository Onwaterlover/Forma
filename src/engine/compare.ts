import type { Exercise } from "./types";

/** One difference of an alternative versus the recommended exercise; `good` = in the alternative's favour. */
export type Diff = { key: DiffKey; good: boolean };
export type DiffKey =
  | "progressionBetter" | "progressionWorse"
  | "easier" | "harder"
  | "faster" | "slower"
  | "moreStable" | "lessStable"
  | "lessTiring" | "moreTiring"
  | "moreMuscles" | "targeted"
  | "guided" | "freeWeight"
  | "similar";

// How easily load can be added in small steps (drives long-term progression).
const LOAD_RANK: Record<string, number> = { total: 3, per_dumbbell: 3, per_side: 3, assisted: 2, bodyweight_plus: 2, bodyweight: 1, time: 1 };
const FATIGUE = { low: 0, moderate: 1, high: 2 } as const;
const MACHINE = new Set(["machine", "cable", "smith"]);

/**
 * What changes if the user picks `alt` instead of `rec`: at most two differences, most important first
 * (progression, technique, time, machine or stability, fatigue, then the kind of movement). Nothing is invented:
 * each line comes from the exercise data.
 */
export function compareTo(alt: Exercise, rec: Exercise): Diff[] {
  const out: Diff[] = [];
  const la = LOAD_RANK[alt.loading] ?? 1;
  const lr = LOAD_RANK[rec.loading] ?? 1;
  if (la !== lr) out.push(la > lr ? { key: "progressionBetter", good: true } : { key: "progressionWorse", good: false });
  if (alt.skill !== rec.skill) out.push(alt.skill < rec.skill ? { key: "easier", good: true } : { key: "harder", good: false });
  if (!!alt.unilateral !== !!rec.unilateral) out.push(alt.unilateral ? { key: "slower", good: false } : { key: "faster", good: true });
  // Machine vs free weight already says it: a machine is the stable one.
  const machineDiff = MACHINE.has(alt.kind) !== MACHINE.has(rec.kind);
  if (machineDiff) out.push(MACHINE.has(alt.kind) ? { key: "guided", good: true } : { key: "freeWeight", good: true });
  else if (alt.stable !== rec.stable) out.push(alt.stable ? { key: "moreStable", good: true } : { key: "lessStable", good: false });
  if (alt.fatigue !== rec.fatigue) out.push(FATIGUE[alt.fatigue] < FATIGUE[rec.fatigue] ? { key: "lessTiring", good: true } : { key: "moreTiring", good: false });
  if (alt.mechanics !== rec.mechanics) out.push(alt.mechanics === "compound" ? { key: "moreMuscles", good: true } : { key: "targeted", good: true });
  return out.length ? out.slice(0, 2) : [{ key: "similar", good: true }];
}
