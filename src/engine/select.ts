import { isPossible } from "./equipment";
import type { Equipment, Exercise, ExercisePref, Experience, Kind, Pattern, TrainingProfile } from "./types";

export interface SelectContext {
  profile: TrainingProfile;
  equipment: Equipment[];
  prefs: Record<string, ExercisePref>;
  library: Exercise[];
  usedInSession: Set<string>;
  usedInWeek: Map<string, number>;
}

const MACHINE_KINDS: Kind[] = ["machine", "cable", "smith"];
const FREE_KINDS: Kind[] = ["barbell", "dumbbell", "kettlebell"];
const PROGRESSABLE = new Set(["total", "per_dumbbell", "per_side", "bodyweight_plus", "assisted"]);
const LOWER_BODY = new Set<Pattern>(["squat", "hinge", "single_leg", "knee_flex", "knee_ext", "hip_ext", "calf"]);
/**
 * Where bodyweight training holds up well. For rows, overhead pressing, legs and small isolation work
 * added load matters, so a "bodyweight" preference does not steer those away from weights when
 * weights are available; with no weights the bodyweight options are still the only candidates.
 */
// Dips, push-ups, pull-ups and core work; rows and overhead pressing progress better with load.
const BODYWEIGHT_SUITED = new Set<Pattern>(["h_push", "v_pull", "core", "conditioning"]);

/**
 * Conservative pain rule: if the user marked an exercise as painful, we do not automatically pick
 * any other exercise with the same movement pattern that shares a primary muscle. Similar ≠ safe.
 */
export function painBlocked(ex: Exercise, prefs: Record<string, ExercisePref>, library: Exercise[]): boolean {
  if (prefs[ex.id] === "pain") return true;
  return library.some(
    (o) => prefs[o.id] === "pain" && o.pattern === ex.pattern && o.primary.some((m) => ex.primary.includes(m)),
  );
}

export function difficultyAllowed(ex: Exercise, experience: Experience, pref?: ExercisePref): boolean {
  return !(experience === "beginner" && ex.skill === 3 && pref !== "favorite");
}

export function isAllowed(ex: Exercise, ctx: Pick<SelectContext, "profile" | "equipment" | "prefs" | "library">): boolean {
  const pref = ctx.prefs[ex.id];
  if (pref === "exclude") return false;
  if (painBlocked(ex, ctx.prefs, ctx.library)) return false;
  if (!isPossible(ex, ctx.equipment, ctx.profile.excludedKinds)) return false;
  return difficultyAllowed(ex, ctx.profile.experience, pref);
}

export function score(ex: Exercise, priority: 1 | 2 | 3, ctx: SelectContext): number {
  const p = ctx.profile;
  let s = 0;
  s += { favorite: 4, like: 2, neutral: 0, dislike: -6, exclude: -99, pain: -99 }[ctx.prefs[ex.id] ?? "neutral"];

  // Preferred styles (multi-select). Matching exercises get a clear bonus; others a small penalty.
  const styles = p.styles.filter((st) => st !== "bodyweight" || BODYWEIGHT_SUITED.has(ex.pattern));
  if (styles.length) {
    const matches = styles.some((st) =>
      st === "machines" ? MACHINE_KINDS.includes(ex.kind) : st === "free" ? FREE_KINDS.includes(ex.kind) : ex.kind === "bodyweight" || ex.kind === "band",
    );
    s += matches ? 2 : -0.75;
  }
  // One side at a time doubles the time per set; prefer a two-sided equivalent when one exists.
  if (ex.unilateral) s -= 0.75;

  if (p.goal === "strength" && priority === 1 && ex.mechanics === "compound") s += ex.kind === "barbell" ? 2 : ex.kind === "machine" ? 0.5 : 0;
  if (p.goal === "health" || p.goal === "start" || p.goal === "unsure") s += (ex.skill === 1 ? 1 : 0) - (ex.fatigue === "high" ? 1 : 0);
  if (p.experience === "beginner") s += ex.skill === 1 ? 1 : ex.skill === 2 ? -0.5 : -2;
  if (p.sessionMinutes <= 30 && ex.fatigue === "high") s -= 0.5;
  if (PROGRESSABLE.has(ex.loading)) s += 0.5;
  if (p.goal === "muscle" || p.goal === "strength") {
    // Controlled, loadable exercises make progressive overload easier to apply and track.
    if (ex.stable) s += 0.5;
    if (ex.kind === "bodyweight" && LOWER_BODY.has(ex.pattern)) s -= 0.75;
    // Main slots should hold a substantial lift, not a low-demand accessory.
    if (p.experience !== "beginner" && priority === 1 && ex.mechanics === "compound" && ex.fatigue !== "low") s += 0.75;
    // Held weights cap leg loading quickly once someone is past the beginner stage.
    if (p.experience !== "beginner" && priority === 1 && LOWER_BODY.has(ex.pattern) && (ex.kind === "dumbbell" || ex.kind === "kettlebell")) s -= 0.5;
  }

  // Beginners benefit from repeating the same lifts; others get a little variety across the week.
  const uses = ctx.usedInWeek.get(ex.id) ?? 0;
  s += p.experience === "beginner" ? uses * 0.5 : -0.6 * uses;
  return s;
}

export type PickResult = { exercise: Exercise; disliked: boolean } | { exercise: null; reason: "pain" | "none" };

export function pick(pattern: Pattern, priority: 1 | 2 | 3, ctx: SelectContext): PickResult {
  const candidates = ctx.library.filter((e) => e.pattern === pattern && !ctx.usedInSession.has(e.id) && isAllowed(e, ctx));
  if (candidates.length === 0) {
    const painOnly = ctx.library.some(
      (e) => e.pattern === pattern && isPossible(e, ctx.equipment, ctx.profile.excludedKinds) && painBlocked(e, ctx.prefs, ctx.library),
    );
    return { exercise: null, reason: painOnly ? "pain" : "none" };
  }
  // Stable, deterministic ordering: score desc, then library order.
  let best = candidates[0]!;
  let bestScore = score(best, priority, ctx);
  for (const c of candidates.slice(1)) {
    const sc = score(c, priority, ctx);
    if (sc > bestScore) {
      best = c;
      bestScore = sc;
    }
  }
  return { exercise: best, disliked: ctx.prefs[best.id] === "dislike" };
}

/** Ranked alternatives for swapping an exercise (same pattern first, then shared primary muscles). */
export function substitutes(
  original: Exercise,
  ctx: Pick<SelectContext, "profile" | "equipment" | "prefs" | "library"> & { excludeIds?: Set<string> },
): Exercise[] {
  const full: SelectContext = { ...ctx, usedInSession: ctx.excludeIds ?? new Set(), usedInWeek: new Map() };
  return ctx.library
    .filter((e) => e.id !== original.id && !full.usedInSession.has(e.id))
    .filter((e) => e.pattern === original.pattern || e.primary.some((m) => original.primary.includes(m)))
    .filter((e) => e.pattern !== "conditioning" || original.pattern === "conditioning")
    .filter((e) => isAllowed(e, full))
    .map((e) => ({ e, s: (e.pattern === original.pattern ? 10 : 0) + score(e, 2, full) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.e);
}
