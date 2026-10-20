import { estimateMinutes } from "./duration";
import { EXERCISES } from "./exercises";
import { fitToTime } from "./fit";
import { prescribe } from "./prescribe";
import { assign, availableDays } from "./schedule";
import { isAllowed, pick, type SelectContext } from "./select";
import { PATTERN_MUSCLES, PRIORITY_SLOT, priorityOf, splitFor, TEMPLATES, type Slot, type Template } from "./templates";
import { validatePlan } from "./validate";
import { BALANCED, weeklySets, weeklyTarget } from "./volume";
import {
  MUSCLES, type Equipment, type Exercise, type ExercisePref, type Message, type Muscle, type Pattern,
  type Plan, type PlannedExercise, type PlannedSession, type TrainingProfile,
} from "./types";

export const ENGINE_VERSION = "1.0.0";

export interface GenerateInput {
  profile: TrainingProfile;
  prefs?: Record<string, ExercisePref>;
  /** Built-in library plus the user's custom exercises. */
  library?: Exercise[];
}

const UPPER_PATTERNS: Pattern[] = ["h_push", "v_push", "chest_fly", "h_pull", "v_pull", "lateral_raise", "rear_delt", "elbow_flex", "elbow_ext"];
const LOWER_PATTERNS: Pattern[] = ["squat", "hinge", "single_leg", "knee_ext", "knee_flex", "hip_ext", "calf"];
const FOCUS_PATTERNS: Record<Template["focus"], Pattern[]> = {
  full: [...UPPER_PATTERNS, ...LOWER_PATTERNS, "core"],
  upper: [...UPPER_PATTERNS, "core"],
  lower: [...LOWER_PATTERNS, "core"],
  legs: [...LOWER_PATTERNS, "core"],
  push: ["h_push", "v_push", "chest_fly", "lateral_raise", "elbow_ext", "core"],
  pull: ["h_pull", "v_pull", "rear_delt", "elbow_flex", "core"],
  arms_delts: ["lateral_raise", "rear_delt", "elbow_flex", "elbow_ext", "chest_fly", "core"],
};

const SLOT_WEIGHT = { 1: 3, 2: 2, 3: 1 } as const;

function climbsOften(p: TrainingProfile) {
  return p.sports.some((s) => (s.type === "climbing" || s.type === "bouldering") && s.perWeek >= 2);
}

/** Template slots after applying the user's muscle priorities, sports and conditioning wishes. */
export function adjustedSlots(t: Template, p: TrainingProfile): Slot[] {
  const out: Slot[] = [];
  for (const slot of t.slots) {
    const ms = PATTERN_MUSCLES[slot.pattern];
    const prios = ms.map((m) => priorityOf(p, m));
    let pr = slot.priority;
    if (prios.some((x) => x === "high")) pr = Math.max(1, pr - 1) as 1 | 2;
    else if (ms.length && prios.every((x) => x === "maintain")) {
      if (pr !== 1) continue;
      pr = 2;
    } else if (ms.length && prios.every((x) => x === "low" || x === "maintain")) pr = Math.min(3, pr + 1) as 2 | 3;
    // Frequent climbing already gives a lot of pulling/grip work: keep direct biceps work optional.
    if (slot.pattern === "elbow_flex" && climbsOften(p) && priorityOf(p, "biceps") !== "high") pr = 3;
    out.push({ pattern: slot.pattern, priority: pr });
  }
  let added = 0;
  for (const m of MUSCLES) {
    const pat = PRIORITY_SLOT[m];
    if (added >= 2 || !pat || priorityOf(p, m) !== "high") continue;
    if (!FOCUS_PATTERNS[t.focus].includes(pat) || out.some((s) => s.pattern === pat)) continue;
    out.push({ pattern: pat, priority: 2 });
    added++;
  }
  const conditioning = p.goal === "conditioning" || p.conditioning || p.secondaryGoals?.includes("conditioning");
  if (conditioning) out.push({ pattern: "conditioning", priority: p.goal === "conditioning" ? 2 : 3 });
  return out;
}

function orderKey(pe: PlannedExercise, lookup: (id: string) => Exercise | undefined): number {
  if (pe.pattern === "conditioning") return 3;
  if (pe.pattern === "core") return 2;
  return lookup(pe.exerciseId)?.mechanics === "compound" ? 0 : 1;
}

function balanceVolume(sessions: PlannedSession[], p: TrainingProfile, lookup: (id: string) => Exercise | undefined) {
  const maxSets = { beginner: 3, intermediate: 4, advanced: 5 }[p.experience];
  const gaveUp = new Set<Muscle>();
  for (let iter = 0; iter < 80; iter++) {
    const ws = weeklySets(sessions, lookup);
    let worst: Muscle | null = null;
    let worstRatio = 0.15;
    for (const m of BALANCED) {
      const pr = priorityOf(p, m);
      if (gaveUp.has(m) || pr === "low" || pr === "maintain") continue;
      const target = weeklyTarget(p, m);
      const ratio = (target - (ws[m] ?? 0)) / target;
      if (ratio > worstRatio) {
        worst = m;
        worstRatio = ratio;
      }
    }
    if (!worst) return;
    let cand: PlannedExercise | null = null;
    for (const s of sessions) {
      for (const pe of s.exercises) {
        const ex = lookup(pe.exerciseId);
        if (!ex || !ex.primary.includes(worst) || pe.sets >= maxSets || pe.seconds) continue;
        pe.sets++;
        const fits = estimateMinutes(s.exercises, lookup) <= p.sessionMinutes;
        pe.sets--;
        if (!fits) continue;
        if (!cand || pe.priority < cand.priority || (pe.priority === cand.priority && pe.sets < cand.sets)) cand = pe;
      }
    }
    if (cand) cand.sets++;
    else gaveUp.add(worst);
  }
}

