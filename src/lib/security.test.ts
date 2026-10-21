import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { emptyNutrients } from "@/nutrition/calc";

// Runs the real data layer against a throwaway in-memory Postgres (PGlite).
process.env.DATA_DIR = ":memory:";
delete process.env.DATABASE_URL;

type Data = typeof import("./data");
type Auth = typeof import("./auth");
type DbMod = typeof import("./db");
let data: Data;
let auth: Auth;
let dbm: DbMod;
let A: string;
let B: string;

beforeAll(async () => {
  dbm = await import("./db");
  data = await import("./data");
  auth = await import("./auth");
  A = await auth.createUser("a@test.test", "A", "password-aaaa-1", true);
  B = await auth.createUser("b@test.test", "B", "password-bbbb-1", false);
}, 60_000);

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

  it("invites are single-use and stored only as hashes", async () => {
    const code = await auth.createInvite(A, "test");
    expect(await auth.inviteValid(code)).toBe(true);
    const raw = await (await dbm.db()).all<{ code_hash: string }>("SELECT code_hash FROM invites");
    expect(raw.some((r) => r.code_hash === code)).toBe(false);
    const C = await auth.createUser("c@test.test", "C", "password-cccc-1", false);
    expect(await auth.consumeInvite(code, C)).toBe(true);
    expect(await auth.consumeInvite(code, C)).toBe(false);
    expect(await auth.inviteValid(code)).toBe(false);
  });

  it("expired invites are rejected", async () => {
    const code = await auth.createInvite(A, null, -1);
    expect(await auth.inviteValid(code)).toBe(false);
  });

  it("throttles repeated login attempts (stored in the database)", async () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 8; i++) expect(await auth.throttle(key)).toBe(true);
    expect(await auth.throttle(key)).toBe(false);
  });

  it("emails are unique regardless of case", async () => {
    await expect(auth.createUser("A@TEST.TEST", "dup", "password-xxxx-1", false)).rejects.toThrow();
  });
});

describe("account separation", () => {
  it("plans of one user are invisible and immutable to another", async () => {
    const id = await data.createPlan(A, "A plan", "manual", plan as never, null);
    expect(await data.getPlan(B, id)).toBeNull();
    expect(await data.savePlanVersion(B, id, plan as never, "hack")).toBeNull();
    await data.setPlanStatus(B, id, "archived");
    expect((await data.getPlan(A, id))!.status).toBe("active");
    expect(await data.listPlans(B)).toEqual([]);
  });

  it("workouts can't be read or overwritten across accounts", async () => {
    const id = crypto.randomUUID();
    expect(await data.upsertWorkout(A, workout(id, "2026-10-01T11:00:00.000Z"))).toBe("saved");
    expect(await data.getWorkout(B, id)).toBeNull();
    expect(await data.upsertWorkout(B, workout(id, "2026-10-02T11:00:00.000Z"))).toBe("forbidden");
    await data.deleteWorkout(B, id);
    expect(await data.getWorkout(A, id)).not.toBeNull();
  });

  it("diary entries, custom foods and recipes are private", async () => {
    const food = await data.saveCustomProduct(A, { name: "Secret porridge", brand: null, barcode: null, basis: "g", state: "cooked", nutrients: { ...emptyNutrients(), kcal: 100 }, servings: [] });
    expect(await data.getProduct(B, food)).toBeNull();
    expect(await data.searchProducts(B, "secret")).toEqual([]);
    expect(await data.searchProducts(A, "secret")).toHaveLength(1);
    expect(await data.addEntry(B, { productId: food, amount: 100, date: "2026-10-01", meal: null })).toBeNull();
    const entry = (await data.addEntry(A, { productId: food, amount: 100, date: "2026-10-01", meal: null }))!;
    expect((await data.diaryDay(B, "2026-10-01")).entries).toEqual([]);
    await data.updateEntry(B, entry, { amount: 999 });
    expect(await data.deleteEntry(B, entry)).toBe(false);
    expect(await data.undoDelete(B, entry)).toBe(false);
    expect((await data.diaryDay(A, "2026-10-01")).entries[0]!.amount).toBe(100);
    const r = await data.saveRecipe(A, { name: "R", ingredients: [], cookedYieldG: null, servings: 1, isMeal: false });
    expect(await data.getRecipe(B, r)).toBeNull();
    await data.deleteRecipe(B, r);
    expect(await data.getRecipe(A, r)).not.toBeNull();
  });

  it("export contains only the requesting user's rows", async () => {
    const e = (await data.exportUser(B)) as Record<string, unknown[]>;
    expect(JSON.stringify(e)).not.toContain("Secret porridge");
    expect(JSON.stringify(e)).not.toContain("a@test.test");
    expect(e.plans).toEqual([]);
  });
});

