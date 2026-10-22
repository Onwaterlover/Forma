import type { Muscle, MusclePriority, Pattern, TrainingProfile } from "./types";

export interface Slot {
  pattern: Pattern;
  /** 1 = keep at almost any cost, 2 = important, 3 = optional (first to go when time is short). */
  priority: 1 | 2 | 3;
}

export type Region = "legs" | "pull" | "push" | "grip";

export interface Template {
  id: string;
  focus: "full" | "upper" | "lower" | "push" | "pull" | "legs" | "arms_delts";
  slots: Slot[];
  /** Rough relative demand per region, used only for scheduling around sports and spacing. */
  load: Partial<Record<Region, number>>;
}

const s = (pattern: Pattern, priority: 1 | 2 | 3): Slot => ({ pattern, priority });

export const TEMPLATES: Record<string, Template> = {
  FULL_A: {
    id: "FULL_A", focus: "full", load: { legs: 1, push: 0.7, pull: 0.7, grip: 0.4 },
    slots: [s("squat", 1), s("h_push", 1), s("h_pull", 1), s("hinge", 2), s("lateral_raise", 3), s("elbow_ext", 3), s("core", 3)],
  },
  FULL_B: {
    id: "FULL_B", focus: "full", load: { legs: 1, push: 0.7, pull: 0.7, grip: 0.5 },
    slots: [s("hinge", 1), s("v_pull", 1), s("v_push", 2), s("single_leg", 2), s("rear_delt", 3), s("elbow_flex", 3), s("calf", 3)],
  },
  FULL_C: {
    id: "FULL_C", focus: "full", load: { legs: 1, push: 0.7, pull: 0.7, grip: 0.4 },
    slots: [s("single_leg", 1), s("h_push", 1), s("h_pull", 1), s("knee_flex", 2), s("lateral_raise", 3), s("elbow_flex", 3), s("elbow_ext", 3)],
  },
  UPPER_A: {
    id: "UPPER_A", focus: "upper", load: { push: 1, pull: 1, grip: 0.6 },
    // Arms at priority 2: on upper days direct biceps/triceps work should survive a short session.
    slots: [s("h_push", 1), s("h_pull", 1), s("v_push", 2), s("v_pull", 2), s("elbow_flex", 2), s("elbow_ext", 2), s("lateral_raise", 3)],
  },
  UPPER_B: {
    id: "UPPER_B", focus: "upper", load: { push: 1, pull: 1, grip: 0.6 },
    slots: [s("v_pull", 1), s("h_push", 1), s("h_pull", 2), s("lateral_raise", 2), s("elbow_ext", 2), s("elbow_flex", 2), s("chest_fly", 3), s("rear_delt", 3)],
  },
  LOWER_A: {
    id: "LOWER_A", focus: "lower", load: { legs: 1.2 },
    slots: [s("squat", 1), s("knee_flex", 2), s("single_leg", 2), s("calf", 3), s("core", 3)],
  },
  // The only lower day of the week: both basic leg movements (squat pattern and hip hinge) are mandatory.
  LOWER_FULL: {
    id: "LOWER_FULL", focus: "lower", load: { legs: 1.3, grip: 0.3 },
    slots: [s("squat", 1), s("hinge", 1), s("knee_flex", 2), s("single_leg", 2), s("calf", 3), s("core", 3)],
  },
  LOWER_B: {
    id: "LOWER_B", focus: "lower", load: { legs: 1.2, grip: 0.3 },
    slots: [s("hinge", 1), s("single_leg", 1), s("knee_ext", 2), s("hip_ext", 3), s("calf", 3), s("core", 3)],
  },
  PUSH: {
    id: "PUSH", focus: "push", load: { push: 1.2 },
    slots: [s("h_push", 1), s("v_push", 1), s("chest_fly", 2), s("lateral_raise", 2), s("elbow_ext", 2)],
  },
  PULL: {
    id: "PULL", focus: "pull", load: { pull: 1.2, grip: 1 },
    slots: [s("v_pull", 1), s("h_pull", 1), s("rear_delt", 2), s("elbow_flex", 2), s("core", 3)],
  },
  LEGS: {
    id: "LEGS", focus: "legs", load: { legs: 1.3 },
    slots: [s("squat", 1), s("hinge", 1), s("knee_flex", 2), s("knee_ext", 2), s("calf", 3), s("core", 3)],
  },
  ARMS_DELTS: {
    id: "ARMS_DELTS", focus: "arms_delts", load: { push: 0.5, pull: 0.5, grip: 0.5 },
    slots: [s("lateral_raise", 1), s("elbow_flex", 1), s("elbow_ext", 1), s("rear_delt", 2), s("chest_fly", 3)],
  },
};

/** Muscles a slot is mainly meant to train (used for priority adjustments). */
export const PATTERN_MUSCLES: Record<Pattern, Muscle[]> = {
  squat: ["quads", "glutes"],
  hinge: ["hamstrings", "glutes"],
  single_leg: ["quads", "glutes"],
  knee_ext: ["quads"],
  knee_flex: ["hamstrings"],
  hip_ext: ["glutes"],
  calf: ["calves"],
  h_push: ["chest"],
  v_push: ["front_delts"],
  chest_fly: ["chest"],
  h_pull: ["upper_back", "lats"],
  v_pull: ["lats"],
  lateral_raise: ["side_delts"],
  rear_delt: ["rear_delts"],
  elbow_flex: ["biceps"],
  elbow_ext: ["triceps"],
  core: ["abs"],
  conditioning: [],
};

