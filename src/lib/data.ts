import "server-only";
import { EXERCISES } from "@/engine/exercises";
import { parseProfile } from "@/engine/profile";
import type { Exercise, ExercisePref, Plan, TrainingProfile } from "@/engine/types";
import { emptyNutrients, recipe as recipeCalc, scale, sum, type Ingredient, type Nutrients } from "@/nutrition/calc";
import type { ProductDraft } from "@/nutrition/off";
import { db, json, newId, nowIso, transaction } from "./db";

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
}

const DEFAULT_SETTINGS: Settings = {
  theme: "system", modules: { training: true, nutrition: true }, logMode: "detailed", restTimer: true, autoTimer: false,
  showEffort: false, showFiber: false, weightGoal: null, onboarded: false,
};

export function getSettings(userId: string): Settings {
  const row = db().prepare("SELECT data FROM user_settings WHERE user_id = ?").get(userId) as { data: string } | undefined;
  const s = json<Partial<Settings>>(row?.data, {});
  return { ...DEFAULT_SETTINGS, ...s, modules: { ...DEFAULT_SETTINGS.modules, ...s.modules } };
}

export function saveSettings(userId: string, patch: Partial<Settings>) {
  const next = { ...getSettings(userId), ...patch };
  db().prepare("INSERT INTO user_settings (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data").run(userId, JSON.stringify(next));
  return next;
}

export function setLocale(userId: string, locale: "pl" | "en" | "de") {
  db().prepare("UPDATE users SET locale = ? WHERE id = ?").run(locale, userId);
}

// ── Training profile, preferences, custom exercises ──────────────────────
export function getProfile(userId: string): TrainingProfile | null {
  const row = db().prepare("SELECT data FROM training_profiles WHERE user_id = ?").get(userId) as { data: string } | undefined;
  if (!row) return null;
  try {
    return parseProfile(JSON.parse(row.data));
  } catch {
    return null;
  }
}

