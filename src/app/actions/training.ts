"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adaptToLocation, shortenSession } from "@/engine/adapt";
import { estimateMinutes } from "@/engine/duration";
import { ENGINE_VERSION, generatePlan, rebuildSession } from "@/engine/generator";
import { prescribe } from "@/engine/prescribe";
import { parseProfile } from "@/engine/profile";
import { suggestNext } from "@/engine/progression";
import { substitutes } from "@/engine/select";
import { PATTERN_MUSCLES } from "@/engine/templates";
import { PATTERNS, type Exercise, type ExercisePref, type Pattern, type Plan, type PlannedSession } from "@/engine/types";
import { validatePlan } from "@/engine/validate";
import { weeklySets } from "@/engine/volume";
import { translator, exName } from "@/i18n";
import { requireUser } from "@/lib/auth";
import {
  addCustomExercise, createPlan, deletePlan, exerciseHistory, getActivePlan, getPlan, getPlanVersion, getPrefs, getProfile, getSettings, getWorkout, libraryFor,
  renamePlan, saveProfile, savePlanVersion, saveSettings, setPlanStatus, setPref, upsertWorkout, type WorkoutPayload,
} from "@/lib/data";
import { nowIso } from "@/lib/db";
import { planSchema } from "@/lib/schemas";

function generatedName(locale: "pl" | "en" | "de", split: string) {
  const t = translator(locale);
  return t("plan.generatedName", { split: t(`split.${split}`) });
}

/** The wizard's "exercises I don't want" list is stored as "exclude" preferences. */
async function syncExcluded(userId: string, exclude: unknown) {
  const ids = z.array(z.string().regex(/^[a-z0-9_-]{1,80}$/)).max(60).safeParse(exclude);
  if (!ids.success) return;
  const library = await libraryFor(userId);
  const want = new Set(ids.data.filter((id) => library.some((e) => e.id === id)));
  const prefs = await getPrefs(userId);
  for (const id of want) if (prefs[id] !== "exclude") await setPref(userId, id, "exclude");
  for (const [id, pref] of Object.entries(prefs)) if (pref === "exclude" && !want.has(id)) await setPref(userId, id, "neutral");
}

export async function saveProfileAndGenerate(raw: unknown, exclude?: string[]): Promise<{ error?: string }> {
  const user = await requireUser();
  let profile;
  try {
    profile = await saveProfile(user.id, parseProfile(raw));
  } catch {
    return { error: "invalid_profile" };
  }
  if (exclude) await syncExcluded(user.id, exclude);
  const library = await libraryFor(user.id);
  const plan = generatePlan({ profile, prefs: await getPrefs(user.id), library });
  const active = await getActivePlan(user.id);
  // Regenerating a generated plan adds a version; a manual/imported plan is never overwritten.
  let planId: string;
  if (active && active.source === "generated") {
    await savePlanVersion(user.id, active.id, plan, "regenerated");
    planId = active.id;
  } else planId = await createPlan(user.id, generatedName(user.locale, plan.split), "generated", plan, null, true);
  await saveSettings(user.id, { onboarded: true, modules: { training: true, nutrition: true } });
  revalidatePath("/", "layout");
  // The plan is saved already; the review lets the user swap exercises before using it.
  redirect(`/training/review/${planId}`);
}

const reviewSchema = z.array(z.object({
  sessionKey: z.string().max(64), index: z.number().int().min(0).max(30),
  from: z.string().regex(/^[a-z0-9_-]{1,80}$/), to: z.string().regex(/^[a-z0-9_-]{1,80}$/),
})).max(60);

/**
 * Applies the choices from the plan review. Each swap is checked against the same substitutes the
 * review offered (equipment at that session's location, preferences, pain rules). Chosen
 * alternatives become favourites so a later regeneration keeps them.
 */