/** Which slot to add when a muscle is prioritised but the template has no direct work for it. */
export const PRIORITY_SLOT: Partial<Record<Muscle, Pattern>> = {
  chest: "chest_fly", lats: "v_pull", upper_back: "h_pull", side_delts: "lateral_raise", rear_delts: "rear_delt",
  front_delts: "v_push", biceps: "elbow_flex", triceps: "elbow_ext", quads: "knee_ext", hamstrings: "knee_flex",
  glutes: "hip_ext", calves: "calf", abs: "core",
};

const UPPER: Muscle[] = ["chest", "lats", "upper_back", "front_delts", "side_delts", "rear_delts", "biceps", "triceps"];
const LOWER: Muscle[] = ["quads", "hamstrings", "glutes"];

export function priorityOf(p: TrainingProfile, m: Muscle): MusclePriority {
  return p.priorities[m] ?? "normal";
}

const isLow = (x: MusclePriority) => x === "low" || x === "maintain";

export type SplitKind = "full_body" | "upper_lower" | "ppl";
/** Which kind of split a split name is (the automatic choice is shown as "recommended" in the interview). */
export const splitKind = (split: string): SplitKind => (/push|ppl/.test(split) ? "ppl" : /upper|lower/.test(split) ? "upper_lower" : "full_body");

/** Whether a chosen split can be built for n sessions (otherwise the automatic one is used). */
export const splitFits = (kind: SplitKind, n: number) => (kind === "ppl" ? n >= 3 : kind === "upper_lower" ? n >= 2 : true);

/**
 * The week's templates: the person's chosen split when it can be built for this many sessions,
 * otherwise (or with "auto") the automatic choice.
 */
export function splitFor(p: TrainingProfile, n: number): { split: string; templates: string[] } {
  const auto = autoSplit(p, n);
  const pref = p.splitPref ?? "auto";
  const k = Math.max(1, Math.min(n, 6));
  if (pref === "auto" || splitKind(auto.split) === pref || !splitFits(pref, k)) return auto;
  const cycle = (ts: string[]) => Array.from({ length: k }, (_, i) => ts[i % ts.length]!);
  if (pref === "full_body") return { split: "full_body", templates: cycle(["FULL_A", "FULL_B", "FULL_C"]) };
  if (pref === "upper_lower") {
    if (k === 3) {
      const legsHigh = LOWER.some((m) => priorityOf(p, m) === "high") && !UPPER.some((m) => priorityOf(p, m) === "high");
      return legsHigh ? { split: "lower_upper_lower", templates: ["LOWER_A", "UPPER_A", "LOWER_B"] } : { split: "upper_lower_upper", templates: ["UPPER_A", "LOWER_FULL", "UPPER_B"] };
    }
    return { split: "upper_lower", templates: cycle(["UPPER_A", "LOWER_A", "UPPER_B", "LOWER_B"]) };
  }
  if (k === 4) return { split: "ppl_upper", templates: ["PUSH", "PULL", "LEGS", "UPPER_A"] };
  if (k === 5) return { split: "ppl_upper_lower", templates: ["PUSH", "PULL", "LEGS", "UPPER_A", "LOWER_A"] };
  return { split: "push_pull_legs", templates: cycle(["PUSH", "PULL", "LEGS"]) };
}

/** The automatic split from the number of sessions, level and muscle priorities. */
export function autoSplit(p: TrainingProfile, n: number): { split: string; templates: string[] } {
  const legsLow = LOWER.every((m) => isLow(priorityOf(p, m)));
  const legsHigh = LOWER.some((m) => priorityOf(p, m) === "high");
  const upperHigh = UPPER.some((m) => priorityOf(p, m) === "high");
  const novice = p.experience === "beginner" || p.goal === "start" || p.goal === "health" || p.goal === "unsure";

  switch (Math.max(1, Math.min(n, 6))) {
    case 1:
      return { split: "full_body", templates: ["FULL_A"] };
    case 2:
      return { split: "full_body", templates: ["FULL_A", "FULL_B"] };
    case 3:
      if (!novice && legsLow && upperHigh) return { split: "upper_lower_upper", templates: ["UPPER_A", "LOWER_FULL", "UPPER_B"] };
      if (!novice && legsHigh && !upperHigh) return { split: "lower_upper_lower", templates: ["LOWER_A", "UPPER_A", "LOWER_B"] };
      // Short sessions can't fit a proper whole-body workout; half the body per session leaves room for real work.
      if (!novice && p.sessionMinutes <= 30) return { split: "upper_lower_upper", templates: ["UPPER_A", "LOWER_FULL", "UPPER_B"] };
      return { split: "full_body", templates: ["FULL_A", "FULL_B", "FULL_C"] };
    case 4:
      if (legsLow) return { split: "upper_lower_upper_plus", templates: ["UPPER_A", "LOWER_FULL", "UPPER_B", "ARMS_DELTS"] };
      return { split: "upper_lower", templates: ["UPPER_A", "LOWER_A", "UPPER_B", "LOWER_B"] };
    case 5:
      if (novice) return { split: "full_body", templates: ["FULL_A", "FULL_B", "FULL_C", "FULL_A", "FULL_B"] };
      if (legsLow) return { split: "upper_lower_push_pull_arms", templates: ["UPPER_A", "LOWER_FULL", "PUSH", "PULL", "ARMS_DELTS"] };
      return { split: "upper_lower_ppl", templates: ["UPPER_A", "LOWER_A", "PUSH", "PULL", "LEGS"] };
    default:
      if (novice) return { split: "upper_lower", templates: ["UPPER_A", "LOWER_A", "UPPER_B", "LOWER_B", "UPPER_A", "LOWER_A"] };
      if (legsLow) return { split: "ppl_upper_arms", templates: ["PUSH", "PULL", "LOWER_FULL", "UPPER_B", "ARMS_DELTS", "PULL"] };
      return { split: "push_pull_legs", templates: ["PUSH", "PULL", "LEGS", "PUSH", "PULL", "LEGS"] };
  }
}