export function saveProfile(userId: string, profile: TrainingProfile) {
  const p = parseProfile(profile);
  db()
    .prepare("INSERT INTO training_profiles (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
    .run(userId, JSON.stringify(p), nowIso());
  return p;
}

export function getPrefs(userId: string): Record<string, ExercisePref> {
  const rows = db().prepare("SELECT exercise_id, pref FROM exercise_prefs WHERE user_id = ?").all(userId) as { exercise_id: string; pref: ExercisePref }[];
  return Object.fromEntries(rows.map((r) => [r.exercise_id, r.pref]));
}

export function setPref(userId: string, exerciseId: string, pref: ExercisePref) {
  if (pref === "neutral") db().prepare("DELETE FROM exercise_prefs WHERE user_id = ? AND exercise_id = ?").run(userId, exerciseId);
  else
    db()
      .prepare("INSERT INTO exercise_prefs (user_id, exercise_id, pref, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, exercise_id) DO UPDATE SET pref = excluded.pref, updated_at = excluded.updated_at")
      .run(userId, exerciseId, pref, nowIso());
}

export function getCustomExercises(userId: string): Exercise[] {
  const rows = db().prepare("SELECT id, data FROM custom_exercises WHERE user_id = ? ORDER BY created_at").all(userId) as { id: string; data: string }[];
  return rows.map((r) => ({ ...json<Exercise>(r.data, {} as Exercise), id: r.id, custom: true }));
}

export function addCustomExercise(userId: string, ex: Omit<Exercise, "id">): string {
  const id = `custom_${newId().slice(0, 8)}`;
  db().prepare("INSERT INTO custom_exercises (id, user_id, data, created_at) VALUES (?, ?, ?, ?)").run(id, userId, JSON.stringify({ ...ex, custom: true }), nowIso());
  return id;
}

export function libraryFor(userId: string): Exercise[] {
  return [...EXERCISES, ...getCustomExercises(userId)];
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

export function listPlans(userId: string): PlanRow[] {
  return db().prepare("SELECT * FROM plans WHERE user_id = ? ORDER BY status = 'active' DESC, updated_at DESC").all(userId) as unknown as PlanRow[];
}

export function getPlan(userId: string, planId: string): (PlanRow & { data: Plan; note: string | null }) | null {
  const row = db()
    .prepare("SELECT p.*, v.data, v.note FROM plans p JOIN plan_versions v ON v.plan_id = p.id AND v.version = p.current_version WHERE p.id = ? AND p.user_id = ?")
    .get(planId, userId) as (PlanRow & { data: string; note: string | null }) | undefined;
  return row ? { ...row, data: json<Plan>(row.data, null as never) } : null;
}

export function getActivePlan(userId: string) {
  const row = db().prepare("SELECT id FROM plans WHERE user_id = ? AND status = 'active' LIMIT 1").get(userId) as { id: string } | undefined;
  return row ? getPlan(userId, row.id) : null;
}

export function createPlan(userId: string, name: string, source: PlanRow["source"], data: Plan, note: string | null, activate = true): string {
  const id = newId();
  const now = nowIso();
  transaction(() => {
    if (activate) db().prepare("UPDATE plans SET status = 'inactive' WHERE user_id = ? AND status = 'active'").run(userId);
    db().prepare("INSERT INTO plans (id, user_id, name, status, source, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(id, userId, name, activate ? "active" : "inactive", source, now, now);
    db().prepare("INSERT INTO plan_versions (plan_id, version, data, note, created_at) VALUES (?, 1, ?, ?, ?)").run(id, JSON.stringify(data), note, now);
  });
  return id;
}

export function savePlanVersion(userId: string, planId: string, data: Plan, note: string | null): number | null {
  return transaction(() => {
    const p = db().prepare("SELECT current_version FROM plans WHERE id = ? AND user_id = ?").get(planId, userId) as { current_version: number } | undefined;
    if (!p) return null;
    const max = (db().prepare("SELECT MAX(version) AS v FROM plan_versions WHERE plan_id = ?").get(planId) as { v: number }).v;
    const v = max + 1;
    db().prepare("INSERT INTO plan_versions (plan_id, version, data, note, created_at) VALUES (?, ?, ?, ?, ?)").run(planId, v, JSON.stringify(data), note, nowIso());
    db().prepare("UPDATE plans SET current_version = ?, updated_at = ? WHERE id = ?").run(v, nowIso(), planId);
    return v;
  });
}

export function listVersions(userId: string, planId: string) {
  return db()
    .prepare("SELECT v.version, v.note, v.created_at FROM plan_versions v JOIN plans p ON p.id = v.plan_id WHERE p.id = ? AND p.user_id = ? ORDER BY v.version DESC")
    .all(planId, userId) as { version: number; note: string | null; created_at: string }[];
}

export function getPlanVersion(userId: string, planId: string, version: number): Plan | null {
  const row = db()
    .prepare("SELECT v.data FROM plan_versions v JOIN plans p ON p.id = v.plan_id WHERE p.id = ? AND p.user_id = ? AND v.version = ?")
    .get(planId, userId, version) as { data: string } | undefined;
  return row ? json<Plan>(row.data, null as never) : null;
}

export function setPlanStatus(userId: string, planId: string, status: PlanRow["status"]) {
  transaction(() => {
    if (status === "active") db().prepare("UPDATE plans SET status = 'inactive' WHERE user_id = ? AND status = 'active'").run(userId);
    db().prepare("UPDATE plans SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(status, nowIso(), planId, userId);
  });
}

export function renamePlan(userId: string, planId: string, name: string) {
  db().prepare("UPDATE plans SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(name, nowIso(), planId, userId);
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
  target: { sets: number; repMin: number; repMax: number; seconds?: number; restSec: number; effort: string; priority?: number } | null;
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
export function upsertWorkout(userId: string, w: WorkoutPayload): "saved" | "stale" | "forbidden" {
  return transaction(() => {
    const existing = db().prepare("SELECT user_id, client_updated_at FROM workouts WHERE id = ?").get(w.id) as { user_id: string; client_updated_at: string } | undefined;
    if (existing && existing.user_id !== userId) return "forbidden";
    if (existing && existing.client_updated_at > w.clientUpdatedAt) return "stale";
    const now = nowIso();
    if (existing) {
      db().prepare("UPDATE workouts SET name=?, location_id=?, mode=?, status=?, started_at=?, ended_at=?, notes=?, client_updated_at=?, updated_at=? WHERE id=?")
        .run(w.name, w.locationId, w.mode, w.status, w.startedAt, w.endedAt, w.notes, w.clientUpdatedAt, now, w.id);
      db().prepare("DELETE FROM workout_exercises WHERE workout_id = ?").run(w.id);
    } else {
      db().prepare("INSERT INTO workouts (id, user_id, plan_id, plan_version, session_key, name, location_id, mode, status, started_at, ended_at, notes, client_updated_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(w.id, userId, w.planId, w.planVersion, w.sessionKey, w.name, w.locationId, w.mode, w.status, w.startedAt, w.endedAt, w.notes, w.clientUpdatedAt, now);
    }
    const insEx = db().prepare("INSERT INTO workout_exercises (id, workout_id, position, exercise_id, exercise_name, loading, target, completed, skipped, notes) VALUES (?,?,?,?,?,?,?,?,?,?)");
    const insSet = db().prepare("INSERT INTO workout_sets (id, workout_exercise_id, position, set_type, reps, weight_kg, rir, rpe, duration_s, completed) VALUES (?,?,?,?,?,?,?,?,?,?)");
    w.exercises.forEach((e, i) => {
      const weId = `${w.id}:${i}`;
      insEx.run(weId, w.id, i, e.exerciseId, e.name, e.loading, e.target ? JSON.stringify(e.target) : null, e.completed ? 1 : 0, e.skipped ? 1 : 0, e.notes);
      e.sets.forEach((s, j) => insSet.run(`${weId}:${j}`, weId, j, s.type, s.reps, s.weightKg, s.rir, s.rpe, s.durationS, s.completed ? 1 : 0));
    });
    return "saved";
  });
}

export function getWorkout(userId: string, id: string): WorkoutPayload | null {
  const w = db().prepare("SELECT * FROM workouts WHERE id = ? AND user_id = ?").get(id, userId) as Record<string, unknown> | undefined;
  if (!w) return null;
  const exs = db().prepare("SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY position").all(id) as Record<string, unknown>[];
  const sets = db()
    .prepare("SELECT s.* FROM workout_sets s JOIN workout_exercises e ON e.id = s.workout_exercise_id WHERE e.workout_id = ? ORDER BY s.position")
    .all(id) as Record<string, unknown>[];
  return {
    id: w.id as string, planId: (w.plan_id as string) ?? null, planVersion: (w.plan_version as number) ?? null, sessionKey: (w.session_key as string) ?? null,
    name: w.name as string, locationId: (w.location_id as string) ?? null, mode: w.mode as "simple", status: w.status as "completed",
    startedAt: w.started_at as string, endedAt: (w.ended_at as string) ?? null, notes: (w.notes as string) ?? null, clientUpdatedAt: w.client_updated_at as string,
    exercises: exs.map((e) => ({
      id: e.id as string, exerciseId: e.exercise_id as string, name: e.exercise_name as string, loading: e.loading as string,
      target: json(e.target, null), completed: e.completed === 1, skipped: e.skipped === 1, notes: (e.notes as string) ?? null,
      sets: sets.filter((s) => s.workout_exercise_id === e.id).map((s) => ({
        id: s.id as string, type: s.set_type as "working", reps: (s.reps as number) ?? null, weightKg: (s.weight_kg as number) ?? null,
        rir: (s.rir as number) ?? null, rpe: (s.rpe as number) ?? null, durationS: (s.duration_s as number) ?? null, completed: s.completed === 1,
      })),
    })),
  };
}

export function listWorkouts(userId: string, limit = 50) {
  return db()
    .prepare(
      `SELECT w.id, w.name, w.status, w.mode, w.started_at, w.ended_at, w.session_key,
        (SELECT COUNT(*) FROM workout_exercises e WHERE e.workout_id = w.id AND (e.completed = 1 OR EXISTS (SELECT 1 FROM workout_sets s WHERE s.workout_exercise_id = e.id AND s.completed = 1))) AS done_exercises,
        (SELECT COUNT(*) FROM workout_sets s JOIN workout_exercises e ON e.id = s.workout_exercise_id WHERE e.workout_id = w.id AND s.completed = 1 AND s.reps IS NOT NULL) AS logged_sets
       FROM workouts w WHERE w.user_id = ? ORDER BY w.started_at DESC LIMIT ?`,
    )
    .all(userId, limit) as { id: string; name: string; status: string; mode: string; started_at: string; ended_at: string | null; session_key: string | null; done_exercises: number; logged_sets: number }[];
}

export function inProgressWorkout(userId: string) {
  return db().prepare("SELECT id, name FROM workouts WHERE user_id = ? AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1").get(userId) as { id: string; name: string } | undefined;
}

export function lastCompletedSessionKey(userId: string, planId: string): string | null {
  const r = db().prepare("SELECT session_key FROM workouts WHERE user_id = ? AND plan_id = ? AND status = 'completed' ORDER BY started_at DESC LIMIT 1").get(userId, planId) as { session_key: string | null } | undefined;
  return r?.session_key ?? null;
}

/** Logged history for one exercise, newest first, only sessions with real set data. */
export function exerciseHistory(userId: string, exerciseId: string, limit = 10) {
  const exs = db()
    .prepare(
      `SELECT e.id, w.started_at FROM workout_exercises e JOIN workouts w ON w.id = e.workout_id
       WHERE w.user_id = ? AND e.exercise_id = ? AND w.status = 'completed' ORDER BY w.started_at DESC LIMIT ?`,
    )
    .all(userId, exerciseId, limit) as { id: string; started_at: string }[];
  const q = db().prepare("SELECT set_type, reps, weight_kg, duration_s, completed FROM workout_sets WHERE workout_exercise_id = ? ORDER BY position");
  return exs
    .map((e) => ({
      date: e.started_at,
      sets: (q.all(e.id) as { set_type: string; reps: number | null; weight_kg: number | null; duration_s: number | null; completed: number }[]).map((s) => ({
        type: s.set_type as WorkoutSet["type"], reps: s.reps, weightKg: s.weight_kg, durationS: s.duration_s, completed: s.completed === 1,
      })),
    }))
    .filter((h) => h.sets.some((s) => s.completed && (s.reps !== null || s.durationS !== null)));
}

export function workoutDatesSince(userId: string, sinceIso: string): string[] {
  return (db().prepare("SELECT started_at FROM workouts WHERE user_id = ? AND status = 'completed' AND started_at >= ? ORDER BY started_at").all(userId, sinceIso) as { started_at: string }[]).map((r) => r.started_at);
}

export function loggedExerciseIds(userId: string): string[] {
  return (db().prepare("SELECT DISTINCT e.exercise_id FROM workout_exercises e JOIN workouts w ON w.id = e.workout_id WHERE w.user_id = ? AND w.status = 'completed'").all(userId) as { exercise_id: string }[]).map((r) => r.exercise_id);
}

export function deleteWorkout(userId: string, id: string) {
  db().prepare("DELETE FROM workouts WHERE id = ? AND user_id = ?").run(id, userId);
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

type ProductRow = { id: string; owner_user_id: string | null; source: "off" | "custom"; barcode: string | null; name: string; brand: string | null; basis: "g" | "ml"; state: "raw" | "cooked" | null; nutrients: string; servings: string; fav?: number };

const toProduct = (r: ProductRow, userId: string): Product => ({
  id: r.id, source: r.source, barcode: r.barcode, name: r.name, brand: r.brand, basis: r.basis, state: r.state,
  nutrients: json<Nutrients>(r.nutrients, emptyNutrients()), servings: json(r.servings, []), mine: r.owner_user_id === userId, favorite: r.fav === 1,
});

const VISIBLE = "(p.owner_user_id IS NULL OR p.owner_user_id = ?)";
const FAV = "(SELECT 1 FROM food_favorites f WHERE f.user_id = ? AND f.product_id = p.id) AS fav";

export function getProduct(userId: string, id: string): Product | null {
  const r = db().prepare(`SELECT p.*, ${FAV} FROM food_products p WHERE p.id = ? AND ${VISIBLE}`).get(userId, id, userId) as ProductRow | undefined;
  return r ? toProduct(r, userId) : null;
}

export function productByBarcode(userId: string, barcode: string): (Product & { fetched_at: string | null }) | null {
  const r = db()
    .prepare(`SELECT p.*, ${FAV} FROM food_products p WHERE p.barcode = ? AND ${VISIBLE} ORDER BY p.owner_user_id IS NULL ASC LIMIT 1`)
    .get(userId, barcode, userId) as (ProductRow & { fetched_at: string | null }) | undefined;
  return r ? { ...toProduct(r, userId), fetched_at: r.fetched_at } : null;
}

export function upsertOffProduct(d: ProductDraft): string {
  const existing = db().prepare("SELECT id FROM food_products WHERE source = 'off' AND barcode = ?").get(d.barcode) as { id: string } | undefined;
  const now = nowIso();
  if (existing) {
    db().prepare("UPDATE food_products SET name=?, brand=?, basis=?, nutrients=?, servings=?, fetched_at=?, updated_at=? WHERE id=?")
      .run(d.name, d.brand, d.basis, JSON.stringify(d.nutrients), JSON.stringify(d.servings), now, now, existing.id);
    return existing.id;
  }
  const id = newId();
  db().prepare("INSERT INTO food_products (id, owner_user_id, source, barcode, name, brand, basis, state, nutrients, servings, fetched_at, updated_at) VALUES (?, NULL, 'off', ?, ?, ?, ?, NULL, ?, ?, ?, ?)")
    .run(id, d.barcode, d.name, d.brand, d.basis, JSON.stringify(d.nutrients), JSON.stringify(d.servings), now, now);
  return id;
}

export function saveCustomProduct(
  userId: string,
  p: { id?: string; name: string; brand: string | null; barcode: string | null; basis: "g" | "ml"; state: "raw" | "cooked" | null; nutrients: Nutrients; servings: { label: string; amount: number }[] },
): string {
  const now = nowIso();
  if (p.id) {
    const r = db().prepare("UPDATE food_products SET name=?, brand=?, barcode=?, basis=?, state=?, nutrients=?, servings=?, updated_at=? WHERE id=? AND owner_user_id=?")
      .run(p.name, p.brand, p.barcode, p.basis, p.state, JSON.stringify(p.nutrients), JSON.stringify(p.servings), now, p.id, userId);
    if (r.changes === 1) return p.id;
  }
  const id = newId();
  db().prepare("INSERT INTO food_products (id, owner_user_id, source, barcode, name, brand, basis, state, nutrients, servings, fetched_at, updated_at) VALUES (?, ?, 'custom', ?, ?, ?, ?, ?, ?, ?, NULL, ?)")
    .run(id, userId, p.barcode, p.name, p.brand, p.basis, p.state, JSON.stringify(p.nutrients), JSON.stringify(p.servings), now);
  return id;
}

export function searchProducts(userId: string, q: string, limit = 25): Product[] {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  if (!terms.length) return [];
  const where = terms.map(() => "(lower(p.name) LIKE ? OR lower(coalesce(p.brand,'')) LIKE ?)").join(" AND ");
  const args = terms.flatMap((t) => [`%${t}%`, `%${t}%`]);
  const rows = db()
    .prepare(
      `SELECT p.*, ${FAV}, (SELECT MAX(d.created_at) FROM diary_entries d WHERE d.user_id = ? AND d.product_id = p.id) AS last_used
       FROM food_products p WHERE ${VISIBLE} AND ${where}
       ORDER BY fav DESC, last_used DESC NULLS LAST, p.owner_user_id IS NULL, length(p.name) LIMIT ?`,
    )
    .all(userId, userId, userId, ...args, limit) as ProductRow[];
  return rows.map((r) => toProduct(r, userId));
}

export function recentProducts(userId: string, limit = 20): (Product & { lastAmount: number })[] {
  const rows = db()
    .prepare(
      `SELECT p.*, ${FAV}, d.amount AS last_amount FROM food_products p
       JOIN (SELECT product_id, amount, MAX(created_at) AS t FROM diary_entries WHERE user_id = ? AND product_id IS NOT NULL GROUP BY product_id) d ON d.product_id = p.id
       WHERE ${VISIBLE} ORDER BY d.t DESC LIMIT ?`,
    )
    .all(userId, userId, userId, limit) as (ProductRow & { last_amount: number })[];
  return rows.map((r) => ({ ...toProduct(r, userId), lastAmount: r.last_amount }));
}

export function favoriteProducts(userId: string): Product[] {
  const rows = db()
    .prepare(`SELECT p.*, 1 AS fav FROM food_products p JOIN food_favorites f ON f.product_id = p.id WHERE f.user_id = ? AND ${VISIBLE} ORDER BY p.name`)
    .all(userId, userId) as ProductRow[];
  return rows.map((r) => toProduct(r, userId));
}

export function setFavorite(userId: string, productId: string, on: boolean) {
  if (!getProduct(userId, productId)) return;
  if (on) db().prepare("INSERT OR IGNORE INTO food_favorites (user_id, product_id, created_at) VALUES (?, ?, ?)").run(userId, productId, nowIso());
  else db().prepare("DELETE FROM food_favorites WHERE user_id = ? AND product_id = ?").run(userId, productId);
}

export function cachedSearch(query: string, maxAgeMs: number): string[] | null {
  const r = db().prepare("SELECT barcodes, fetched_at FROM food_search_cache WHERE query = ?").get(query) as { barcodes: string; fetched_at: string } | undefined;
  if (!r || Date.now() - Date.parse(r.fetched_at) > maxAgeMs) return null;
  return json<string[]>(r.barcodes, []);
}

export function storeSearch(query: string, barcodes: string[]) {
  db().prepare("INSERT INTO food_search_cache (query, barcodes, fetched_at) VALUES (?, ?, ?) ON CONFLICT(query) DO UPDATE SET barcodes = excluded.barcodes, fetched_at = excluded.fetched_at").run(query, JSON.stringify(barcodes), nowIso());
}

export function productsByBarcodes(userId: string, barcodes: string[]): Product[] {
  if (!barcodes.length) return [];
  const rows = db()
    .prepare(`SELECT p.*, ${FAV} FROM food_products p WHERE p.source = 'off' AND p.barcode IN (${barcodes.map(() => "?").join(",")})`)
    .all(userId, ...barcodes) as ProductRow[];
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

export function diaryDay(userId: string, date: string) {
  const rows = db().prepare("SELECT * FROM diary_entries WHERE user_id = ? AND date = ? ORDER BY created_at").all(userId, date) as EntryRow[];
  const entries = rows.map(toEntry);
  const flag = db().prepare("SELECT complete FROM diary_days WHERE user_id = ? AND date = ?").get(userId, date) as { complete: number } | undefined;
  return { entries, totals: sum(entries.map((e) => e.values)), complete: flag ? flag.complete === 1 : null };
}

export function addEntry(
  userId: string,
  e: { date: string; meal: string | null; amount: number } & (
    | { productId: string }
    | { recipeId: string; mode: "grams" | "servings" }
    | { quick: { name: string; kcal: number; protein?: number | null; carbs?: number | null; fat?: number | null } }
  ),
): string | null {
  let name: string;
  let basis = "g";
  let per100: Nutrients;
  let productId: string | null = null;
  let recipeId: string | null = null;
  let amount = e.amount;
  if ("productId" in e) {
    const p = getProduct(userId, e.productId);
    if (!p) return null;
    name = p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.name} (${p.brand})` : p.name;
    basis = p.basis;
    per100 = p.nutrients;
    productId = p.id;
  } else if ("recipeId" in e) {
    const r = getRecipe(userId, e.recipeId);
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
  const v = scale(per100, amount);
  db().prepare("INSERT INTO diary_entries (id, user_id, date, meal, product_id, recipe_id, name, amount, basis, nutrients, kcal, protein, carbs, fat, fiber, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, userId, e.date, e.meal, productId, recipeId, name, amount, basis, JSON.stringify(per100), v.kcal, v.protein, v.carbs, v.fat, v.fiber, nowIso());
  return id;
}

export function updateEntry(userId: string, id: string, patch: { amount?: number; meal?: string | null }) {
  const r = db().prepare("SELECT * FROM diary_entries WHERE id = ? AND user_id = ?").get(id, userId) as EntryRow | undefined;
  if (!r) return;
  const amount = patch.amount ?? r.amount;
  if (!(amount > 0 && amount < 10000)) return;
  const v = scale(json<Nutrients>(r.nutrients, emptyNutrients()), amount);
  db().prepare("UPDATE diary_entries SET amount=?, meal=?, kcal=?, protein=?, carbs=?, fat=?, fiber=? WHERE id=? AND user_id=?")
    .run(amount, patch.meal === undefined ? r.meal : patch.meal, v.kcal, v.protein, v.carbs, v.fat, v.fiber, id, userId);
}

/** Returns the deleted row so the UI can offer undo. */
export function deleteEntry(userId: string, id: string): EntryRow | null {
  const r = db().prepare("SELECT * FROM diary_entries WHERE id = ? AND user_id = ?").get(id, userId) as EntryRow | undefined;
  if (!r) return null;
  db().prepare("DELETE FROM diary_entries WHERE id = ? AND user_id = ?").run(id, userId);
  return r;
}

export function restoreEntry(userId: string, row: EntryRow) {
  const v = scale(json<Nutrients>(row.nutrients, emptyNutrients()), row.amount);
  db().prepare("INSERT OR IGNORE INTO diary_entries (id, user_id, date, meal, product_id, recipe_id, name, amount, basis, nutrients, kcal, protein, carbs, fat, fiber, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(row.id, userId, row.date, row.meal, row.product_id, row.recipe_id, row.name, row.amount, row.basis, row.nutrients, v.kcal, v.protein, v.carbs, v.fat, v.fiber, row.created_at);
}

export function copyDay(userId: string, from: string, to: string, meal?: string | null): number {
  const rows = db().prepare(`SELECT * FROM diary_entries WHERE user_id = ? AND date = ?${meal !== undefined ? " AND meal IS ?" : ""} ORDER BY created_at`).all(...(meal !== undefined ? [userId, from, meal] : [userId, from])) as EntryRow[];
  transaction(() => {
    for (const r of rows) restoreEntry(userId, { ...r, id: newId(), date: to, created_at: nowIso() });
  });
  return rows.length;
}

export function setDayComplete(userId: string, date: string, complete: boolean | null) {
  if (complete === null) db().prepare("DELETE FROM diary_days WHERE user_id = ? AND date = ?").run(userId, date);
  else db().prepare("INSERT INTO diary_days (user_id, date, complete) VALUES (?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET complete = excluded.complete").run(userId, date, complete ? 1 : 0);
}

export function intakeHistory(userId: string, fromDate: string) {
  const rows = db()
    .prepare(
      `SELECT d.date, SUM(d.kcal) AS kcal, SUM(d.protein) AS protein, SUM(CASE WHEN d.kcal IS NULL THEN 1 ELSE 0 END) AS missing, dd.complete
       FROM diary_entries d LEFT JOIN diary_days dd ON dd.user_id = d.user_id AND dd.date = d.date
       WHERE d.user_id = ? AND d.date >= ? GROUP BY d.date ORDER BY d.date`,
    )
    .all(userId, fromDate) as { date: string; kcal: number | null; protein: number | null; missing: number; complete: number | null }[];
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

export function listRecipes(userId: string): Recipe[] {
  return (db().prepare("SELECT * FROM recipes WHERE user_id = ? ORDER BY updated_at DESC").all(userId) as RecipeRow[]).map(toRecipe);
}

export function getRecipe(userId: string, id: string): Recipe | null {
  const r = db().prepare("SELECT * FROM recipes WHERE id = ? AND user_id = ?").get(id, userId) as RecipeRow | undefined;
  return r ? toRecipe(r) : null;
}

/** Editing a recipe never changes past diary entries: those keep their own nutrient snapshot. */
export function saveRecipe(userId: string, r: { id?: string; name: string; ingredients: Recipe["ingredients"]; cookedYieldG: number | null; servings: number; isMeal: boolean }): string {
  const now = nowIso();
  if (r.id) {
    const u = db().prepare("UPDATE recipes SET name=?, ingredients=?, cooked_yield_g=?, servings=?, is_meal=?, updated_at=? WHERE id=? AND user_id=?")
      .run(r.name, JSON.stringify(r.ingredients), r.cookedYieldG, r.servings, r.isMeal ? 1 : 0, now, r.id, userId);
    if (u.changes === 1) return r.id;
  }
  const id = newId();
  db().prepare("INSERT INTO recipes (id, user_id, name, ingredients, cooked_yield_g, servings, is_meal, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(id, userId, r.name, JSON.stringify(r.ingredients), r.cookedYieldG, r.servings, r.isMeal ? 1 : 0, now, now);
  return id;
}

export function deleteRecipe(userId: string, id: string) {
  db().prepare("DELETE FROM recipes WHERE id = ? AND user_id = ?").run(id, userId);
}

// ── Targets & bodyweight ─────────────────────────────────────────────────
export function currentTarget(userId: string) {
  return (db().prepare("SELECT kcal, protein_g, goal, source, created_at FROM calorie_targets WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(userId) as
    | { kcal: number | null; protein_g: number | null; goal: string | null; source: string; created_at: string }
    | undefined) ?? null;
}

export function setTarget(userId: string, t: { kcal: number | null; protein: number | null; goal: string | null; source: "manual" | "estimate" | "suggestion" }) {
  db().prepare("INSERT INTO calorie_targets (id, user_id, kcal, protein_g, goal, source, created_at) VALUES (?,?,?,?,?,?,?)").run(newId(), userId, t.kcal, t.protein, t.goal, t.source, nowIso());
}

export function listWeights(userId: string, fromDate = "0000") {
  return db().prepare("SELECT date, kg FROM bodyweight WHERE user_id = ? AND date >= ? ORDER BY date").all(userId, fromDate) as { date: string; kg: number }[];
}

export function addWeight(userId: string, date: string, kg: number) {
  db().prepare("INSERT INTO bodyweight (user_id, date, kg, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET kg = excluded.kg").run(userId, date, kg, nowIso());
}

export function deleteWeight(userId: string, date: string) {
  db().prepare("DELETE FROM bodyweight WHERE user_id = ? AND date = ?").run(userId, date);
}

// ── Account ──────────────────────────────────────────────────────────────
const USER_TABLES = [
  "user_settings", "training_profiles", "exercise_prefs", "custom_exercises", "plans", "workouts", "food_favorites",
  "recipes", "diary_entries", "diary_days", "calorie_targets", "bodyweight", "ai_suggestions",
] as const;

export function exportUser(userId: string) {
  const out: Record<string, unknown> = {
    format: "forma-export", version: 1, exportedAt: nowIso(),
    user: db().prepare("SELECT id, email, name, locale, created_at FROM users WHERE id = ?").get(userId),
  };
  for (const t of USER_TABLES) out[t] = db().prepare(`SELECT * FROM ${t} WHERE user_id = ?`).all(userId);
  out.plan_versions = db().prepare("SELECT v.* FROM plan_versions v JOIN plans p ON p.id = v.plan_id WHERE p.user_id = ?").all(userId);
  out.workout_exercises = db().prepare("SELECT e.* FROM workout_exercises e JOIN workouts w ON w.id = e.workout_id WHERE w.user_id = ?").all(userId);
  out.workout_sets = db().prepare("SELECT s.* FROM workout_sets s JOIN workout_exercises e ON e.id = s.workout_exercise_id JOIN workouts w ON w.id = e.workout_id WHERE w.user_id = ?").all(userId);
  out.custom_foods = db().prepare("SELECT * FROM food_products WHERE owner_user_id = ?").all(userId);
  return out;
}

export function deleteUser(userId: string) {
  // ON DELETE CASCADE removes every row owned by the user, including private foods.
  db().prepare("DELETE FROM users WHERE id = ?").run(userId);
}

export function listUsers() {
  return db().prepare("SELECT id, name, email, is_admin, created_at FROM users ORDER BY created_at").all() as { id: string; name: string; email: string; is_admin: number; created_at: string }[];
}

export function listInvites() {
  return db().prepare("SELECT note, created_at, expires_at, used_at FROM invites ORDER BY created_at DESC LIMIT 20").all() as { note: string | null; created_at: string; expires_at: string; used_at: string | null }[];
}

export function changePassword(userId: string, hash: string) {
  transaction(() => {
    db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
    db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  });
}

export function passwordHash(userId: string): string | null {
  return (db().prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as { password_hash: string } | undefined)?.password_hash ?? null;
}
