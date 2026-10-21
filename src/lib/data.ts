import "server-only";
import { EXERCISES } from "@/engine/exercises";
import { parseProfile } from "@/engine/profile";
import type { Exercise, ExercisePref, Grip, Plan, TrainingProfile } from "@/engine/types";
import { emptyNutrients, recipe as recipeCalc, scale, sum, type Ingredient, type Nutrients } from "@/nutrition/calc";
import type { ProductDraft } from "@/nutrition/off";
import { db, json, newId, nowIso, type Q } from "./db";
import { MEASUREMENT_SITES, type Measurement } from "./measurements";

// Every function takes the acting user's id and scopes all reads/writes to it.
// UI visibility is never the security boundary; these queries are.

// ── Settings ─────────────────────────────────────────────────────────────
export interface Settings {
  theme: "system" | "light" | "dark";
  modules: { training: boolean; nutrition: boolean };
  logMode: "simple" | "detailed";
  restTimer: boolean;
  autoTimer: boolean;
  showEffort: boolean;
  showFiber: boolean;
  weightGoal: "maintain" | "lose" | "gain" | "recomp" | null;
  onboarded: boolean;
  /** The user agreed to send the data a question needs to the AI provider. */
  ai: boolean;
  /** Off = "plan only": the plan is shown for reading, without starting or logging workouts. */
  logWorkouts: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "system", modules: { training: true, nutrition: true }, logMode: "detailed", restTimer: true, autoTimer: false,
  showEffort: false, showFiber: false, weightGoal: null, onboarded: false, ai: false, logWorkouts: true,
};

export async function getSettings(userId: string): Promise<Settings> {
  const row = await (await db()).get<{ data: string }>("SELECT data FROM user_settings WHERE user_id = ?", [userId]);
  const s = json<Partial<Settings>>(row?.data, {});
  return { ...DEFAULT_SETTINGS, ...s, modules: { ...DEFAULT_SETTINGS.modules, ...s.modules } };
}

export async function saveSettings(userId: string, patch: Partial<Settings>) {
  const next = { ...(await getSettings(userId)), ...patch };
  await (await db()).run("INSERT INTO user_settings (user_id, data) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET data = excluded.data", [userId, JSON.stringify(next)]);
  return next;
}

export async function setLocale(userId: string, locale: "pl" | "en" | "de") {
  await (await db()).run("UPDATE users SET locale = ? WHERE id = ?", [locale, userId]);
}

// ── Training profile, preferences, custom exercises ──────────────────────
export async function getProfile(userId: string): Promise<TrainingProfile | null> {
  const row = await (await db()).get<{ data: string }>("SELECT data FROM training_profiles WHERE user_id = ?", [userId]);
  if (!row) return null;
  try {
    return parseProfile(JSON.parse(row.data));
  } catch {
    return null;
  }
}

export async function saveProfile(userId: string, profile: TrainingProfile) {
  const p = parseProfile(profile);
  await (await db()).run(
    "INSERT INTO training_profiles (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    [userId, JSON.stringify(p), nowIso()],
  );
  return p;
}

export async function getPrefs(userId: string): Promise<Record<string, ExercisePref>> {
  const rows = await (await db()).all<{ exercise_id: string; pref: ExercisePref }>("SELECT exercise_id, pref FROM exercise_prefs WHERE user_id = ?", [userId]);
  return Object.fromEntries(rows.map((r) => [r.exercise_id, r.pref]));
}

export async function setPref(userId: string, exerciseId: string, pref: ExercisePref) {
  const d = await db();
  if (pref === "neutral") await d.run("DELETE FROM exercise_prefs WHERE user_id = ? AND exercise_id = ?", [userId, exerciseId]);
  else
    await d.run(
      "INSERT INTO exercise_prefs (user_id, exercise_id, pref, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, exercise_id) DO UPDATE SET pref = excluded.pref, updated_at = excluded.updated_at",
      [userId, exerciseId, pref, nowIso()],
    );
}

export async function getCustomExercises(userId: string): Promise<Exercise[]> {
  const rows = await (await db()).all<{ id: string; data: string }>("SELECT id, data FROM custom_exercises WHERE user_id = ? ORDER BY created_at", [userId]);
  return rows.map((r) => ({ ...json<Exercise>(r.data, {} as Exercise), id: r.id, custom: true }));
}

export async function addCustomExercise(userId: string, ex: Omit<Exercise, "id">): Promise<string> {
  const id = `custom_${newId().slice(0, 8)}`;
  await (await db()).run("INSERT INTO custom_exercises (id, user_id, data, created_at) VALUES (?, ?, ?, ?)", [id, userId, JSON.stringify({ ...ex, custom: true }), nowIso()]);
  return id;
}

export async function libraryFor(userId: string): Promise<Exercise[]> {
  return [...EXERCISES, ...(await getCustomExercises(userId))];
}

// ── Plans (versioned) ────────────────────────────────────────────────────
export interface PlanRow {
  id: string;
  name: string;
  status: "active" | "inactive" | "archived";
  source: "generated" | "manual" | "imported";
  current_version: number;
  created_at: string;
  updated_at: string;
}

export async function listPlans(userId: string): Promise<PlanRow[]> {
  return (await db()).all<PlanRow>("SELECT * FROM plans WHERE user_id = ? ORDER BY (status = 'active') DESC, updated_at DESC", [userId]);
}

export async function getPlan(userId: string, planId: string): Promise<(PlanRow & { data: Plan; note: string | null }) | null> {
  const row = await (await db()).get<PlanRow & { data: string; note: string | null }>(
    "SELECT p.*, v.data, v.note FROM plans p JOIN plan_versions v ON v.plan_id = p.id AND v.version = p.current_version WHERE p.id = ? AND p.user_id = ?",
    [planId, userId],
  );
  return row ? { ...row, data: json<Plan>(row.data, null as never) } : null;
}