export async function applyReview(planId: string, raw: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const swaps = reviewSchema.safeParse(raw);
  if (!swaps.success) return { error: "invalid" };
  const [plan, profile, prefs, library] = await Promise.all([getPlan(user.id, planId), getProfile(user.id), getPrefs(user.id), libraryFor(user.id)]);
  if (!plan || !profile) return { error: "not_found" };
  const data = plan.data;
  const chosen = new Set<string>();
  for (const sw of swaps.data) {
    const session = data.sessions.find((x) => x.key === sw.sessionKey);
    const slot = session?.exercises[sw.index];
    const original = library.find((e) => e.id === sw.from);
    if (!session || !slot || slot.exerciseId !== sw.from || !original) continue;
    const equipment = profile.locations.find((l) => l.id === session.locationId)?.equipment ?? [];
    const allowed = substitutes(original, { profile, prefs, library, equipment, excludeIds: new Set(session.exercises.map((e) => e.exerciseId)) });
    const to = allowed.find((e) => e.id === sw.to);
    if (!to) continue;
    session.exercises[sw.index] = { ...prescribe(profile, to, slot.priority), sets: slot.sets, superset: slot.superset };
    chosen.add(to.id);
  }
  if (chosen.size) {
    const lookup = (id: string) => library.find((e) => e.id === id);
    for (const s of data.sessions) s.estimatedMinutes = estimateMinutes(s.exercises, lookup);
    data.weeklySets = weeklySets(data.sessions, lookup);
    await savePlanVersion(user.id, planId, data, "review");
    for (const id of chosen) if (prefs[id] !== "favorite") await setPref(user.id, id, "favorite");
  }
  revalidatePath("/", "layout");
  redirect("/training");
}

export async function saveProfileOnly(raw: unknown, exclude?: string[]): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    await saveProfile(user.id, parseProfile(raw));
  } catch {
    return { error: "invalid_profile" };
  }
  if (exclude) await syncExcluded(user.id, exclude);
  revalidatePath("/training");
  return {};
}

export async function savePlanEdit(planId: string, raw: unknown, note: string | null) {
  const user = await requireUser();
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) return { error: "invalid_plan" };
  const plan = parsed.data as Plan;
  const library = await libraryFor(user.id);
  const lookup = (id: string) => library.find((e) => e.id === id);
  for (const s of plan.sessions) s.estimatedMinutes = estimateMinutes(s.exercises, lookup);
  plan.weeklySets = weeklySets(plan.sessions, lookup);
  const v = await savePlanVersion(user.id, planId, plan, note?.slice(0, 120) ?? "edited");
  if (v === null) return { error: "not_found" };
  revalidatePath("/training");
  return { version: v };
}

export async function planAction(planId: string, action: "activate" | "archive" | "deactivate" | "duplicate" | "rename", name?: string) {
  const user = await requireUser();
  const plan = await getPlan(user.id, planId);
  if (!plan) return;
  if (action === "activate") await setPlanStatus(user.id, planId, "active");
  if (action === "archive") await setPlanStatus(user.id, planId, "archived");
  if (action === "deactivate") await setPlanStatus(user.id, planId, "inactive");
  if (action === "rename" && name?.trim()) await renamePlan(user.id, planId, name.trim().slice(0, 60));
  if (action === "duplicate") {
    const id = await createPlan(user.id, `${plan.name} (2)`.slice(0, 60), plan.source, plan.data, `copy of ${plan.name}`, false);
    revalidatePath("/training");
    redirect(`/training/plan/${id}`);
  }
  revalidatePath("/training");
}

export async function restoreVersion(planId: string, version: number) {
  const user = await requireUser();
  const data = await getPlanVersion(user.id, planId, version);
  if (!data) return;
  await savePlanVersion(user.id, planId, data, `restored v${version}`);
  revalidatePath(`/training/plan/${planId}`);
}

export async function setExercisePref(exerciseId: string, pref: ExercisePref) {
  const user = await requireUser();
  if (!/^[a-z0-9_-]{1,80}$/.test(exerciseId)) return;
  if (!["favorite", "like", "neutral", "dislike", "exclude", "pain"].includes(pref)) return;
  await setPref(user.id, exerciseId, pref);
  revalidatePath("/training/exercises");
}

const customSchema = z.object({
  name: z.string().trim().min(1).max(80),
  pattern: z.enum(PATTERNS),
  loading: z.enum(["total", "per_dumbbell", "per_side", "bodyweight", "bodyweight_plus", "assisted", "time"]),
});

