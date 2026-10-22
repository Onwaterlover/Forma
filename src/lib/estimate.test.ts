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
  it("rejects non-food and energy that doesn't match the macros", async () => {
    reply({ food: false });
    expect(await ai.estimateFood("krzesło", "pl")).toBeNull();
    reply({ food: true, name: "X", basis: "g", state: null, kcal: 900, protein: 10, carbs: 10, fat: 1, fiber: 0 });
    expect(await ai.estimateFood("coś", "pl")).toBeNull();
  });
});