export function generatePlan(input: GenerateInput): Plan {
  const p = input.profile;
  const prefs = input.prefs ?? {};
  const library = input.library ?? EXERCISES;
  const byId = new Map(library.map((e) => [e.id, e]));
  const lookup = (id: string) => byId.get(id);
  const tradeoffs: Message[] = [];
  const notes: Message[] = [];

  const days = availableDays(p);
  const requested = Math.max(1, Math.round(p.sessionsPerWeek));
  const empty: Plan = { engineVersion: ENGINE_VERSION, split: "none", sessions: [], weeklySets: {}, tradeoffs, notes };
  if (days.length === 0) {
    tradeoffs.push({ code: "no_days_available" });
    return empty;
  }
  const n = Math.min(requested, days.length, 6);
  if (requested > days.length) tradeoffs.push({ code: "fewer_days_than_requested", params: { requested, available: days.length } });
  else if (requested > 6) tradeoffs.push({ code: "capped_sessions", params: { requested, planned: 6 } });

  const { split, templates } = splitFor(p, n);
  notes.push({ code: "split", params: { split } });

  const slotCache = new Map<string, Slot[]>();
  const slotsFor = (tid: string) => {
    if (!slotCache.has(tid)) slotCache.set(tid, adjustedSlots(TEMPLATES[tid]!, p));
    return slotCache.get(tid)!;
  };

  const covCache = new Map<string, number>();
  const coverage = (tid: string, equipment: Equipment[]) => {
    const key = `${tid}|${[...equipment].sort().join(",")}`;
    if (!covCache.has(key)) {
      const ctx = { profile: p, equipment, prefs, library };
      let have = 0;
      let total = 0;
      for (const slot of slotsFor(tid)) {
        const w = SLOT_WEIGHT[slot.priority];
        total += w;
        if (library.some((e) => e.pattern === slot.pattern && isAllowed(e, ctx))) have += w;
      }
      covCache.set(key, total ? have / total : 0);
    }
    return covCache.get(key)!;
  };

  const assignments = assign(p, templates.slice(0, n), coverage).sort((a, b) => a.day - b.day);
  const usedInWeek = new Map<string, number>();
  const sessions: PlannedSession[] = assignments.map((a, idx) => {
    const key = String.fromCharCode(65 + idx);
    const loc = p.locations.find((l) => l.id === a.locationId)!;
    const ctx: SelectContext = { profile: p, equipment: loc.equipment, prefs, library, usedInSession: new Set(), usedInWeek };
    let exercises: PlannedExercise[] = [];
    for (const slot of slotsFor(a.template)) {
      const r = pick(slot.pattern, slot.priority, ctx);
      if (!r.exercise) {
        if (r.reason === "pain") notes.push({ code: "pain_pattern_skipped", params: { pattern: slot.pattern, session: key } });
        else if (slot.priority <= 2) tradeoffs.push({ code: "slot_unfillable", params: { pattern: slot.pattern, session: key } });
        continue;
      }
      if (r.disliked) notes.push({ code: "disliked_kept", params: { exercise: r.exercise.id, session: key } });
      ctx.usedInSession.add(r.exercise.id);
      usedInWeek.set(r.exercise.id, (usedInWeek.get(r.exercise.id) ?? 0) + 1);
      exercises.push(prescribe(p, r.exercise, slot.priority));
    }
    exercises = exercises
      .map((pe, i) => ({ pe, i }))
      .sort((x, y) => orderKey(x.pe, lookup) - orderKey(y.pe, lookup) || x.i - y.i)
      .map((x) => x.pe);
    const fitted = fitToTime(exercises, p.sessionMinutes, p, lookup);
    for (const t of fitted.tradeoffs) tradeoffs.push({ code: t.code, params: { ...t.params, session: key } });
    return { key, template: a.template, day: a.day, locationId: a.locationId, exercises: fitted.exercises, estimatedMinutes: 0 };
  });

  balanceVolume(sessions, p, lookup);
  for (const s of sessions) s.estimatedMinutes = estimateMinutes(s.exercises, lookup);

  if (p.experience === "beginner") notes.push({ code: "beginner_effort" });
  if (p.scheduleMode === "flexible") notes.push({ code: "flexible_schedule" });
  if (climbsOften(p)) notes.push({ code: "sport_pull_overlap" });
  if (p.sports.some((s) => ["cycling", "running", "football"].includes(s.type))) notes.push({ code: "sport_legs_scheduled" });
  const reduced = BALANCED.filter((m) => ["low", "maintain"].includes(priorityOf(p, m)));
  if (reduced.length) tradeoffs.push({ code: "reduced_volume_muscles", params: { muscles: reduced.join(",") } });

  const plan: Plan = { engineVersion: ENGINE_VERSION, split, sessions, weeklySets: weeklySets(sessions, lookup), tradeoffs, notes };

  // Defensive repair: anything that still violates a hard rule is removed and reported, never kept silently.
  const errors = validatePlan({ plan, profile: p, prefs, library }).filter((i) => i.severity === "error" && i.exerciseId);
  if (errors.length) {
    for (const e of errors) {
      const s = plan.sessions.find((x) => x.key === e.session);
      if (s) s.exercises = s.exercises.filter((x) => x.exerciseId !== e.exerciseId);
      tradeoffs.push({ code: "removed_invalid", params: { exercise: e.exerciseId!, reason: e.code } });
    }
    plan.weeklySets = weeklySets(plan.sessions, lookup);
    for (const s of plan.sessions) s.estimatedMinutes = estimateMinutes(s.exercises, lookup);
  }
  return plan;
}