function customFrom(input: z.infer<typeof customSchema>): Omit<Exercise, "id"> {
  const isolation = ["knee_ext", "knee_flex", "calf", "chest_fly", "lateral_raise", "rear_delt", "elbow_flex", "elbow_ext", "core"].includes(input.pattern);
  return {
    name: { pl: input.name, en: input.name, de: input.name },
    primary: PATTERN_MUSCLES[input.pattern], secondary: [], pattern: input.pattern,
    // Custom exercises carry no equipment requirement: the user created them for a place they train at.
    equipment: [], kind: input.loading === "bodyweight" || input.loading === "bodyweight_plus" ? "bodyweight" : "machine",
    mechanics: isolation ? "isolation" : "compound", skill: 1, fatigue: isolation ? "low" : "moderate", stable: true, loading: input.loading,
    cue: {}, custom: true,
  };
}

export async function createCustomExercise(raw: unknown): Promise<{ id?: string; error?: string }> {
  const user = await requireUser();
  const p = customSchema.safeParse(raw);
  if (!p.success) return { error: "invalid" };
  const id = await addCustomExercise(user.id, customFrom(p.data));
  revalidatePath("/training/exercises");
  return { id };
}

// ── Import ───────────────────────────────────────────────────────────────
const importSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sessions: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        exercises: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(80),
              exerciseId: z.string().max(80).nullable(),
              pattern: z.enum(PATTERNS),
              sets: z.number().int().min(1).max(12),
              repMin: z.number().int().min(0).max(100),
              repMax: z.number().int().min(0).max(100),
              seconds: z.number().int().min(1).max(7200).optional(),
              weightKg: z.number().min(0).max(500).optional(),
            }),
          )
          .min(1)
          .max(20),
      }),
    )
    .min(1)
    .max(7),
});

export async function saveImportedPlan(raw: unknown): Promise<{ error?: string; id?: string }> {
  const user = await requireUser();
  const p = importSchema.safeParse(raw);
  if (!p.success) return { error: "invalid" };
  const profile = await getProfile(user.id);
  let library = await libraryFor(user.id);
  const sessions: PlannedSession[] = [];
  const customCache = new Map<string, string>();
  for (const [i, s] of p.data.sessions.entries()) {
    const exercises = [];
    for (const e of s.exercises) {
      let id = e.exerciseId && library.some((x) => x.id === e.exerciseId) ? e.exerciseId : null;
      if (!id) {
        const key = `${e.name.toLowerCase()}|${e.pattern}`;
        id = customCache.get(key) ?? await addCustomExercise(user.id, customFrom({ name: e.name, pattern: e.pattern, loading: e.seconds ? "time" : "total" }));
        customCache.set(key, id);
      }
      exercises.push({
        exerciseId: id, sets: e.sets, repMin: e.seconds ? 0 : Math.min(e.repMin || 8, e.repMax || 12), repMax: e.seconds ? 0 : Math.max(e.repMin || 8, e.repMax || 12),
        ...(e.seconds ? { seconds: e.seconds } : {}), restSec: 90, effort: "leave_1_3" as const, progression: e.seconds ? ("time" as const) : ("double" as const),
        pattern: e.pattern as Pattern, priority: 2 as const,
        ...(e.weightKg ? { startKg: e.weightKg } : {}),
      });
    }
    sessions.push({ key: String.fromCharCode(65 + i), template: "IMPORTED", name: s.name, day: null, locationId: profile?.locations[0]?.id ?? "", exercises, estimatedMinutes: 0 } as PlannedSession);
  }
  library = await libraryFor(user.id);
  const lookup = (id: string) => library.find((x) => x.id === id);
  for (const s of sessions) s.estimatedMinutes = estimateMinutes(s.exercises, lookup);
  const plan: Plan = { engineVersion: ENGINE_VERSION, split: "imported", sessions, weeklySets: weeklySets(sessions, lookup), tradeoffs: [], notes: [] };
  const id = await createPlan(user.id, p.data.name, "imported", plan, "imported", true);
  await saveSettings(user.id, { onboarded: true });
  revalidatePath("/", "layout");
  return { id };
}