export async function getActivePlan(userId: string) {
  const row = await (await db()).get<{ id: string }>("SELECT id FROM plans WHERE user_id = ? AND status = 'active' LIMIT 1", [userId]);
  return row ? getPlan(userId, row.id) : null;
}

export async function createPlan(userId: string, name: string, source: PlanRow["source"], data: Plan, note: string | null, activate = true): Promise<string> {
  const id = newId();
  const now = nowIso();
  await (await db()).tx(async (q) => {
    if (activate) await q.run("UPDATE plans SET status = 'inactive' WHERE user_id = ? AND status = 'active'", [userId]);
    await q.run("INSERT INTO plans (id, user_id, name, status, source, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)", [id, userId, name, activate ? "active" : "inactive", source, now, now]);
    await q.run("INSERT INTO plan_versions (plan_id, version, data, note, created_at) VALUES (?, 1, ?, ?, ?)", [id, JSON.stringify(data), note, now]);
  });
  return id;
}

export async function savePlanVersion(userId: string, planId: string, data: Plan, note: string | null): Promise<number | null> {
  return (await db()).tx(async (q) => {
    const p = await q.get<{ current_version: number }>("SELECT current_version FROM plans WHERE id = ? AND user_id = ? FOR UPDATE", [planId, userId]);
    if (!p) return null;
    const max = (await q.get<{ v: number }>("SELECT MAX(version) AS v FROM plan_versions WHERE plan_id = ?", [planId]))!.v;
    const v = max + 1;
    await q.run("INSERT INTO plan_versions (plan_id, version, data, note, created_at) VALUES (?, ?, ?, ?, ?)", [planId, v, JSON.stringify(data), note, nowIso()]);
    await q.run("UPDATE plans SET current_version = ?, updated_at = ? WHERE id = ?", [v, nowIso(), planId]);
    return v;
  });
}

export async function listVersions(userId: string, planId: string) {
  return (await db()).all<{ version: number; note: string | null; created_at: string }>(
    "SELECT v.version, v.note, v.created_at FROM plan_versions v JOIN plans p ON p.id = v.plan_id WHERE p.id = ? AND p.user_id = ? ORDER BY v.version DESC",
    [planId, userId],
  );
}

export async function getPlanVersion(userId: string, planId: string, version: number): Promise<Plan | null> {
  const row = await (await db()).get<{ data: string }>(
    "SELECT v.data FROM plan_versions v JOIN plans p ON p.id = v.plan_id WHERE p.id = ? AND p.user_id = ? AND v.version = ?",
    [planId, userId, version],
  );
  return row ? json<Plan>(row.data, null as never) : null;
}

export async function setPlanStatus(userId: string, planId: string, status: PlanRow["status"]) {
  await (await db()).tx(async (q) => {
    if (status === "active") await q.run("UPDATE plans SET status = 'inactive' WHERE user_id = ? AND status = 'active'", [userId]);
    await q.run("UPDATE plans SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?", [status, nowIso(), planId, userId]);
  });
}

export async function renamePlan(userId: string, planId: string, name: string) {
  await (await db()).run("UPDATE plans SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?", [name, nowIso(), planId, userId]);
}

// ── Workouts ─────────────────────────────────────────────────────────────
export interface WorkoutSet {
  id: string;
  type: "warmup" | "working" | "drop" | "failure";
  reps: number | null;
  weightKg: number | null;
  rir: number | null;
  rpe: number | null;
  durationS: number | null;
  completed: boolean;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  name: string;
  loading: string;
  target: { sets: number; repMin: number; repMax: number; seconds?: number; restSec: number; effort: string; priority?: number; grip?: Grip } | null;
  completed: boolean;
  skipped: boolean;
  notes: string | null;
  sets: WorkoutSet[];
}

export interface WorkoutPayload {
  id: string;
  planId: string | null;
  planVersion: number | null;
  sessionKey: string | null;
  name: string;
  locationId: string | null;
  mode: "simple" | "detailed";
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  clientUpdatedAt: string;
  exercises: WorkoutExercise[];
}

/**
 * Idempotent upsert used by online saves and offline sync. The client generates ids; a payload older than
 * what's stored is ignored (never overwrites newer data); another user's id is rejected.
 */
