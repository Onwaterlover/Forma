import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import { emptyNutrients } from "@/nutrition/calc";

// Runs the real data layer against a throwaway database.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forma-test-"));
process.env.DATA_DIR = dir;

type Data = typeof import("./data");
type Auth = typeof import("./auth");
let data: Data;
let auth: Auth;
let A: string;
let B: string;

beforeAll(async () => {
  data = await import("./data");
  auth = await import("./auth");
  A = auth.createUser("a@test.test", "A", "password-aaaa-1", true);
  B = auth.createUser("b@test.test", "B", "password-bbbb-1", false);
});

const plan = { engineVersion: "1", split: "full_body", sessions: [], weeklySets: {}, tradeoffs: [], notes: [] };
const workout = (id: string, updated: string, reps = 8) => ({
  id, planId: null, planVersion: null, sessionKey: null, name: "W", locationId: null, mode: "detailed" as const, status: "completed" as const,
  startedAt: "2026-10-01T10:00:00.000Z", endedAt: "2026-10-01T11:00:00.000Z", notes: null, clientUpdatedAt: updated,
  exercises: [{ id: `${id}:0`, exerciseId: "db_bench_press", name: "Bench", loading: "per_dumbbell", target: null, completed: false, skipped: false, notes: null,
    sets: [{ id: `${id}:0:0`, type: "working" as const, reps, weightKg: 20, rir: null, rpe: null, durationS: null, completed: true }] }],
});

describe("passwords and invites", () => {
  it("hashes and verifies passwords", () => {
    const h = auth.hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(auth.verifyPassword("correct horse battery", h)).toBe(true);
    expect(auth.verifyPassword("wrong", h)).toBe(false);
    expect(auth.verifyPassword("x", "garbage")).toBe(false);
  });

  it("invites are single-use and stored only as hashes", () => {
    const code = auth.createInvite(A, "test");
    expect(auth.inviteValid(code)).toBe(true);
    const raw = new DatabaseSync(path.join(dir, "forma.db")).prepare("SELECT code_hash FROM invites").all() as { code_hash: string }[];
    expect(raw.some((r) => r.code_hash === code)).toBe(false);
    const C = auth.createUser("c@test.test", "C", "password-cccc-1", false);
    expect(auth.consumeInvite(code, C)).toBe(true);
    expect(auth.consumeInvite(code, C)).toBe(false);
    expect(auth.inviteValid(code)).toBe(false);
  });

  it("expired invites are rejected", () => {
    const code = auth.createInvite(A, null, -1);
    expect(auth.inviteValid(code)).toBe(false);
  });

  it("throttles repeated login attempts", () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 8; i++) expect(auth.throttle(key)).toBe(true);
    expect(auth.throttle(key)).toBe(false);
  });
});

describe("account separation", () => {
  it("plans of one user are invisible and immutable to another", () => {
    const id = data.createPlan(A, "A plan", "manual", plan as never, null);
    expect(data.getPlan(B, id)).toBeNull();
    expect(data.savePlanVersion(B, id, plan as never, "hack")).toBeNull();
    data.setPlanStatus(B, id, "archived");
    expect(data.getPlan(A, id)!.status).toBe("active");
    expect(data.listPlans(B)).toEqual([]);
  });

  it("workouts can't be read or overwritten across accounts", () => {
    const id = crypto.randomUUID();
    expect(data.upsertWorkout(A, workout(id, "2026-10-01T11:00:00.000Z"))).toBe("saved");
    expect(data.getWorkout(B, id)).toBeNull();
    expect(data.upsertWorkout(B, workout(id, "2026-10-02T11:00:00.000Z"))).toBe("forbidden");
    data.deleteWorkout(B, id);
    expect(data.getWorkout(A, id)).not.toBeNull();
  });

  it("diary entries, custom foods and recipes are private", () => {
    const food = data.saveCustomProduct(A, { name: "Secret porridge", brand: null, barcode: null, basis: "g", state: "cooked", nutrients: { ...emptyNutrients(), kcal: 100 }, servings: [] });
    expect(data.getProduct(B, food)).toBeNull();
    expect(data.searchProducts(B, "secret")).toEqual([]);
    expect(data.addEntry(B, { productId: food, amount: 100, date: "2026-10-01", meal: null })).toBeNull();
    const entry = data.addEntry(A, { productId: food, amount: 100, date: "2026-10-01", meal: null })!;
    expect(data.diaryDay(B, "2026-10-01").entries).toEqual([]);
    data.updateEntry(B, entry, { amount: 999 });
    expect(data.deleteEntry(B, entry)).toBeNull();
    expect(data.diaryDay(A, "2026-10-01").entries[0]!.amount).toBe(100);
    const r = data.saveRecipe(A, { name: "R", ingredients: [], cookedYieldG: null, servings: 1, isMeal: false });
    expect(data.getRecipe(B, r)).toBeNull();
    data.deleteRecipe(B, r);
    expect(data.getRecipe(A, r)).not.toBeNull();
  });

  it("export contains only the requesting user's rows", () => {
    const e = data.exportUser(B) as Record<string, unknown[]>;
    expect(JSON.stringify(e)).not.toContain("Secret porridge");
    expect(JSON.stringify(e)).not.toContain("a@test.test");
    expect(e.plans).toEqual([]);
  });
});