describe("data integrity", () => {
  it("an older offline copy never overwrites newer data", async () => {
    const id = crypto.randomUUID();
    await data.upsertWorkout(A, workout(id, "2026-10-01T12:00:00.000Z", 10));
    expect(await data.upsertWorkout(A, workout(id, "2026-10-01T11:00:00.000Z", 3))).toBe("stale");
    expect((await data.getWorkout(A, id))!.exercises[0]!.sets[0]!.reps).toBe(10);
    expect(await data.upsertWorkout(A, workout(id, "2026-10-01T12:00:00.000Z", 10))).toBe("saved");
    expect((await data.getWorkout(A, id))!.exercises).toHaveLength(1);
  });

  it("correcting a product later doesn't rewrite past diary entries", async () => {
    const food = await data.saveCustomProduct(A, { name: "Bread", brand: null, barcode: null, basis: "g", state: null, nutrients: { ...emptyNutrients(), kcal: 250 }, servings: [] });
    await data.addEntry(A, { productId: food, amount: 100, date: "2026-10-03", meal: null });
    await data.saveCustomProduct(A, { id: food, name: "Bread", brand: null, barcode: null, basis: "g", state: null, nutrients: { ...emptyNutrients(), kcal: 300 }, servings: [] });
    expect((await data.diaryDay(A, "2026-10-03")).totals.kcal).toBe(250);
  });

  it("delete + undo restores the exact entry", async () => {
    const id = (await data.addEntry(A, { date: "2026-10-05", meal: "lunch", amount: 100, quick: { name: "Soup", kcal: 320 } }))!;
    expect(await data.deleteEntry(A, id)).toBe(true);
    expect((await data.diaryDay(A, "2026-10-05")).entries).toEqual([]);
    expect(await data.undoDelete(A, id)).toBe(true);
    const e = (await data.diaryDay(A, "2026-10-05")).entries[0]!;
    expect(e).toMatchObject({ id, name: "Soup", meal: "lunch" });
    expect(await data.undoDelete(A, id)).toBe(false);
  });

  it("missing nutrients stay missing in totals", async () => {
    await data.addEntry(A, { date: "2026-10-04", meal: null, amount: 100, quick: { name: "Lunch out", kcal: 700 } });
    const d = await data.diaryDay(A, "2026-10-04");
    expect(d.totals.kcal).toBe(700);
    expect(d.totals.protein).toBeNull();
  });

  it("recent foods and intake history aggregate correctly", async () => {
    const food = await data.saveCustomProduct(A, { name: "Oats", brand: null, barcode: null, basis: "g", state: "raw", nutrients: { ...emptyNutrients(), kcal: 380, protein: 13 }, servings: [] });
    await data.addEntry(A, { productId: food, amount: 50, date: "2026-10-06", meal: null });
    await data.addEntry(A, { productId: food, amount: 80, date: "2026-10-07", meal: null });
    const recent = await data.recentProducts(A, 5);
    expect(recent.find((p) => p.id === food)!.lastAmount).toBe(80);
    const hist = await data.intakeHistory(A, "2026-10-06");
    expect(hist.find((h) => h.date === "2026-10-07")!.kcal).toBeCloseTo(304, 0);
  });

  it("deleting an account removes all of its data", async () => {
    const D = await auth.createUser("d@test.test", "D", "password-dddd-1", false);
    await data.createPlan(D, "p", "manual", plan as never, null);
    await data.addEntry(D, { date: "2026-10-01", meal: null, amount: 100, quick: { name: "x", kcal: 1 } });
    await data.deleteUser(D);
    const q = await dbm.db();
    for (const t of ["plans", "diary_entries", "sessions", "training_profiles"]) {
      expect((await q.get<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${t} WHERE user_id = ?`, [D]))!.n).toBe(0);
    }
  });
});

describe("family products", () => {
  it("copies another member's product definition by barcode, never their diary", async () => {
    const nutrients = { ...emptyNutrients(), kcal: 99, protein: 10 };
    await data.saveCustomProduct(B, { name: "Serek domowy B", brand: null, barcode: "5901234123457", basis: "g", state: null, nutrients, servings: [] });
    expect(await data.productByBarcode(A, "5901234123457")).toBeNull();
    const copy = await data.copyFamilyProduct(A, "5901234123457");
    expect(copy).toMatchObject({ name: "Serek domowy B", mine: true, barcode: "5901234123457" });
    expect(copy!.nutrients.kcal).toBe(99);
    expect((await data.productByBarcode(A, "5901234123457"))!.id).toBe(copy!.id);
    expect(await data.copyFamilyProduct(A, "0000000000000")).toBeNull();
  });
});

describe("backup and restore", () => {
  it("backs up a database to JSON and restores it into another", async () => {
    const make = async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forma-bk-"));
      const d = await dbm.openPglite(path.join(dir, "pg"));
      await dbm.migrate(d);
      return { dir, d };
    };
    const src = await make();
    await src.d.run("INSERT INTO users (id, email, name, password_hash, created_at) VALUES ('u1','x@test.test','X','h','2026')");
    await src.d.close();
    const dst = await make();
    await dst.d.close();

    const env = { ...process.env, DATABASE_URL: "", BACKUP_DIR: path.join(src.dir, "backups") };
    delete (env as Record<string, string | undefined>).DATABASE_URL;
    execFileSync(process.execPath, ["scripts/backup.mjs"], { env: { ...env, DATA_DIR: src.dir } });
    const [file] = fs.readdirSync(path.join(src.dir, "backups"));
    expect(file).toMatch(/^forma-.*\.json$/);
    execFileSync(process.execPath, ["scripts/restore.mjs", path.join(src.dir, "backups", file!)], { env: { ...env, DATA_DIR: dst.dir } });

    const check = await dbm.openPglite(path.join(dst.dir, "pg"));
    expect(await check.all("SELECT email FROM users")).toEqual([{ email: "x@test.test" }]);
    await check.close();
  }, 120_000);
});

describe("body measurements", () => {
  const day = (date: string, waist: number | null, hips: number | null = null) => ({ date, waist, hips, chest: null, arm: null, thigh: null });

  it("are private to their owner and in their export only", async () => {
    expect(await data.saveMeasurement(A, day("2026-10-12", 81.5, 97))).toBe("saved");
    expect(await data.listMeasurements(B)).toEqual([]);
    await data.deleteMeasurement(B, "2026-10-12");
    expect(await data.saveMeasurement(B, day("2026-10-12", 70))).toBe("saved");
    expect(await data.listMeasurements(A)).toEqual([day("2026-10-12", 81.5, 97)]);
    expect(await data.listMeasurements(B)).toEqual([day("2026-10-12", 70)]);
    const e = (await data.exportUser(B)) as Record<string, { waist_cm: number }[]>;
    expect(e.body_measurements!.map((r) => r.waist_cm)).toEqual([70]);
  });

  it("keep one row per day, written as entered; an emptied day is removed", async () => {
    await data.saveMeasurement(A, day("2026-10-19", 81, 96.5));
    await data.saveMeasurement(A, day("2026-10-19", 80.5));
    expect((await data.listMeasurements(A, "2026-10-19"))).toEqual([day("2026-10-19", 80.5)]);
    expect(await data.saveMeasurement(A, day("2026-10-19", null))).toBe("deleted");
    expect(await data.listMeasurements(A, "2026-10-19")).toEqual([]);
    await expect(data.saveMeasurement(A, day("2026-10-20", 5))).rejects.toThrow();
  });
});

describe("progress photos", () => {
  it("are private to their owner", async () => {
    const id = await data.addPhoto(A, { date: "2026-10-10", pose: "front", note: null, mime: "image/jpeg", data: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), width: 10, height: 10 });
    expect(await data.getPhoto(B, id)).toBeNull();
    expect(await data.listPhotos(B)).toEqual([]);
    await data.deletePhoto(B, id);
    const mine = await data.getPhoto(A, id);
    expect(mine?.mime).toBe("image/jpeg");
    expect([...mine!.data].slice(0, 3)).toEqual([0xff, 0xd8, 0xff]);
  });
});
