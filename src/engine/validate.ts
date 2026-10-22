import { estimateMinutes } from "./duration";
import { isPossible } from "./equipment";
import { availableDays, sportDemands } from "./schedule";
import { painBlocked } from "./select";
import { BALANCED, weeklySets } from "./volume";
import type { Exercise, ExercisePref, Issue, Muscle, Plan, PlannedSession, TrainingProfile } from "./types";

export interface ValidateInput {
  plan: Plan;
  profile: TrainingProfile;
  prefs: Record<string, ExercisePref>;
  library: Exercise[];
}

const LOWER_PATTERNS = new Set(["squat", "hinge", "single_leg", "knee_ext", "knee_flex", "hip_ext"]);
const PULL_PATTERNS = new Set(["h_pull", "v_pull", "elbow_flex"]);

/** Hard-constraint and plausibility checks, independent of how the plan was produced (generator, import, edit). */
export function validatePlan({ plan, profile, prefs, library }: ValidateInput): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(library.map((e) => [e.id, e]));
  const lookup = (id: string) => byId.get(id);
  const locs = new Map(profile.locations.map((l) => [l.id, l]));
  const err = (code: string, extra: Partial<Issue> = {}) => issues.push({ severity: "error", code, ...extra });
  const warn = (code: string, extra: Partial<Issue> = {}) => issues.push({ severity: "warning", code, ...extra });

  const days = availableDays(profile);
  if (plan.sessions.length > Math.max(days.length, 0) && profile.scheduleMode === "fixed") {
    err("more_sessions_than_days", { params: { sessions: plan.sessions.length, days: days.length } });
  }

  const usedDays = new Map<number, string>();
  for (const s of plan.sessions) {
    const loc = locs.get(s.locationId);
    if (!loc) err("unknown_location", { session: s.key });
    if (s.day !== null) {
      const day = profile.week[s.day];
      if (!day || day.rest || day.locations.length === 0) err("day_unavailable", { session: s.key, params: { day: s.day } });
      else if (!day.locations.includes(s.locationId)) err("location_not_on_day", { session: s.key, params: { day: s.day } });
      if (usedDays.has(s.day)) warn("two_sessions_same_day", { session: s.key, params: { day: s.day } });
      usedDays.set(s.day, s.key);
    }
    if (s.exercises.length === 0) warn("empty_session", { session: s.key });

    const seen = new Set<string>();
    for (const pe of s.exercises) {
      const ex = lookup(pe.exerciseId);
      if (!ex) {
        err("unknown_exercise", { session: s.key, exerciseId: pe.exerciseId });
        continue;
      }
      const at = { session: s.key, exerciseId: ex.id };
      if (seen.has(ex.id)) err("duplicate_exercise", at);
      seen.add(ex.id);
      if (loc && !isPossible(ex, loc.equipment, profile.excludedKinds)) err("equipment_unavailable", at);
      if (prefs[ex.id] === "exclude") err("excluded_used", at);
      if (prefs[ex.id] === "pain") err("pain_used", at);
      else if (painBlocked(ex, prefs, library)) warn("pain_related_pattern", at);
      if (profile.experience === "beginner" && ex.skill === 3 && prefs[ex.id] !== "favorite") warn("too_difficult", at);
      if (pe.sets < 1 || pe.sets > 8) err("invalid_sets", at);
      if (!pe.seconds && (pe.repMin < 1 || pe.repMax < pe.repMin || pe.repMax > 50)) err("invalid_reps", at);
      if (pe.sets > 5) warn("many_sets", at);
    }

    const est = estimateMinutes(s.exercises, lookup);
    if (est > profile.sessionMinutes * 1.3 + 2) err("over_time", { session: s.key, params: { minutes: est, limit: profile.sessionMinutes } });
    else if (est > profile.sessionMinutes * 1.1 + 1) warn("over_time", { session: s.key, params: { minutes: est, limit: profile.sessionMinutes } });

    checkSports(s, profile, lookup, warn);
  }

  // Weekly plausibility and priorities.
  const ws = weeklySets(plan.sessions, lookup);
  for (const m of BALANCED) if ((ws[m] ?? 0) > 25) warn("volume_high", { params: { muscle: m, sets: ws[m] ?? 0 } });
  if (plan.sessions.length > 0) {
    const normal = BALANCED.filter((m) => (profile.priorities[m] ?? "normal") === "normal").map((m) => ws[m] ?? 0).sort((a, b) => a - b);
    const median = normal.length ? normal[Math.floor(normal.length / 2)]! : 0;
    for (const m of BALANCED) {
      const pr = profile.priorities[m] ?? "normal";
      const have = ws[m] ?? 0;
      if (pr === "high" && normal.length && have < median) warn("priority_not_met", { params: { muscle: m, sets: have } });
      if ((pr === "low" || pr === "maintain") && normal.length && have > median * 1.2 + 1) warn("low_priority_exceeded", { params: { muscle: m, sets: have } });
    }
    const majors: Muscle[][] = [["chest"], ["lats", "upper_back"], ["quads"], ["hamstrings", "glutes"]];
    for (const group of majors) {
      if (group.every((m) => (ws[m] ?? 0) === 0)) warn("muscle_untrained", { params: { muscle: group[0]! } });
    }
  }
  return issues;
}

function checkSports(
  s: PlannedSession,
  p: TrainingProfile,
  lookup: (id: string) => Exercise | undefined,
  warn: (code: string, extra: Partial<Issue>) => void,
) {
  if (s.day === null) return;
  const heavyLegs = s.exercises.some((pe) => {
    const ex = lookup(pe.exerciseId);
    return ex && LOWER_PATTERNS.has(ex.pattern) && pe.priority === 1;
  });
  const heavyPull = s.exercises.filter((pe) => PULL_PATTERNS.has(lookup(pe.exerciseId)?.pattern ?? "")).length >= 2;
  for (const sp of p.sports) {
    if (sp.intensity === "easy") continue;
    const d = sportDemands(sp);
    const nextDay = (s.day + 1) % 7;
    if (!sp.days.includes(nextDay as never)) continue;
    if (heavyLegs && (d.includes("legs") || d.includes("full"))) warn("sport_conflict", { session: s.key, params: { sport: sp.type, region: "legs" } });
    if (heavyPull && (d.includes("pull") || d.includes("grip"))) warn("sport_conflict", { session: s.key, params: { sport: sp.type, region: "pull" } });
  }
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === "error");

/**
 * Volume bookkeeping (sets per muscle vs. priorities) is for the generator and the assistant, not for people:
 * it can't be acted on and reads like jargon. Only problems someone can actually fix are shown in the app.
 */
const INTERNAL = new Set(["priority_not_met", "low_priority_exceeded", "volume_high", "many_sets", "muscle_untrained"]);
export const userFacing = (issues: Issue[]) => issues.filter((i) => !INTERNAL.has(i.code));