describe("data integrity", () => {
  it("an older offline copy never overwrites newer data", () => {
    const id = crypto.randomUUID();
    data.upsertWorkout(A, workout(id, "2026-10-01T12:00:00.000Z", 10));
    expect(data.upsertWorkout(A, workout(id, "2026-10-01T11:00:00.000Z", 3))).toBe("stale");
    expect(data.getWorkout(A, id)!.exercises[0]!.sets[0]!.reps).toBe(10);
    // Re-sending the same payload is harmless (idempotent).
    expect(data.upsertWorkout(A, workout(id, "2026-10-01T12:00:00.000Z", 10))).toBe("saved");
    expect(data.getWorkout(A, id)!.exercises).toHaveLength(1);
  });

  it("correcting a product later doesn't rewrite past diary entries", () => {
    const food = data.saveCustomProduct(A, { name: "Bread", brand: null, barcode: null, basis: "g", state: null, nutrients: { ...emptyNutrients(), kcal: 250 }, servings: [] });
    data.addEntry(A, { productId: food, amount: 100, date: "2026-10-03", meal: null });
    data.saveCustomProduct(A, { id: food, name: "Bread", brand: null, barcode: null, basis: "g", state: null, nutrients: { ...emptyNutrients(), kcal: 300 }, servings: [] });
    expect(data.diaryDay(A, "2026-10-03").totals.kcal).toBe(250);
  });

  it("missing nutrients stay missing in totals", () => {
    data.addEntry(A, { date: "2026-10-04", meal: null, amount: 100, quick: { name: "Lunch out", kcal: 700 } });
    const d = data.diaryDay(A, "2026-10-04");
    expect(d.totals.kcal).toBe(700);
    expect(d.totals.protein).toBeNull();
  });

  it("deleting an account removes all of its data", () => {
    const D = auth.createUser("d@test.test", "D", "password-dddd-1", false);
    data.createPlan(D, "p", "manual", plan as never, null);
    data.addEntry(D, { date: "2026-10-01", meal: null, amount: 100, quick: { name: "x", kcal: 1 } });
    data.deleteUser(D);
    const db = new DatabaseSync(path.join(dir, "forma.db"));
    for (const t of ["plans", "diary_entries", "sessions", "training_profiles"]) {
      expect((db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).get(D) as { n: number }).n).toBe(0);
    }
  });
});

describe("backup and restore", () => {
  it("backs up a live database and restores it", () => {
    const env = { ...process.env, DATA_DIR: dir, BACKUP_DIR: path.join(dir, "backups") };
    execFileSync(process.execPath, ["scripts/backup.mjs"], { env });
    const [file] = fs.readdirSync(path.join(dir, "backups"));
    expect(file).toMatch(/^forma-.*\.db$/);
    const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), "forma-restore-"));
    execFileSync(process.execPath, ["scripts/restore.mjs", path.join(dir, "backups", file!)], { env: { ...env, DATA_DIR: restoreDir } });
    const db = new DatabaseSync(path.join(restoreDir, "forma.db"), { readOnly: true });
    expect((db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n).toBeGreaterThanOrEqual(2);
  });
});
