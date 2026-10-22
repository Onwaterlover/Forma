import { score, type SelectContext } from "./select";
import type { Exercise, Muscle } from "./types";

/** One difference of an alternative versus the recommended exercise; `good` = in the alternative's favour. */
export type Diff = { key: DiffKey; good: boolean; emphasis?: string; muscles?: Muscle[] };
export type DiffKey =
  | "progressionBetter" | "progressionWorse"
  | "easier" | "harder"
  | "faster" | "slower"
  | "moreStable" | "lessStable"
  | "lessTiring" | "moreTiring"
  | "moreMuscles" | "targeted"
  | "guided" | "freeWeight"
  | "focus"
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
  // Different training focus comes first and is always shown: it changes what the slot trains, not just how.
  const focus: Diff[] = [];
  if (alt.emphasis !== rec.emphasis) focus.push({ key: "focus", good: true, emphasis: alt.emphasis ?? `${rec.emphasis}_off` });
  else {
    const more = alt.primary.filter((m) => !rec.primary.includes(m));
    if (more.length) focus.push({ key: "focus", good: true, muscles: more });
  }
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
  return [...focus, ...(out.length ? out.slice(0, 2) : focus.length ? [] : [{ key: "similar", good: true } as Diff])];
}

export type Verdict = "same" | "slightly" | "much";

/**
 * How much is lost by doing `alt` instead of the recommended `rec`, as one short label. Judged on effectiveness
 * for this person (goal, level, time) with the generator's own scoring; styles and likes are left out, since
 * they are about taste, not about how well the exercise trains. Losing the main muscle or the ability to add
 * load (past the beginner stage, for muscle or strength) always counts as a big difference.
 */
export function verdictOf(alt: Exercise, rec: Exercise, ctx: Pick<SelectContext, "profile" | "equipment" | "library">, priority: 1 | 2 | 3 = 2): Verdict {
  const p = ctx.profile;
  // Technique difficulty is shown separately ("harder"); for the verdict a beginner is judged like anyone else.
  const judged = { ...p, styles: [], experience: p.experience === "beginner" ? ("intermediate" as const) : p.experience };
  const full: SelectContext = { ...ctx, profile: judged, prefs: {}, usedInSession: new Set(), usedInWeek: new Map() };
  // No main muscle in common: the slot would train something else.
  if (rec.primary.length && !alt.primary.some((m) => rec.primary.includes(m))) return "much";
  // No way to add load where the recommendation has one: a real loss for muscle or strength (a smaller one for beginners).
  const loadDrop = (LOAD_RANK[alt.loading] ?? 1) <= 1 && (LOAD_RANK[rec.loading] ?? 1) >= 2 && (p.goal === "muscle" || p.goal === "strength");
  const gap = score(rec, priority, full) - score(alt, priority, full);
  if (gap >= 2.5 || (loadDrop && p.experience !== "beginner")) return "much";
  return gap >= 1 || loadDrop ? "slightly" : "same";
}
