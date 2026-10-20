import { beforeAll, describe, expect, it } from "vitest";
import { generatePlan } from "@/engine/generator";
import { defaultProfile } from "@/engine/profile";
import { emptyNutrients } from "@/nutrition/calc";

// The assistant's tools against a throwaway in-memory database. No API calls are made here.
process.env.DATA_DIR = ":memory:";
delete process.env.DATABASE_URL;

type Data = typeof import("./data");
type Ai = typeof import("./assistant");
let data: Data;
let ai: Ai;
let A: string;
let B: string;

beforeAll(async () => {
  data = await import("./data");
  ai = await import("./assistant");
  const auth = await import("./auth");
  A = await auth.createUser("ai-a@test.test", "A", "password-aaaa-1", true);
  B = await auth.createUser("ai-b@test.test", "B", "password-bbbb-1", false);
  const profile = await data.saveProfile(A, defaultProfile());
  await data.createPlan(A, "Plan", "generated", generatePlan({ profile, prefs: {}, library: await data.libraryFor(A) }), null, true);
}, 60_000);

const ctx = (userId: string) => ({ userId, locale: "pl" as const, date: "2026-10-20", proposals: [] as { id: string; title: string; lines: string[] }[] });

describe("assistant tools", () => {
  it("only proposes swaps the engine allows, and stores them as pending", async () => {
    const plan = (await data.getActivePlan(A))!;
    const s = plan.data.sessions[0]!;
    const ex = s.exercises[0]!.exerciseId;
    const c = ctx(A);
    const list = await ai.runTool(c, "find_substitutes", { session_key: s.key, exercise_id: ex });
    expect(typeof list).toBe("string");
    const replacement = (list as string).split("\n")[0]!.split(" | ")[0]!;

    expect(await ai.runTool(c, "propose_swap", { session_key: s.key, exercise_id: ex, replacement_id: "made_up_exercise" })).toHaveProperty("error");
    expect(await ai.runTool(c, "propose_swap", { session_key: "nope", exercise_id: ex, replacement_id: replacement })).toHaveProperty("error");
    expect(c.proposals).toHaveLength(0);

    await ai.runTool(c, "propose_swap", { session_key: s.key, exercise_id: ex, replacement_id: replacement });
    expect(c.proposals).toHaveLength(1);
    const stored = await data.pendingSuggestion(A, c.proposals[0]!.id);
    expect(ai.swapPayload.parse(stored!.payload)).toMatchObject({ planId: plan.id, sessionKey: s.key, from: ex, to: replacement });
    // Nothing changed in the plan yet.
    expect((await data.getActivePlan(A))!.current_version).toBe(plan.current_version);
  });

  it("computes food from the database and rejects unknown products", async () => {
    const nutrients = { ...emptyNutrients(), kcal: 150, protein: 12.5, carbs: 1, fat: 10 };
    const egg = await data.saveCustomProduct(A, { name: "Jajko testowe", brand: null, barcode: null, basis: "g", state: null, nutrients, servings: [] });
    const c = ctx(A);
    expect(await ai.runTool(c, "search_food", { query: "jajko testowe" })).toContain(egg);
    expect(await ai.runTool(c, "propose_add_food", { meal: "breakfast", items: [{ product_id: "invented", grams: 100 }] })).toHaveProperty("error");
    await ai.runTool(c, "propose_add_food", { meal: "breakfast", items: [{ product_id: egg, grams: 120 }] });
    expect(c.proposals[0]!.lines[0]).toContain("180 kcal");
    expect(ai.foodPayload.parse((await data.pendingSuggestion(A, c.proposals[0]!.id))!.payload)).toEqual({ date: "2026-10-20", meal: "breakfast", items: [{ productId: egg, grams: 120 }] });

    // Another user can neither see the product nor use the proposal.
    expect(await ai.runTool(ctx(B), "propose_add_food", { meal: null, items: [{ product_id: egg, grams: 100 }] })).toHaveProperty("error");
    expect(await data.pendingSuggestion(B, c.proposals[0]!.id)).toBeNull();
    expect(await data.resolveSuggestion(B, c.proposals[0]!.id, "accepted")).toBe(false);
  });

  it("a proposal can be accepted only once", async () => {
    const c = ctx(A);
    await ai.runTool(c, "propose_quick_entry", { name: "Obiad na mieście", kcal: 650, protein: null, carbs: null, fat: null, meal: "lunch" });
    const id = c.proposals[0]!.id;
    expect(await data.resolveSuggestion(A, id, "accepted")).toBe(true);
    expect(await data.resolveSuggestion(A, id, "accepted")).toBe(false);
    expect(await data.pendingSuggestion(A, id)).toBeNull();
  });
});
