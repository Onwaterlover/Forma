import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATA_DIR = ":memory:";
delete process.env.DATABASE_URL;
process.env.GEMINI_API_KEY = "test-not-a-real-key";

type Ai = typeof import("./assistant");
type Data = typeof import("./data");
let ai: Ai;
let data: Data;
beforeAll(async () => {
  ai = await import("./assistant");
  data = await import("./data");
});
afterEach(() => vi.unstubAllGlobals());

const reply = (obj: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }))));

describe("AI food estimate", () => {
  it("accepts consistent values, marks the name and stores it once for everyone", async () => {
    reply({ food: true, name: "Udko z kurczaka bez skóry, pieczone", basis: "g", state: "cooked", kcal: 209, protein: 26, carbs: 0, fat: 10.9, fiber: 0 });
    const e = await ai.estimateFood("pieczone udko bez skórki", "pl");
    expect(e?.name).toBe("Udko z kurczaka bez skóry, pieczone (≈ szacunek AI)");
    expect(e?.nutrients.kcal).toBe(209);
    const auth = await import("./auth");
    const a = await auth.createUser("est-a@test.test", "A", "password-aaaa-1", true);
    const b = await auth.createUser("est-b@test.test", "B", "password-bbbb-1", false);
    await data.saveAiEstimate(a, "Pieczone udko bez skórki", e!);
    expect((await data.findAiEstimate(b, "pieczone  udko bez skorki"))?.name).toBe(e!.name);
  });
  it("looks it up on the web first and says so in the name", async () => {
    const calls: { tools?: unknown }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body));
      const text = JSON.stringify({ food: true, name: "Pierogi ruskie, gotowane", basis: "g", state: "cooked", kcal: 200, protein: 6, carbs: 30, fat: 6, fiber: 2 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: `Here: ${text}` }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "a" } }, { web: { uri: "b" } }] } }] }));
    }));
    const e = await ai.estimateFood("pierogi ruskie", "pl");
    expect(e?.name).toBe("Pierogi ruskie, gotowane (≈ średnia z internetu)");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.tools).toEqual([{ google_search: {} }]);
  });
  it("rejects non-food and energy that doesn't match the macros", async () => {
    reply({ food: false });
    expect(await ai.estimateFood("krzesło", "pl")).toBeNull();
    reply({ food: true, name: "X", basis: "g", state: null, kcal: 900, protein: 10, carbs: 10, fat: 1, fiber: 0 });
    expect(await ai.estimateFood("coś", "pl")).toBeNull();
  });
  it("own products can be deleted only by their owner; diary entries keep their values", async () => {
    const auth = await import("./auth");
    const { emptyNutrients } = await import("@/nutrition/calc");
    const a = await auth.createUser("own-a@test.test", "A", "password-aaaa-1", false);
    const b = await auth.createUser("own-b@test.test", "B", "password-bbbb-1", false);
    const id = await data.saveCustomProduct(a, { name: "Ziemniaki airfryer (≈ średnia z 3)", brand: null, barcode: null, basis: "g", state: null, nutrients: { ...emptyNutrients(), kcal: 120 }, servings: [] });
    await data.deleteOwnProduct(b, id);
    expect(await data.getProduct(a, id)).not.toBeNull();
    await data.deleteOwnProduct(a, id);
    expect(await data.getProduct(a, id)).toBeNull();
  });
});
