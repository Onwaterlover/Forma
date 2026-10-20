import "server-only";
import path from "node:path";
import { MIGRATIONS } from "./migrations";

// One small async interface over two Postgres engines:
//  - DATABASE_URL set → real Postgres (Supabase on Vercel), via postgres.js
//  - otherwise        → PGlite (embedded Postgres) stored in DATA_DIR, for local use and tests
// Queries use "?" placeholders; they are converted to $1, $2… here.

export interface Q {
  all<T>(text: string, params?: unknown[]): Promise<T[]>;
  get<T>(text: string, params?: unknown[]): Promise<T | undefined>;
  /** Returns the number of affected rows. */
  run(text: string, params?: unknown[]): Promise<number>;
}
export interface Db extends Q {
  tx<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? "./data");

export function toPg(text: string): string {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

type Exec = (text: string, params: unknown[]) => Promise<{ rows: unknown[]; count: number }>;

function wrap(exec: Exec): Q {
  return {
    all: async <T,>(t: string, p: unknown[] = []) => (await exec(toPg(t), p)).rows as T[],
    get: async <T,>(t: string, p: unknown[] = []) => (await exec(toPg(t), p)).rows[0] as T | undefined,
    run: async (t: string, p: unknown[] = []) => (await exec(toPg(t), p)).count,
  };
}

async function openPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  // Supabase's pooler (transaction mode) doesn't support prepared statements.
  const sql = postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 });
  type Unsafe = { unsafe: (text: string, params?: never[]) => Promise<unknown[] & { count?: number }> };
  const execWith = (s: Unsafe): Exec => async (text, params) => {
    const r = await s.unsafe(text, params as never[]);
    return { rows: [...r], count: r.count ?? r.length };
  };
  return {
    ...wrap(execWith(sql as unknown as Unsafe)),
    tx: (fn) => sql.begin((t) => fn(wrap(execWith(t as unknown as Unsafe)))) as never,
    close: () => sql.end(),
  };
}

export async function openPglite(dir: string | null): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = dir ? new PGlite(dir) : new PGlite();
  await pg.waitReady;
  const execWith = (s: { query: typeof pg.query }): Exec => async (text, params) => {
    const r = await s.query(text, params);
    return { rows: r.rows, count: r.affectedRows ?? r.rows.length };
  };
  return {
    ...wrap(execWith(pg)),
    tx: (fn) => pg.transaction((t) => fn(wrap(execWith(t as never)))),
    close: () => pg.close(),
  };
}

export async function migrate(d: Db) {
  await d.run("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at text NOT NULL)");
  await d.tx(async (q) => {
    // Serverless instances may start concurrently: only one applies migrations.
    await q.run("SELECT pg_advisory_xact_lock(424242)");
    const row = await q.get<{ v: number | null }>("SELECT MAX(version) AS v FROM schema_migrations");
    for (const m of MIGRATIONS) {
      if (m.version <= (row?.v ?? 0)) continue;
      for (const stmt of m.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await q.run(stmt);
      await q.run("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [m.version, new Date().toISOString()]);
    }
  });
}

// Reuse one connection pool across hot reloads / warm serverless invocations.
const g = globalThis as unknown as { __formaDb?: Promise<Db> };
export function db(): Promise<Db> {
  g.__formaDb ??= (async () => {
    const url = process.env.DATABASE_URL;
    const d = url ? await openPostgres(url) : await openPglite(process.env.DATA_DIR === ":memory:" ? null : path.join(DATA_DIR, "pg"));
    await migrate(d);
    return d;
  })().catch((e) => {
    g.__formaDb = undefined;
    throw e;
  });
  return g.__formaDb;
}

export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

/** Parse a JSON text column; columns are written only by this app. */
export function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