/** "Optimise for my time and equipment": deterministic adaptation of an existing plan, saved as a new version. */
export async function optimizePlan(planId: string) {
  const user = await requireUser();
  const plan = await getPlan(user.id, planId);
  const profile = await getProfile(user.id);
  if (!plan || !profile) return { error: "no_profile" };
  const ctx = { profile, prefs: await getPrefs(user.id), library: await libraryFor(user.id) };
  const days = profile.week.map((d, i) => ({ d, i })).filter((x) => !x.d.rest && x.d.locations.length);
  const changes: string[] = [];
  const sessions = plan.data.sessions.map((s, idx) => {
    const slot = days.length ? days[Math.round((idx * days.length) / plan.data.sessions.length) % days.length]! : null;
    const locationId = slot ? slot.d.locations[0]! : profile.locations[0]!.id;
    const adapted = adaptToLocation({ ...s, day: slot ? (slot.i as PlannedSession["day"]) : null }, locationId, ctx);
    const short = shortenSession(adapted.session, profile.sessionMinutes, ctx);
    changes.push(...adapted.changes.map((c) => c.code), ...short.changes.map((c) => c.code));
    return short.session;
  });
  const lookup = (id: string) => ctx.library.find((x) => x.id === id);
  const next: Plan = { ...plan.data, sessions, weeklySets: weeklySets(sessions, lookup), tradeoffs: [...plan.data.tradeoffs] };
  await savePlanVersion(user.id, planId, next, "optimized");
  revalidatePath(`/training/plan/${planId}`);
  return { changes: changes.length };
}

export async function analyzePlan(planId: string) {
  const user = await requireUser();
  const plan = await getPlan(user.id, planId);
  const profile = await getProfile(user.id);
  if (!plan || !profile) return { error: "no_profile" as const };
  return { issues: validatePlan({ plan: plan.data, profile, prefs: await getPrefs(user.id), library: await libraryFor(user.id) }) };
}

// ── Workouts ─────────────────────────────────────────────────────────────
/** Pseudo-place for "no equipment at all today". */
const NO_EQUIPMENT = "__none";

export async function startWorkout(planId: string | null, sessionKey: string | null, minutes?: number, place?: string) {
  const user = await requireUser();
  const library = await libraryFor(user.id);
  const plan = planId ? await getPlan(user.id, planId) : null;
  const session = plan?.data.sessions.find((s) => s.key === sessionKey) ?? null;
  let exercises = session?.exercises ?? [];
  const t = translator(user.locale);
  const mins = minutes && minutes >= 10 && minutes <= 120 ? minutes : undefined;
  const profile = mins || place ? await getProfile(user.id) : null;
  const loc = place && place !== NO_EQUIPMENT ? profile?.locations.find((l) => l.id === place) : undefined;
  let locationId = session?.locationId ?? null;
  const suffix: string[] = [];
  if (session && profile && (mins || place)) {
    const prefs = await getPrefs(user.id);
    if (place) {
      // Another place / no equipment: rebuild the same session for what's available (not just strip it).
      const equipment = place === NO_EQUIPMENT ? [] : loc?.equipment ?? [];
      const rebuilt = rebuildSession(profile, session, equipment, { prefs, library, minutes: mins });
      const adapted = rebuilt?.session ?? adaptToLocation(session, place === NO_EQUIPMENT ? session.locationId : place, { profile, prefs, library }).session;
      exercises = rebuilt || !mins ? adapted.exercises : shortenSession(adapted, mins, { profile, prefs, library }).session.exercises;
      locationId = place === NO_EQUIPMENT ? null : place;
      suffix.push(place === NO_EQUIPMENT ? t("today.noEquipment") : loc?.name ?? "");
    } else if (mins) {
      // "Shorter workout": keep the most important work for the time available (the plan itself is unchanged).
      exercises = shortenSession(session, mins, { profile, prefs, library }).session.exercises;
    }
    if (mins) suffix.push(`${mins} ${t("common.min")}`);
  }
  const id = crypto.randomUUID();
  const histories = await Promise.all(exercises.map((pe) => exerciseHistory(user.id, pe.exerciseId, 3)));
  const payload: WorkoutPayload = {
    id, planId: plan?.id ?? null, planVersion: plan?.current_version ?? null, sessionKey: session?.key ?? null,
    name: session ? `${session.name ?? t(`template.${session.template}`)}${suffix.filter(Boolean).length ? ` (${suffix.filter(Boolean).join(", ")})` : ""}` : t("workout.emptyWorkout"),
    locationId, mode: (await getSettings(user.id)).logMode, status: "in_progress",
    startedAt: nowIso(), endedAt: null, notes: null, clientUpdatedAt: nowIso(),
    exercises: exercises.map((pe, i) => {
      const ex = library.find((e) => e.id === pe.exerciseId);
      const hist = histories[i]!;
      const sug = ex ? suggestNext(ex, pe, hist) : { kind: "insufficient_data" as const };
      const lastSets = hist[0]?.sets.filter((s) => s.type !== "warmup") ?? [];
      const w = sug.kind === "increase_load" || sug.kind === "add_reps" ? sug.weightKg : sug.kind === "consider_reduce" ? null : lastSets[0]?.weightKg ?? null;
      return {
        id: `${id}:${i}`, exerciseId: pe.exerciseId, name: exName(ex, user.locale, pe.exerciseId), loading: ex?.loading ?? "total",
        target: { sets: pe.sets, repMin: pe.repMin, repMax: pe.repMax, seconds: pe.seconds, restSec: pe.restSec, effort: pe.effort, priority: pe.priority, grip: pe.grip },
        completed: false, skipped: false, notes: null,
        sets: Array.from({ length: pe.sets }, (_, j) => ({
          id: `${id}:${i}:${j}`, type: "working" as const, reps: null, weightKg: w ?? lastSets[j]?.weightKg ?? (hist.length ? null : pe.startKg ?? null), rir: null, rpe: null, durationS: null, completed: false,
        })),
      };
    }),
  };
  await upsertWorkout(user.id, payload);
  redirect(`/workout/${id}`);
}