export async function upsertWorkout(userId: string, w: WorkoutPayload): Promise<"saved" | "stale" | "forbidden"> {
  return (await db()).tx(async (q) => {
    const existing = await q.get<{ user_id: string; client_updated_at: string }>("SELECT user_id, client_updated_at FROM workouts WHERE id = ? FOR UPDATE", [w.id]);
    if (existing && existing.user_id !== userId) return "forbidden";
    if (existing && existing.client_updated_at > w.clientUpdatedAt) return "stale";
    const now = nowIso();
    if (existing) {
      await q.run("UPDATE workouts SET name=?, location_id=?, mode=?, status=?, started_at=?, ended_at=?, notes=?, client_updated_at=?, updated_at=? WHERE id=?",
        [w.name, w.locationId, w.mode, w.status, w.startedAt, w.endedAt, w.notes, w.clientUpdatedAt, now, w.id]);
      await q.run("DELETE FROM workout_exercises WHERE workout_id = ?", [w.id]);
    } else {
      await q.run("INSERT INTO workouts (id, user_id, plan_id, plan_version, session_key, name, location_id, mode, status, started_at, ended_at, notes, client_updated_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [w.id, userId, w.planId, w.planVersion, w.sessionKey, w.name, w.locationId, w.mode, w.status, w.startedAt, w.endedAt, w.notes, w.clientUpdatedAt, now]);
    }
    for (const [i, e] of w.exercises.entries()) {
      const weId = `${w.id}:${i}`;
      await q.run("INSERT INTO workout_exercises (id, workout_id, position, exercise_id, exercise_name, loading, target, completed, skipped, notes) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [weId, w.id, i, e.exerciseId, e.name, e.loading, e.target ? JSON.stringify(e.target) : null, e.completed ? 1 : 0, e.skipped ? 1 : 0, e.notes]);
      for (const [j, s] of e.sets.entries()) {
        await q.run("INSERT INTO workout_sets (id, workout_exercise_id, position, set_type, reps, weight_kg, rir, rpe, duration_s, completed) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [`${weId}:${j}`, weId, j, s.type, s.reps, s.weightKg, s.rir, s.rpe, s.durationS, s.completed ? 1 : 0]);
      }
    }
    return "saved";
  });
}

export async function getWorkout(userId: string, id: string): Promise<WorkoutPayload | null> {
  const d = await db();
  const w = await d.get<Record<string, unknown>>("SELECT * FROM workouts WHERE id = ? AND user_id = ?", [id, userId]);
  if (!w) return null;
  const exs = await d.all<Record<string, unknown>>("SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY position", [id]);
  const sets = await d.all<Record<string, unknown>>(
    "SELECT s.* FROM workout_sets s JOIN workout_exercises e ON e.id = s.workout_exercise_id WHERE e.workout_id = ? ORDER BY s.position",
    [id],
  );
  return {
    id: w.id as string, planId: (w.plan_id as string) ?? null, planVersion: (w.plan_version as number) ?? null, sessionKey: (w.session_key as string) ?? null,
    name: w.name as string, locationId: (w.location_id as string) ?? null, mode: w.mode as "simple", status: w.status as "completed",
    startedAt: w.started_at as string, endedAt: (w.ended_at as string) ?? null, notes: (w.notes as string) ?? null, clientUpdatedAt: w.client_updated_at as string,
    exercises: exs.map((e) => ({
      id: e.id as string, exerciseId: e.exercise_id as string, name: e.exercise_name as string, loading: e.loading as string,
      target: json(e.target, null), completed: e.completed === 1, skipped: e.skipped === 1, notes: (e.notes as string) ?? null,
      sets: sets.filter((s) => s.workout_exercise_id === e.id).map((s) => ({
        id: s.id as string, type: s.set_type as WorkoutSet["type"], reps: (s.reps as number) ?? null, weightKg: (s.weight_kg as number) ?? null,
        rir: (s.rir as number) ?? null, rpe: (s.rpe as number) ?? null, durationS: (s.duration_s as number) ?? null, completed: s.completed === 1,
      })),
    })),
  };
}

export async function listWorkouts(userId: string, limit = 50) {
  return (await db()).all<{ id: string; name: string; status: string; mode: string; started_at: string; ended_at: string | null; session_key: string | null; notes: string | null; done_exercises: number; logged_sets: number }>(
    `SELECT w.id, w.name, w.status, w.mode, w.started_at, w.ended_at, w.session_key, w.notes,
      (SELECT COUNT(*) FROM workout_exercises e WHERE e.workout_id = w.id AND (e.completed = 1 OR EXISTS (SELECT 1 FROM workout_sets s WHERE s.workout_exercise_id = e.id AND s.completed = 1)))::int AS done_exercises,
      (SELECT COUNT(*) FROM workout_sets s JOIN workout_exercises e ON e.id = s.workout_exercise_id WHERE e.workout_id = w.id AND s.completed = 1 AND s.reps IS NOT NULL)::int AS logged_sets
     FROM workouts w WHERE w.user_id = ? ORDER BY w.started_at DESC LIMIT ?`,
    [userId, limit],
  );
}

export async function inProgressWorkout(userId: string) {
  return (await db()).get<{ id: string; name: string }>("SELECT id, name FROM workouts WHERE user_id = ? AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1", [userId]);
}

export async function lastCompletedSessionKey(userId: string, planId: string): Promise<string | null> {
  const r = await (await db()).get<{ session_key: string | null }>(
    "SELECT session_key FROM workouts WHERE user_id = ? AND plan_id = ? AND (status = 'completed' OR notes = 'skipped') ORDER BY started_at DESC LIMIT 1",
    [userId, planId],
  );
  return r?.session_key ?? null;
}

/** Logged history for one exercise, newest first, only sessions with real set data. */
export async function exerciseHistory(userId: string, exerciseId: string, limit = 10) {
  const d = await db();
  const exs = await d.all<{ id: string; started_at: string }>(
    `SELECT e.id, w.started_at FROM workout_exercises e JOIN workouts w ON w.id = e.workout_id
     WHERE w.user_id = ? AND e.exercise_id = ? AND w.status = 'completed' ORDER BY w.started_at DESC LIMIT ?`,
    [userId, exerciseId, limit],
  );
  if (!exs.length) return [];
  const rows = await d.all<{ workout_exercise_id: string; set_type: string; reps: number | null; weight_kg: number | null; duration_s: number | null; completed: number }>(
    `SELECT workout_exercise_id, set_type, reps, weight_kg, duration_s, completed FROM workout_sets WHERE workout_exercise_id IN (${exs.map(() => "?").join(",")}) ORDER BY position`,
    exs.map((e) => e.id),
  );
  return exs
    .map((e) => ({
      date: e.started_at,
      sets: rows.filter((s) => s.workout_exercise_id === e.id).map((s) => ({
        type: s.set_type as WorkoutSet["type"], reps: s.reps, weightKg: s.weight_kg, durationS: s.duration_s, completed: s.completed === 1,
      })),
    }))
    .filter((h) => h.sets.some((s) => s.completed && (s.reps !== null || s.durationS !== null)));
}

export async function workoutDatesSince(userId: string, sinceIso: string): Promise<string[]> {
  const rows = await (await db()).all<{ started_at: string }>("SELECT started_at FROM workouts WHERE user_id = ? AND status = 'completed' AND started_at >= ? ORDER BY started_at", [userId, sinceIso]);
  return rows.map((r) => r.started_at);
}

export async function loggedExerciseIds(userId: string): Promise<string[]> {
  const rows = await (await db()).all<{ exercise_id: string }>(
    "SELECT DISTINCT e.exercise_id FROM workout_exercises e JOIN workouts w ON w.id = e.workout_id WHERE w.user_id = ? AND w.status = 'completed'",
    [userId],
  );
  return rows.map((r) => r.exercise_id);
}

export async function deleteWorkout(userId: string, id: string) {
  await (await db()).run("DELETE FROM workouts WHERE id = ? AND user_id = ?", [id, userId]);
}

// ── Food products ────────────────────────────────────────────────────────
export interface Product {
  id: string;
  source: "off" | "custom";
  barcode: string | null;
  name: string;
  brand: string | null;
  basis: "g" | "ml";
  state: "raw" | "cooked" | null;
  nutrients: Nutrients;
  servings: { label: string; amount: number }[];
  mine: boolean;
  favorite?: boolean;
}

type ProductRow = { id: string; owner_user_id: string | null; source: "off" | "custom"; barcode: string | null; name: string; brand: string | null; basis: "g" | "ml"; state: "raw" | "cooked" | null; nutrients: string; servings: string; fav?: number | null };

const toProduct = (r: ProductRow, userId: string): Product => ({
  id: r.id, source: r.source, barcode: r.barcode, name: r.name, brand: r.brand, basis: r.basis, state: r.state,
  nutrients: json<Nutrients>(r.nutrients, emptyNutrients()), servings: json(r.servings, []), mine: r.owner_user_id === userId, favorite: r.fav === 1,
});

const VISIBLE = "(p.owner_user_id IS NULL OR p.owner_user_id = ?)";
const FAV = "(SELECT 1 FROM food_favorites f WHERE f.user_id = ? AND f.product_id = p.id) AS fav";

export async function getProduct(userId: string, id: string): Promise<Product | null> {
  const r = await (await db()).get<ProductRow>(`SELECT p.*, ${FAV} FROM food_products p WHERE p.id = ? AND ${VISIBLE}`, [userId, id, userId]);
  return r ? toProduct(r, userId) : null;
}

export async function productByBarcode(userId: string, barcode: string): Promise<(Product & { fetched_at: string | null }) | null> {
  const r = await (await db()).get<ProductRow & { fetched_at: string | null }>(
    `SELECT p.*, ${FAV} FROM food_products p WHERE p.barcode = ? AND ${VISIBLE} ORDER BY (p.owner_user_id IS NULL) ASC LIMIT 1`,
    [userId, barcode, userId],
  );
  return r ? { ...toProduct(r, userId), fetched_at: r.fetched_at } : null;
}

export async function upsertOffProduct(d: ProductDraft): Promise<string> {
  const q = await db();
  const now = nowIso();
  const existing = await q.get<{ id: string }>("SELECT id FROM food_products WHERE source = 'off' AND barcode = ?", [d.barcode]);
  if (existing) {
    await q.run("UPDATE food_products SET name=?, brand=?, basis=?, nutrients=?, servings=?, fetched_at=?, updated_at=? WHERE id=?",
      [d.name, d.brand, d.basis, JSON.stringify(d.nutrients), JSON.stringify(d.servings), now, now, existing.id]);
    return existing.id;
  }
  const id = newId();
  await q.run(
    "INSERT INTO food_products (id, owner_user_id, source, barcode, name, brand, basis, state, nutrients, servings, fetched_at, updated_at) VALUES (?, NULL, 'off', ?, ?, ?, ?, NULL, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
    [id, d.barcode, d.name, d.brand, d.basis, JSON.stringify(d.nutrients), JSON.stringify(d.servings), now, now],
  );
  // A concurrent request may have inserted the same barcode first.
  return (await q.get<{ id: string }>("SELECT id FROM food_products WHERE source = 'off' AND barcode = ?", [d.barcode]))!.id;
}

export async function saveCustomProduct(
  userId: string,
  p: { id?: string; name: string; brand: string | null; barcode: string | null; basis: "g" | "ml"; state: "raw" | "cooked" | null; nutrients: Nutrients; servings: { label: string; amount: number }[] },
): Promise<string> {
  const q = await db();
  const now = nowIso();
  if (p.id) {
    const n = await q.run("UPDATE food_products SET name=?, brand=?, barcode=?, basis=?, state=?, nutrients=?, servings=?, updated_at=? WHERE id=? AND owner_user_id=?",
      [p.name, p.brand, p.barcode, p.basis, p.state, JSON.stringify(p.nutrients), JSON.stringify(p.servings), now, p.id, userId]);
    if (n === 1) return p.id;
  }
  const id = newId();
  await q.run("INSERT INTO food_products (id, owner_user_id, source, barcode, name, brand, basis, state, nutrients, servings, fetched_at, updated_at) VALUES (?, ?, 'custom', ?, ?, ?, ?, ?, ?, ?, NULL, ?)",
    [id, userId, p.barcode, p.name, p.brand, p.basis, p.state, JSON.stringify(p.nutrients), JSON.stringify(p.servings), now]);
  return id;
}

/**
 * A barcode another family member saved as their own product. Only the product definition (name and
 * values per 100 g) is copied into this user's own products; nobody's diary is shared.
 */
export async function copyFamilyProduct(userId: string, barcode: string): Promise<Product | null> {
  const r = await (await db()).get<ProductRow>(
    "SELECT * FROM food_products WHERE barcode = ? AND source = 'custom' AND owner_user_id IS NOT NULL AND owner_user_id <> ? ORDER BY updated_at DESC LIMIT 1",
    [barcode, userId],
  );
  if (!r) return null;
  const id = await saveCustomProduct(userId, {
    name: r.name, brand: r.brand, barcode, basis: r.basis, state: r.state, nutrients: json(r.nutrients, emptyNutrients()), servings: json(r.servings, []),
  });
  return getProduct(userId, id);
}

export async function searchProducts(userId: string, q: string, limit = 25): Promise<Product[]> {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  if (!terms.length) return [];
  const where = terms.map(() => "(lower(p.name) LIKE ? OR lower(coalesce(p.brand,'')) LIKE ?)").join(" AND ");
  const args = terms.flatMap((t) => [`%${t}%`, `%${t}%`]);
  const rows = await (await db()).all<ProductRow>(
    `SELECT p.*, ${FAV}, (SELECT MAX(d.created_at) FROM diary_entries d WHERE d.user_id = ? AND d.product_id = p.id) AS last_used
     FROM food_products p WHERE ${VISIBLE} AND ${where}
     ORDER BY fav DESC NULLS LAST, last_used DESC NULLS LAST, (p.owner_user_id IS NULL), length(p.name) LIMIT ?`,
    [userId, userId, userId, ...args, limit],
  );
  return rows.map((r) => toProduct(r, userId));
}

export async function recentProducts(userId: string, limit = 20): Promise<(Product & { lastAmount: number })[]> {
  const rows = await (await db()).all<ProductRow & { last_amount: number }>(
    `SELECT p.*, ${FAV}, d.amount AS last_amount FROM food_products p
     JOIN (SELECT DISTINCT ON (product_id) product_id, amount, created_at AS t FROM diary_entries
           WHERE user_id = ? AND product_id IS NOT NULL ORDER BY product_id, created_at DESC) d ON d.product_id = p.id
     WHERE ${VISIBLE} ORDER BY d.t DESC LIMIT ?`,
    [userId, userId, userId, limit],
  );
  return rows.map((r) => ({ ...toProduct(r, userId), lastAmount: r.last_amount }));
}

export async function favoriteProducts(userId: string): Promise<Product[]> {
  const rows = await (await db()).all<ProductRow>(
    `SELECT p.*, 1 AS fav FROM food_products p JOIN food_favorites f ON f.product_id = p.id WHERE f.user_id = ? AND ${VISIBLE} ORDER BY p.name`,
    [userId, userId],
  );
  return rows.map((r) => toProduct(r, userId));
}

export async function setFavorite(userId: string, productId: string, on: boolean) {
  if (!(await getProduct(userId, productId))) return;
  const q = await db();
  if (on) await q.run("INSERT INTO food_favorites (user_id, product_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", [userId, productId, nowIso()]);
  else await q.run("DELETE FROM food_favorites WHERE user_id = ? AND product_id = ?", [userId, productId]);
}

export async function cachedSearch(query: string, maxAgeMs: number): Promise<string[] | null> {
  const r = await (await db()).get<{ barcodes: string; fetched_at: string }>("SELECT barcodes, fetched_at FROM food_search_cache WHERE query = ?", [query]);
  if (!r || Date.now() - Date.parse(r.fetched_at) > maxAgeMs) return null;
  return json<string[]>(r.barcodes, []);
}

export async function storeSearch(query: string, barcodes: string[]) {
  await (await db()).run(
    "INSERT INTO food_search_cache (query, barcodes, fetched_at) VALUES (?, ?, ?) ON CONFLICT (query) DO UPDATE SET barcodes = excluded.barcodes, fetched_at = excluded.fetched_at",
    [query, JSON.stringify(barcodes), nowIso()],
  );
}

export async function productsByBarcodes(userId: string, barcodes: string[]): Promise<Product[]> {
  if (!barcodes.length) return [];
  const rows = await (await db()).all<ProductRow>(
    `SELECT p.*, ${FAV} FROM food_products p WHERE p.source = 'off' AND p.barcode IN (${barcodes.map(() => "?").join(",")})`,
    [userId, ...barcodes],
  );
  const order = new Map(barcodes.map((b, i) => [b, i]));
  return rows.map((r) => toProduct(r, userId)).sort((a, b) => (order.get(a.barcode!) ?? 0) - (order.get(b.barcode!) ?? 0));
}

// ── Diary ────────────────────────────────────────────────────────────────
export interface DiaryEntry {
  id: string;
  date: string;
  meal: string | null;
  productId: string | null;
  recipeId: string | null;
  name: string;
  amount: number;
  basis: string;
  nutrients: Nutrients; // per 100 snapshot
  values: Nutrients; // scaled
  createdAt: string;
}

type EntryRow = { id: string; date: string; meal: string | null; product_id: string | null; recipe_id: string | null; name: string; amount: number; basis: string; nutrients: string; created_at: string };

const toEntry = (r: EntryRow): DiaryEntry => {
  const per100 = json<Nutrients>(r.nutrients, emptyNutrients());
  return { id: r.id, date: r.date, meal: r.meal, productId: r.product_id, recipeId: r.recipe_id, name: r.name, amount: r.amount, basis: r.basis, nutrients: per100, values: scale(per100, r.amount), createdAt: r.created_at };
};

export async function diaryDay(userId: string, date: string) {
  const q = await db();
  const rows = await q.all<EntryRow>("SELECT * FROM diary_entries WHERE user_id = ? AND date = ? ORDER BY created_at", [userId, date]);
  const entries = rows.map(toEntry);
  const flag = await q.get<{ complete: number }>("SELECT complete FROM diary_days WHERE user_id = ? AND date = ?", [userId, date]);
  return { entries, totals: sum(entries.map((e) => e.values)), complete: flag ? flag.complete === 1 : null };
}

async function insertEntry(q: Q, userId: string, r: { id: string; date: string; meal: string | null; product_id: string | null; recipe_id: string | null; name: string; amount: number; basis: string; nutrients: string; created_at: string }) {
  const v = scale(json<Nutrients>(r.nutrients, emptyNutrients()), r.amount);
  await q.run(
    "INSERT INTO diary_entries (id, user_id, date, meal, product_id, recipe_id, name, amount, basis, nutrients, kcal, protein, carbs, fat, fiber, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING",
    [r.id, userId, r.date, r.meal, r.product_id, r.recipe_id, r.name, r.amount, r.basis, r.nutrients, v.kcal, v.protein, v.carbs, v.fat, v.fiber, r.created_at],
  );
}

export async function addEntry(
  userId: string,
  e: { date: string; meal: string | null; amount: number } & (
    | { productId: string }
    | { recipeId: string; mode: "grams" | "servings" }
    | { quick: { name: string; kcal: number; protein?: number | null; carbs?: number | null; fat?: number | null } }
  ),
): Promise<string | null> {
  let name: string;
  let basis = "g";
  let per100: Nutrients;
  let productId: string | null = null;
  let recipeId: string | null = null;
  let amount = e.amount;
  if ("productId" in e) {
    const p = await getProduct(userId, e.productId);
    if (!p) return null;
    name = p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.name} (${p.brand})` : p.name;
    basis = p.basis;
    per100 = p.nutrients;
    productId = p.id;
  } else if ("recipeId" in e) {
    const r = await getRecipe(userId, e.recipeId);
    if (!r) return null;
    name = r.name;
    per100 = r.calc.per100;
    recipeId = r.id;
    if (e.mode === "servings") amount = (r.calc.finalWeight / r.servings) * e.amount;
  } else {
    // Quick entry: the user typed the values for this portion. Stored as "per 100" of a 100 g pseudo-portion.
    name = e.quick.name;
    per100 = { ...emptyNutrients(), kcal: e.quick.kcal, protein: e.quick.protein ?? null, carbs: e.quick.carbs ?? null, fat: e.quick.fat ?? null };
    amount = 100;
    basis = "portion";
  }
  if (!(amount > 0 && amount < 10000)) return null;
  const id = newId();
  await insertEntry(await db(), userId, { id, date: e.date, meal: e.meal, product_id: productId, recipe_id: recipeId, name, amount, basis, nutrients: JSON.stringify(per100), created_at: nowIso() });
  return id;
}

export async function updateEntry(userId: string, id: string, patch: { amount?: number; meal?: string | null }) {
  const q = await db();
  const r = await q.get<EntryRow>("SELECT * FROM diary_entries WHERE id = ? AND user_id = ?", [id, userId]);
  if (!r) return;
  const amount = patch.amount ?? r.amount;
  if (!(amount > 0 && amount < 10000)) return;
  const v = scale(json<Nutrients>(r.nutrients, emptyNutrients()), amount);
  await q.run("UPDATE diary_entries SET amount=?, meal=?, kcal=?, protein=?, carbs=?, fat=?, fiber=? WHERE id=? AND user_id=?",
    [amount, patch.meal === undefined ? r.meal : patch.meal, v.kcal, v.protein, v.carbs, v.fat, v.fiber, id, userId]);
}

/** Deletes an entry and keeps it briefly in an undo buffer (server-side, so undo never trusts client data). */
export async function deleteEntry(userId: string, id: string): Promise<boolean> {
  return (await db()).tx(async (q) => {
    const r = await q.get<EntryRow>("SELECT * FROM diary_entries WHERE id = ? AND user_id = ?", [id, userId]);
    if (!r) return false;
    await q.run("DELETE FROM diary_entries WHERE id = ? AND user_id = ?", [id, userId]);
    await q.run("DELETE FROM undo_buffer WHERE created_at < ?", [new Date(Date.now() - 10 * 60_000).toISOString()]);
    await q.run("INSERT INTO undo_buffer (id, user_id, row_data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING", [id, userId, JSON.stringify(r), nowIso()]);
    return true;
  });
}

export async function undoDelete(userId: string, id: string): Promise<boolean> {
  return (await db()).tx(async (q) => {
    const u = await q.get<{ row_data: string }>("DELETE FROM undo_buffer WHERE id = ? AND user_id = ? RETURNING row_data", [id, userId]);
    if (!u) return false;
    await insertEntry(q, userId, JSON.parse(u.row_data) as EntryRow);
    return true;
  });
}

export async function copyDay(userId: string, from: string, to: string): Promise<number> {
  return (await db()).tx(async (q) => {
    const rows = await q.all<EntryRow>("SELECT * FROM diary_entries WHERE user_id = ? AND date = ? ORDER BY created_at", [userId, from]);
    for (const r of rows) await insertEntry(q, userId, { ...r, id: newId(), date: to, created_at: nowIso() });
    return rows.length;
  });
}

export async function setDayComplete(userId: string, date: string, complete: boolean | null) {
  const q = await db();
  if (complete === null) await q.run("DELETE FROM diary_days WHERE user_id = ? AND date = ?", [userId, date]);
  else await q.run("INSERT INTO diary_days (user_id, date, complete) VALUES (?, ?, ?) ON CONFLICT (user_id, date) DO UPDATE SET complete = excluded.complete", [userId, date, complete ? 1 : 0]);
}

export async function intakeHistory(userId: string, fromDate: string) {
  const rows = await (await db()).all<{ date: string; kcal: number | null; protein: number | null; missing: number; complete: number | null }>(
    `SELECT d.date, SUM(d.kcal) AS kcal, SUM(d.protein) AS protein, SUM(CASE WHEN d.kcal IS NULL THEN 1 ELSE 0 END)::int AS missing, MAX(dd.complete) AS complete
     FROM diary_entries d LEFT JOIN diary_days dd ON dd.user_id = d.user_id AND dd.date = d.date
     WHERE d.user_id = ? AND d.date >= ? GROUP BY d.date ORDER BY d.date`,
    [userId, fromDate],
  );
  return rows.map((r) => ({ date: r.date, kcal: r.kcal ?? 0, protein: r.protein ?? 0, missing: r.missing, complete: r.complete === null ? undefined : r.complete === 1 }));
}

// ── Recipes & saved meals ────────────────────────────────────────────────
export interface Recipe {
  id: string;
  name: string;
  ingredients: (Ingredient & { productId: string | null })[];
  cookedYieldG: number | null;
  servings: number;
  isMeal: boolean;
  calc: ReturnType<typeof recipeCalc>;
}

type RecipeRow = { id: string; name: string; ingredients: string; cooked_yield_g: number | null; servings: number; is_meal: number };
const toRecipe = (r: RecipeRow): Recipe => {
  const ingredients = json<Recipe["ingredients"]>(r.ingredients, []);
  return { id: r.id, name: r.name, ingredients, cookedYieldG: r.cooked_yield_g, servings: r.servings, isMeal: r.is_meal === 1, calc: recipeCalc(ingredients, { cookedYieldG: r.cooked_yield_g, servings: r.servings }) };
};

export async function listRecipes(userId: string): Promise<Recipe[]> {
  return (await (await db()).all<RecipeRow>("SELECT * FROM recipes WHERE user_id = ? ORDER BY updated_at DESC", [userId])).map(toRecipe);
}

export async function getRecipe(userId: string, id: string): Promise<Recipe | null> {
  const r = await (await db()).get<RecipeRow>("SELECT * FROM recipes WHERE id = ? AND user_id = ?", [id, userId]);
  return r ? toRecipe(r) : null;
}

/** Editing a recipe never changes past diary entries: those keep their own nutrient snapshot. */
export async function saveRecipe(userId: string, r: { id?: string; name: string; ingredients: Recipe["ingredients"]; cookedYieldG: number | null; servings: number; isMeal: boolean }): Promise<string> {
  const q = await db();
  const now = nowIso();
  if (r.id) {
    const n = await q.run("UPDATE recipes SET name=?, ingredients=?, cooked_yield_g=?, servings=?, is_meal=?, updated_at=? WHERE id=? AND user_id=?",
      [r.name, JSON.stringify(r.ingredients), r.cookedYieldG, r.servings, r.isMeal ? 1 : 0, now, r.id, userId]);
    if (n === 1) return r.id;
  }
  const id = newId();
  await q.run("INSERT INTO recipes (id, user_id, name, ingredients, cooked_yield_g, servings, is_meal, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [id, userId, r.name, JSON.stringify(r.ingredients), r.cookedYieldG, r.servings, r.isMeal ? 1 : 0, now, now]);
  return id;
}

export async function deleteRecipe(userId: string, id: string) {
  await (await db()).run("DELETE FROM recipes WHERE id = ? AND user_id = ?", [id, userId]);
}

// ── Targets & bodyweight ─────────────────────────────────────────────────
export async function currentTarget(userId: string) {
  return (await (await db()).get<{ kcal: number | null; protein_g: number | null; goal: string | null; source: string; created_at: string }>(
    "SELECT kcal, protein_g, goal, source, created_at FROM calorie_targets WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
    [userId],
  )) ?? null;
}

export async function setTarget(userId: string, t: { kcal: number | null; protein: number | null; goal: string | null; source: "manual" | "estimate" | "suggestion" }) {
  await (await db()).run("INSERT INTO calorie_targets (id, user_id, kcal, protein_g, goal, source, created_at) VALUES (?,?,?,?,?,?,?)", [newId(), userId, t.kcal, t.protein, t.goal, t.source, nowIso()]);
}

export async function listWeights(userId: string, fromDate = "0000") {
  return (await db()).all<{ date: string; kg: number }>("SELECT date, kg FROM bodyweight WHERE user_id = ? AND date >= ? ORDER BY date", [userId, fromDate]);
}

export async function addWeight(userId: string, date: string, kg: number) {
  await (await db()).run("INSERT INTO bodyweight (user_id, date, kg, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, date) DO UPDATE SET kg = excluded.kg", [userId, date, kg, nowIso()]);
}

export async function deleteWeight(userId: string, date: string) {
  await (await db()).run("DELETE FROM bodyweight WHERE user_id = ? AND date = ?", [userId, date]);
}

// ── Body measurements (optional circumferences, one row per day) ─────────
const SITE_COLS = MEASUREMENT_SITES.map((s) => `${s}_cm`);

export async function listMeasurements(userId: string, fromDate = "0000"): Promise<Measurement[]> {
  return (await db()).all<Measurement>(
    `SELECT date, ${MEASUREMENT_SITES.map((s) => `${s}_cm AS ${s}`).join(", ")} FROM body_measurements WHERE user_id = ? AND date >= ? ORDER BY date`,
    [userId, fromDate],
  );
}

/** Writes the day's row exactly as given; a row with no values left is removed. */
export async function saveMeasurement(userId: string, m: Measurement): Promise<"saved" | "deleted"> {
  const values = MEASUREMENT_SITES.map((s) => m[s]);
  if (values.every((v) => v === null)) {
    await deleteMeasurement(userId, m.date);
    return "deleted";
  }
  const now = nowIso();
  await (await db()).run(
    `INSERT INTO body_measurements (user_id, date, ${SITE_COLS.join(", ")}, created_at, updated_at) VALUES (?, ?, ${SITE_COLS.map(() => "?").join(", ")}, ?, ?)
     ON CONFLICT (user_id, date) DO UPDATE SET ${SITE_COLS.map((c) => `${c} = excluded.${c}`).join(", ")}, updated_at = excluded.updated_at`,
    [userId, m.date, ...values, now, now],
  );
  return "saved";
}

export async function deleteMeasurement(userId: string, date: string) {
  await (await db()).run("DELETE FROM body_measurements WHERE user_id = ? AND date = ?", [userId, date]);
}

// ── Account ──────────────────────────────────────────────────────────────
const USER_TABLES = [
  "user_settings", "training_profiles", "exercise_prefs", "custom_exercises", "plans", "workouts", "food_favorites",
  "recipes", "diary_entries", "diary_days", "calorie_targets", "bodyweight", "body_measurements", "ai_suggestions",
] as const;

export async function exportUser(userId: string) {
  const q = await db();
  const out: Record<string, unknown> = {
    format: "forma-export", version: 1, exportedAt: nowIso(),
    user: await q.get("SELECT id, email, name, locale, created_at FROM users WHERE id = ?", [userId]),
  };
  for (const t of USER_TABLES) out[t] = await q.all(`SELECT * FROM ${t} WHERE user_id = ?`, [userId]);
  out.plan_versions = await q.all("SELECT v.* FROM plan_versions v JOIN plans p ON p.id = v.plan_id WHERE p.user_id = ?", [userId]);
  out.workout_exercises = await q.all("SELECT e.* FROM workout_exercises e JOIN workouts w ON w.id = e.workout_id WHERE w.user_id = ?", [userId]);
  out.workout_sets = await q.all("SELECT s.* FROM workout_sets s JOIN workout_exercises e ON e.id = s.workout_exercise_id JOIN workouts w ON w.id = e.workout_id WHERE w.user_id = ?", [userId]);
  out.custom_foods = await q.all("SELECT * FROM food_products WHERE owner_user_id = ?", [userId]);
  return out;
}

export async function deleteUser(userId: string) {
  // ON DELETE CASCADE removes every row owned by the user, including private foods.
  await (await db()).run("DELETE FROM users WHERE id = ?", [userId]);
}

export async function listUsers() {
  return (await db()).all<{ id: string; name: string; email: string; is_admin: number; created_at: string }>("SELECT id, name, email, is_admin, created_at FROM users ORDER BY created_at");
}

export async function listInvites() {
  return (await db()).all<{ note: string | null; created_at: string; expires_at: string; used_at: string | null }>(
    "SELECT note, created_at, expires_at, used_at FROM invites ORDER BY created_at DESC LIMIT 20",
  );
}

export async function changePassword(userId: string, hash: string) {
  await (await db()).tx(async (q) => {
    await q.run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, userId]);
    await q.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
  });
}

export async function passwordHash(userId: string): Promise<string | null> {
  return (await (await db()).get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [userId]))?.password_hash ?? null;
}

export async function deletePlan(userId: string, planId: string) {
  // Versions cascade; logged workouts keep their data (plan_id is set to NULL).
  await (await db()).run("DELETE FROM plans WHERE id = ? AND user_id = ?", [planId, userId]);
}

// ── Progress photos (private; stored in the database, served only to their owner) ──
export interface PhotoMeta {
  id: string;
  date: string;
  pose: "front" | "side" | "back" | "other";
  note: string | null;
  width: number | null;
  height: number | null;
}

export async function addPhoto(userId: string, p: Omit<PhotoMeta, "id"> & { mime: string; data: Uint8Array }): Promise<string> {
  const id = newId();
  await (await db()).run(
    "INSERT INTO progress_photos (id, user_id, date, pose, note, mime, data, width, height, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [id, userId, p.date, p.pose, p.note, p.mime, Buffer.from(p.data), p.width, p.height, nowIso()],
  );
  return id;
}

export async function listPhotos(userId: string): Promise<PhotoMeta[]> {
  return (await db()).all<PhotoMeta>("SELECT id, date, pose, note, width, height FROM progress_photos WHERE user_id = ? ORDER BY date DESC, created_at DESC", [userId]);
}

export async function getPhoto(userId: string, id: string): Promise<{ mime: string; data: Uint8Array } | null> {
  return (await (await db()).get<{ mime: string; data: Uint8Array }>("SELECT mime, data FROM progress_photos WHERE id = ? AND user_id = ?", [id, userId])) ?? null;
}

export async function deletePhoto(userId: string, id: string) {
  await (await db()).run("DELETE FROM progress_photos WHERE id = ? AND user_id = ?", [id, userId]);
}

/** Session keys the user postponed today ("not today, keep it for next time"). */
export async function postponedSince(userId: string, sinceIso: string): Promise<string[]> {
  const rows = await (await db()).all<{ session_key: string | null }>(
    "SELECT session_key FROM workouts WHERE user_id = ? AND notes = 'postponed' AND started_at >= ?",
    [userId, sinceIso],
  );
  return rows.map((r) => r.session_key ?? "").filter(Boolean);
}

// ── AI suggestions (proposals the user confirms before anything changes) ──
export async function createSuggestion(userId: string, kind: string, payload: unknown): Promise<string> {
  const id = newId();
  await (await db()).run("INSERT INTO ai_suggestions (id, user_id, kind, payload, state, created_at) VALUES (?, ?, ?, ?, 'pending', ?)", [id, userId, kind, JSON.stringify(payload), nowIso()]);
  return id;
}

/** Pending suggestions older than a day are treated as expired. */
export async function pendingSuggestion(userId: string, id: string): Promise<{ kind: string; payload: unknown } | null> {
  const r = await (await db()).get<{ kind: string; payload: string }>(
    "SELECT kind, payload FROM ai_suggestions WHERE id = ? AND user_id = ? AND state = 'pending' AND created_at > ?",
    [id, userId, new Date(Date.now() - 86_400_000).toISOString()],
  );
  return r ? { kind: r.kind, payload: json<unknown>(r.payload, null) } : null;
}

/** Returns false if the suggestion was not pending (already used, rejected or someone else's). */
export async function resolveSuggestion(userId: string, id: string, state: "accepted" | "rejected"): Promise<boolean> {
  return (await (await db()).run("UPDATE ai_suggestions SET state = ? WHERE id = ? AND user_id = ? AND state = 'pending'", [state, id, userId])) > 0;
}
