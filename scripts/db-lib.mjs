// Shared helpers for backup/restore/invite scripts. Uses DATABASE_URL (Supabase/Postgres) if set,
// otherwise the local embedded database in DATA_DIR/pg (start the app once so the schema exists).
import fs from "node:fs";
import path from "node:path";

// Same settings as the app: pick up DATABASE_URL / DATA_DIR from .env.local if present.
try {
  process.loadEnvFile(".env.local");
} catch {}

// Insert order respects foreign keys; delete in reverse.
export const TABLES = [
  "users", "sessions", "invites", "user_settings", "training_profiles", "exercise_prefs", "custom_exercises", "plans",
  "plan_versions", "workouts", "workout_exercises", "workout_sets", "food_products", "food_search_cache", "food_favorites",
  "recipes", "diary_entries", "diary_days", "calorie_targets", "bodyweight", "ai_suggestions", "login_attempts", "undo_buffer",
  "progress_photos", "body_measurements",
];

export async function connect() {
  if (process.env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
    return {
      query: async (text, params = []) => [...(await sql.unsafe(text, params))],
      tx: (fn) => sql.begin((t) => fn({ query: async (text, params = []) => [...(await t.unsafe(text, params))] })),
      close: () => sql.end(),
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.join(path.resolve(process.env.DATA_DIR ?? "./data"), "pg");
  fs.mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;
  return {
    query: async (text, params = []) => (await pg.query(text, params)).rows,
    tx: (fn) => pg.transaction((t) => fn({ query: async (text, params = []) => (await t.query(text, params)).rows })),
    close: () => pg.close(),
  };
}

export async function existingTables(db) {
  const rows = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  const names = new Set(rows.map((r) => r.table_name));
  return TABLES.filter((t) => names.has(t));
}

// Binary columns (photos) are stored as base64 in the JSON backup.
export const encode = (v) => (v instanceof Uint8Array ? { $b64: Buffer.from(v).toString("base64") } : v);
export const decode = (v) => (v && typeof v === "object" && "$b64" in v ? Buffer.from(v.$b64, "base64") : v);