/** Make the exercises done today the plan's permanent version of that session (new plan version). */
export async function applyWorkoutToPlan(workoutId: string) {
  const user = await requireUser();
  const w = await getWorkout(user.id, workoutId);
  if (!w?.planId || !w.sessionKey) return;
  const plan = await getPlan(user.id, w.planId);
  const profile = await getProfile(user.id);
  if (!plan) return;
  const library = await libraryFor(user.id);
  const lookup = (id: string) => library.find((e) => e.id === id);
  const sessions = plan.data.sessions.map((s) => {
    if (s.key !== w.sessionKey) return s;
    const exercises = w.exercises
      .filter((e) => !e.skipped)
      .map((e) => {
        const old = s.exercises.find((x) => x.exerciseId === e.exerciseId);
        const ex = lookup(e.exerciseId);
        const base = old ?? (ex && profile ? prescribe(profile, ex, 2) : null);
        return base ? { ...base, sets: Math.max(1, e.sets.filter((x) => x.type !== "warmup").length || base.sets) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    return { ...s, exercises, estimatedMinutes: estimateMinutes(exercises, lookup), locationId: w.locationId ?? s.locationId };
  });
  await savePlanVersion(user.id, plan.id, { ...plan.data, sessions, weeklySets: weeklySets(sessions, lookup) }, "from workout");
  revalidatePath("/training");
}

export async function createManualPlan() {
  const user = await requireUser();
  const t = translator(user.locale);
  const profile = await getProfile(user.id);
  const plan: Plan = {
    engineVersion: ENGINE_VERSION, split: "custom",
    sessions: [{ key: "A", template: "IMPORTED", name: `${t("template.IMPORTED")} A`, day: null, locationId: profile?.locations[0]?.id ?? "", exercises: [], estimatedMinutes: 0 }],
    weeklySets: {}, tradeoffs: [], notes: [],
  };
  const id = await createPlan(user.id, t("plan.newName"), "manual", plan, null, false);
  redirect(`/training/plan/${id}`);
}

export async function deletePlanAction(planId: string) {
  const user = await requireUser();
  await deletePlan(user.id, planId);
  revalidatePath("/", "layout");
  redirect("/training");
}

const feedbackSchema = z.object({
  reasons: z.array(z.enum(["too_long", "too_short", "fewer_days", "more_days", "more_upper", "more_lower", "too_hard", "more_machines", "more_free", "more_bodyweight"])).max(10),
  dislike: z.array(z.string().regex(/^[a-z0-9_-]{1,80}$/)).max(30),
});
export type PlanFeedback = z.infer<typeof feedbackSchema>;

/** "I don't like this plan": turn the reasons into concrete profile/preference changes and regenerate. */
export async function regenerateWithFeedback(raw: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const fb = feedbackSchema.safeParse(raw);
  if (!fb.success || (!fb.data.reasons.length && !fb.data.dislike.length)) return { error: "empty" };
  const profile = await getProfile(user.id);
  if (!profile) redirect("/training/setup");
  const r = new Set(fb.data.reasons);
  const p = { ...profile, priorities: { ...profile.priorities } };
  const days = p.week.filter((d) => !d.rest && d.locations.length).length;
  if (r.has("too_long")) p.sessionMinutes = Math.max(20, Math.round((p.sessionMinutes * 0.75) / 5) * 5);
  if (r.has("too_short")) p.sessionMinutes = Math.min(120, p.sessionMinutes + 15);
  if (r.has("fewer_days")) p.sessionsPerWeek = Math.max(1, Math.min(p.sessionsPerWeek, days) - 1);
  if (r.has("more_days")) p.sessionsPerWeek = Math.min(6, Math.max(1, days), p.sessionsPerWeek + 1);
  if (r.has("more_upper")) {
    for (const m of ["chest", "lats", "upper_back", "side_delts"] as const) p.priorities[m] = "high";
    for (const m of ["quads", "hamstrings", "glutes"] as const) if (p.priorities[m] === "high") delete p.priorities[m];
  }
  if (r.has("more_lower")) {
    for (const m of ["quads", "hamstrings", "glutes"] as const) p.priorities[m] = "high";
    for (const m of ["chest", "lats", "upper_back", "side_delts"] as const) if (p.priorities[m] === "high") delete p.priorities[m];
  }
  if (r.has("too_hard")) p.experience = p.experience === "advanced" ? "intermediate" : "beginner";
  const styles = (["machines", "free", "bodyweight"] as const).filter((s) => r.has(`more_${s}` as "more_machines"));
  if (styles.length) p.styles = [...styles];
  for (const id of fb.data.dislike) await setPref(user.id, id, "dislike");

  const saved = await saveProfile(user.id, p);
  const plan = generatePlan({ profile: saved, prefs: await getPrefs(user.id), library: await libraryFor(user.id) });
  const active = await getActivePlan(user.id);
  if (active && active.source === "generated") await savePlanVersion(user.id, active.id, plan, `feedback: ${[...r, ...fb.data.dislike.map((d) => `-${d}`)].join(", ")}`.slice(0, 120));
  else await createPlan(user.id, generatedName(user.locale, plan.split), "generated", plan, "feedback", true);
  revalidatePath("/", "layout");
  return {};
}

/** "Not today, later": the session stays next in line (the rotation does not move on). */
export async function postponeSession(planId: string, sessionKey: string) {
  await recordNotToday(planId, sessionKey, "postponed");
}

/** "Skip it": record the session as skipped so the rotation moves on to the next one. */
export async function skipSession(planId: string, sessionKey: string) {
  await recordNotToday(planId, sessionKey, "skipped");
}

async function recordNotToday(planId: string, sessionKey: string, note: "skipped" | "postponed") {
  const user = await requireUser();
  const plan = await getPlan(user.id, planId);
  const session = plan?.data.sessions.find((s) => s.key === sessionKey);
  if (!plan || !session) return;
  const t = translator(user.locale);
  const now = nowIso();
  await upsertWorkout(user.id, {
    id: crypto.randomUUID(), planId, planVersion: plan.current_version, sessionKey, name: session.name ?? t(`template.${session.template}`),
    locationId: session.locationId, mode: "simple", status: "abandoned", startedAt: now, endedAt: now, notes: note, clientUpdatedAt: now, exercises: [],
  });
  revalidatePath("/");
}
