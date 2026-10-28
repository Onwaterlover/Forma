import { beforeAll, describe, expect, it } from "vitest";
import { generatePlan } from "@/engine/generator";
import { defaultProfile } from "@/engine/profile";
import { translator } from "@/i18n";
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

const ctx = (userId: string) => ({ userId, locale: "pl" as const, date: "2026-10-20", proposals: [] as import("./assistant").Proposal[] });

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

  it("edits an imported plan without a questionnaire: 4x a week with Upper twice, kg and exercise search", async () => {
    // User B has no training profile, like someone who only imported a plan.
    const pe = (exerciseId: string) => ({ exerciseId, sets: 3, repMin: 8, repMax: 12, restSec: 90, effort: "leave_1_3", progression: "double", pattern: "h_pull", priority: 2 });
    const session = (key: string, name: string, ids: string[]) => ({ key, template: "IMPORTED", name, day: null, locationId: "", exercises: ids.map(pe), estimatedMinutes: 30 });
    await data.createPlan(B, "Plan treningowy", "imported", {
      engineVersion: "1", split: "imported", weeklySets: {}, tradeoffs: [], notes: [],
      sessions: [session("A", "Góra", ["lat_pulldown"]), session("B", "Pośladki A", ["hip_thrust_bb"]), session("C", "Nogi + pośladki B", ["leg_press"])],
    } as never, "imported", true);
    const c = ctx(B);
    const found = await ai.runTool(c, "find_exercises", { query: "hip thrust maszyn", region: null });
    expect(found).toContain("hip_thrust_machine");
    const r = await ai.runTool(c, "propose_plan_edit", { changes: [
      { op: "duplicate_session", session_key: "A", exercise_id: null, name: null, day: null, position: 3, sets: null, rep_min: null, rep_max: null, kg: null, rest_sec: null },
      { op: "set_exercise", session_key: "C", exercise_id: "leg_press", name: null, day: null, position: null, sets: null, rep_min: null, rep_max: null, kg: 70, rest_sec: null },
    ] });
    expect(typeof r).toBe("string");
    expect(c.proposals[0]!.lines.join(" | ")).toContain("Góra → Pośladki A → Góra → Nogi + pośladki B");
    // Nothing changes until the user taps Apply.
    expect((await data.getActivePlan(B))!.data.sessions).toHaveLength(3);
    // Bad input comes back as an error the model can fix.
    expect(await ai.runTool(c, "propose_plan_edit", { changes: [{ op: "remove_session", session_key: "Z" }] })).toHaveProperty("error");
  });

  it("not in the database: proposes the median of similar products, named as such", async () => {
    await data.searchProducts(A, "jablko", 1); // makes sure the basic foods exist
    const c = ctx(A);
    const r = await ai.runTool(c, "propose_food_average", { name: "Owoc", product_ids: ["gen_pl_apple", "gen_pl_banana", "gen_pl_orange"], grams: 100, meal: null });
    expect(typeof r).toBe("string");
    // median of 52, 89, 47 kcal = 52
    expect(c.proposals[0]!.lines[0]).toContain("52 kcal");
    expect(c.proposals[0]!.lines[1]).toContain("Jabłko");
    expect(await ai.runTool(c, "propose_food_average", { name: "X", product_ids: ["gen_pl_apple", "nope"], grams: 100, meal: null })).toHaveProperty("error");
  });

  it("computes food from the database and rejects unknown products", async () => {
    const nutrients = { ...emptyNutrients(), kcal: 150, protein: 12.5, carbs: 1, fat: 10 };
    const egg = await data.saveCustomProduct(A, { name: "Jajko testowe", brand: null, barcode: null, basis: "g", state: null, nutrients, servings: [] });
    const c = ctx(A);
    expect(await ai.runTool(c, "search_food", { query: "jajko testowe" })).toContain(egg);
    expect(await ai.runTool(c, "propose_add_food", { meal: "breakfast", items: [{ product_id: "invented", grams: 100 }] })).toHaveProperty("error");
    await ai.runTool(c, "propose_add_food", { meal: "breakfast", items: [{ product_id: egg, grams: 120 }] });
    expect(c.proposals[0]!.lines[0]).toContain("180 kcal");
    expect(ai.foodPayload.parse((await data.pendingSuggestion(A, c.proposals[0]!.id))!.payload)).toEqual({ date: "2026-10-20", meal: "breakfast", items: [{ productId: egg, grams: 120, alts: [] }] });
    expect(c.proposals[0]!.items).toMatchObject([{ grams: 120, pick: { productId: egg, kcal100: 150 }, alts: [] }]);

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

describe("gemini provider", () => {
  it("runs tool calls, then returns a food card without another round trip", async () => {
    const { vi } = await import("vitest");
    process.env.GEMINI_API_KEY = "test-key";
    const bodies: { contents: { role: string; parts: Record<string, unknown>[] }[]; generationConfig?: { thinkingConfig?: Record<string, unknown> } }[] = [];
    const replies = [
      { candidates: [{ content: { role: "model", parts: [{ functionCall: { id: "c1", name: "search_food", args: { query: "jajko" } }, thoughtSignature: "sig" }] } }] },
      { candidates: [{ content: { role: "model", parts: [{ functionCall: { id: "c2", name: "propose_quick_entry", args: { name: "Obiad", kcal: 650, protein: null, carbs: null, fat: null, meal: "lunch" } } }] } }] },
    ];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify(replies[bodies.length - 1]), { status: 200 });
    });
    try {
      const r = await ai.runAssistant({ userId: A, locale: "pl", scope: "nutrition", date: "2026-10-20", history: [{ role: "user", text: "Dodaj 650 kcal na obiad" }] });
      expect(r).toMatchObject({ reply: translator("pl")("assistant.foodReady") });
      expect("proposals" in r && r.proposals).toHaveLength(1);
      expect(bodies).toHaveLength(2);
      expect(bodies[0]!.generationConfig?.thinkingConfig).toEqual({ thinkingLevel: "low" });
      const second = bodies[1]!.contents;
      expect(second.at(-2)!.parts[0]).toHaveProperty("thoughtSignature", "sig");
      expect(second.at(-1)!.parts[0]).toMatchObject({ functionResponse: { id: "c1", name: "search_food" } });
    } finally {
      vi.unstubAllGlobals();
      delete process.env.GEMINI_API_KEY;
    }
  });
});
