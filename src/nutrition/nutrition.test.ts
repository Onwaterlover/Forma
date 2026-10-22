import { describe, expect, it } from "vitest";
import { gtinChecksumOk, normalizeBarcode, upcEToUpcA } from "./barcode";
import { emptyNutrients, energyMismatch, medianOf, parseDecimal, recipe, sanitize, scale, sum, type Nutrients } from "./calc";
import { adaptiveTdee, initialEstimate, proteinTarget, suggestTarget, weightTrend, type IntakeDay, type WeighIn } from "./energy";
import { mapOffProduct } from "./off";

const n = (o: Partial<Nutrients>): Nutrients => ({ ...emptyNutrients(), ...o });
const RICE_RAW = n({ kcal: 350, protein: 7, carbs: 78, fat: 0.6 });
const RICE_COOKED = n({ kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 });

describe("decimal input", () => {
  it.each([
    ["12,5", 12.5], ["12.5", 12.5], [" 150 ", 150], ["1 234,5", 1234.5], ["1.234,5", 1234.5], ["1,234.5", 1234.5], [",5", 0.5],
  ])("parses %s", (s, v) => expect(parseDecimal(s)).toBe(v));
  it.each(["", "abc", "12,5,1", "1e5", "--1"])("rejects %s", (s) => expect(parseDecimal(s)).toBeNull());
});

describe("scaling and sums", () => {
  it("scales per-100 g values to the eaten amount", () => {
    const s = scale(n({ kcal: 250, protein: 10, carbs: 30.5, fat: 9 }), 35);
    expect(s).toMatchObject({ kcal: 87.5, protein: 3.5, carbs: 10.7, fat: 3.2 });
  });
  it("keeps missing nutrients missing instead of zero", () => {
    const s = scale(n({ kcal: 100 }), 50);
    expect(s.protein).toBeNull();
    const t = sum([s, scale(n({ kcal: 200, protein: 10 }), 100)]);
    expect(t.kcal).toBe(250);
    expect(t.protein).toBe(10);
    expect(t.missing.protein).toBe(1);
    expect(t.incomplete).toContain("protein");
  });
  it("raw and cooked rice are different foods", () => {
    expect(scale(RICE_RAW, 100).kcal).not.toBe(scale(RICE_COOKED, 100).kcal);
    expect(scale(RICE_COOKED, 300).kcal).toBe(390);
  });
  it("handles decimal grams", () => {
    expect(scale(n({ kcal: 884 }), 12.5).kcal).toBe(110.5);
  });
});

describe("recipes", () => {
  const ingredients = [
    { name: "Ryż (surowy)", grams: 200, nutrients: RICE_RAW },
    { name: "Kurczak", grams: 300, nutrients: n({ kcal: 110, protein: 23, carbs: 0, fat: 1.5 }) },
    { name: "Oliwa", grams: 10, nutrients: n({ kcal: 884, protein: 0, carbs: 0, fat: 100 }) },
  ];
  it("totals, per serving and per 100 g of the cooked dish", () => {
    const r = recipe(ingredients, { cookedYieldG: 1000, servings: 4 });
    expect(r.total.kcal).toBeCloseTo(700 + 330 + 88.4, 1);
    expect(r.rawWeight).toBe(510);
    expect(r.perServing.kcal).toBeCloseTo(1118.4 / 4, 0);
    expect(r.per100.kcal).toBeCloseTo(111.8, 1);
  });
  it("without a cooked yield, per-100 refers to the raw ingredient weight", () => {
    const r = recipe(ingredients);
    expect(r.finalWeight).toBe(510);
  });
  it("flags nutrients that some ingredient was missing", () => {
    const r = recipe([...ingredients, { name: "Przyprawa", grams: 5, nutrients: n({ kcal: 20 }) }]);
    expect(r.total.incomplete).toContain("protein");
  });
});

describe("data validation", () => {
  it("drops impossible values instead of trusting them", () => {
    const s = sanitize({ kcal: "-5", protein: 140, carbs: "abc", fat: "12,5", sugar: 50 });
    expect(s).toMatchObject({ kcal: null, protein: null, carbs: null, fat: 12.5 });
  });
  it("sugar can't exceed carbs", () => {
    expect(sanitize({ carbs: 10, sugar: 30 }).sugar).toBeNull();
  });
  it("flags labels whose energy doesn't match their macros (but keeps the label value)", () => {
    expect(energyMismatch(n({ kcal: 100, protein: 20, carbs: 50, fat: 20 }))).toBe(true);
    expect(energyMismatch(n({ kcal: 389, protein: 13, carbs: 67, fat: 7 }))).toBe(false);
  });
});

describe("Open Food Facts mapping", () => {
  it("maps a typical product", () => {
    const p = mapOffProduct({
      code: "5900259000002", product_name: "Jogurt naturalny", brands: "Mlekovita, Inna", quantity: "400 g",
      serving_quantity: 150, serving_size: "150 g",
      nutriments: { "energy-kcal_100g": 61, proteins_100g: 4.3, carbohydrates_100g: 6, sugars_100g: 6, fat_100g: 2, salt_100g: 0.13 },
    })!;
    expect(p).toMatchObject({ name: "Jogurt naturalny", brand: "Mlekovita", basis: "g", servings: [{ amount: 150 }] });
    expect(p.nutrients).toMatchObject({ kcal: 61, protein: 4.3, fiber: null });
    expect(p.warnings).toEqual([]);
  });
  it("finds a name for imported products and falls back to brand and size", () => {
    expect(mapOffProduct({ code: "8594000000000", product_name_cs: "Jogurt bílý", nutriments: { "energy-kcal_100g": 60 } }, "pl")!.name).toBe("Jogurt bílý");
    expect(mapOffProduct({ code: "5900000000000", generic_name: "Twaróg półtłusty", nutriments: { "energy-kcal_100g": 130 } }, "pl")!.name).toBe("Twaróg półtłusty");
    expect(mapOffProduct({ code: "5900000000001", brands: "Mlekovita, Inne", quantity: "200 g", nutriments: {} }, "pl")!.name).toBe("Mlekovita 200 g");
    expect(mapOffProduct({ code: "5900000000002", nutriments: {} }, "pl")).toBeNull();
  });

  it("derives kcal from kJ and detects liquids", () => {
    const p = mapOffProduct({ code: "4000000000000", product_name: "Saft", quantity: "1 l", nutriments: { "energy-kj_100g": 184, carbohydrates_100g: 10 } }, "de")!;
    expect(p.nutrients.kcal).toBeCloseTo(44, 0);
    expect(p.basis).toBe("ml");
  });
  it("reports missing nutrition and rejects nameless products", () => {
    expect(mapOffProduct({ code: "123", product_name: "X", nutriments: {} })!.warnings).toContain("no_nutrition");
    expect(mapOffProduct({ code: "123" })).toBeNull();
    expect(mapOffProduct("garbage")).toBeNull();
  });
  it("prefers the localised name", () => {
    expect(mapOffProduct({ code: "1", product_name: "Milk", product_name_pl: "Mleko" }, "pl")!.name).toBe("Mleko");
  });
});

describe("barcodes", () => {
  it("validates GTIN check digits", () => {
    expect(gtinChecksumOk("5901234123457")).toBe(true); // EAN-13
    expect(gtinChecksumOk("5901234123458")).toBe(false);
    expect(gtinChecksumOk("96385074")).toBe(true); // EAN-8
    expect(gtinChecksumOk("036000291452")).toBe(true); // UPC-A
  });
  it("normalises UPC-A to 13 digits and expands UPC-E", () => {
    expect(normalizeBarcode("036000291452")).toBe("0036000291452");
    expect(upcEToUpcA("04252614")).toBe("042100005264");
    expect(normalizeBarcode("04252614", "UPC_E")).toBe("0042100005264");
    expect(normalizeBarcode("12345")).toBeNull();
    expect(normalizeBarcode(" 5901234-123457 ")).toBe("5901234123457");
  });
});

describe("bodyweight trend and adaptive expenditure", () => {
  const dates = (n: number, end = "2026-10-20") =>
    Array.from({ length: n }, (_, i) => new Date(Date.parse(end) - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));

  it("smooths noisy weigh-ins and handles gaps", () => {
    const t = weightTrend([{ date: "2026-10-01", kg: 80 }, { date: "2026-10-02", kg: 81.5 }, { date: "2026-10-09", kg: 79.5 }]);
    expect(t[1]!.trend).toBeCloseTo(80.15, 2);
    expect(t[2]!.trend).toBeLessThan(80.15);
    expect(t[2]!.trend).toBeGreaterThan(79.5);
  });

  it("refuses to estimate from a handful of entries", () => {
    const r = adaptiveTdee([{ date: "2026-10-19", kcal: 2000 }], [{ date: "2026-10-19", kg: 80 }], { today: "2026-10-20" });
    expect(r.status).toBe("insufficient");
    if (r.status === "insufficient") expect(r.reasons).toEqual(["too_few_logged_days", "too_few_weigh_ins", "weigh_in_span_too_short"]);
    expect(suggestTarget(r, "lose", 2000, 80)).toEqual({ kind: "none", reason: "insufficient_data" });
  });

  it("estimates expenditure from steady intake and a falling trend", () => {
    const ds = dates(28);
    const intake: IntakeDay[] = ds.map((date) => ({ date, kcal: 2200 }));
    const weights: WeighIn[] = ds.filter((_, i) => i % 2 === 0).map((date, i) => ({ date, kg: 80 - i * 0.07 + (i % 2 ? 0.2 : -0.2) }));
    const r = adaptiveTdee(intake, weights, { today: "2026-10-20" });
    expect(r.status).not.toBe("insufficient");
    if (r.status === "insufficient") return;
    // ~ -0.035 kg/day → ~270 kcal/day deficit → ~2470
    expect(r.tdee).toBeGreaterThan(2300);
    expect(r.tdee).toBeLessThan(2650);
    expect(r.low).toBeLessThan(r.tdee);
  });

  it("works with weekly weigh-ins over five weeks", () => {
    const ds = dates(35);
    const intake: IntakeDay[] = ds.map((date) => ({ date, kcal: 2000, complete: true }));
    const weights: WeighIn[] = ds.filter((_, i) => i % 7 === 0).map((date, i) => ({ date, kg: 82 - i * 0.4 }));
    const r = adaptiveTdee(intake, weights, { today: "2026-10-20" });
    expect(r.status).not.toBe("insufficient");
    if (r.status === "insufficient") return;
    expect(r.weighIns).toBe(5);
    expect(r.kgPerWeek).toBeCloseTo(-0.4, 1);
  });

  it("sets protein at 1.8 g/kg in a deficit and 1.6 g/kg otherwise", () => {
    expect(proteinTarget(80, "lose")).toBe(145);
    expect(proteinTarget(80, "recomp")).toBe(145);
    expect(proteinTarget(80, "maintain")).toBe(130);
    expect(proteinTarget(62, "gain")).toBe(100);
  });

  it("ignores days marked incomplete and implausibly low days", () => {
    const ds = dates(28);
    const intake: IntakeDay[] = ds.map((date, i) => ({ date, kcal: i % 4 === 0 ? 600 : 2400, complete: i % 7 === 0 ? false : undefined }));
    const weights: WeighIn[] = ds.filter((_, i) => i % 3 === 0).map((date) => ({ date, kg: 75 }));
    const r = adaptiveTdee(intake, weights, { today: "2026-10-20" });
    if (r.status === "insufficient") throw new Error("expected estimate");
    expect(r.avgIntake).toBe(2400);
    expect(r.tdee).toBe(2400);
  });

  it("does not suggest a change when the goal is on track", () => {
    const ok = { status: "ok" as const, tdee: 2500, low: 2300, high: 2700, avgIntake: 2200, kgPerWeek: -0.4, loggedDays: 20, weighIns: 12 };
    expect(suggestTarget(ok, "lose", 2200, 80).kind).toBe("none");
    const stalled = { ...ok, kgPerWeek: 0.05, avgIntake: 2500 };
    const s = suggestTarget(stalled, "lose", 2500, 80);
    expect(s.kind).toBe("change");
    if (s.kind === "change") {
      expect(s.kcal).toBeLessThan(2500);
      expect(s.kcal).toBeGreaterThanOrEqual(2000); // modest deficit
    }
  });

  it("initial estimate is a rounded range", () => {
    const e = initialEstimate({ sex: "male", age: 30, heightCm: 180, weightKg: 80, activity: 1.55 });
    expect(e.tdee).toBe(2750);
    expect(e.low).toBeLessThan(e.tdee);
    expect(e.high).toBeGreaterThan(e.tdee);
  });
});

describe("average of similar products", () => {
  const p = (kcal: number | null, protein: number | null, basis: "g" | "ml" = "g") => ({ basis, nutrients: { ...emptyNutrients(), kcal, protein } });
  it("takes the median per nutrient, ignoring an odd one and the minority unit", () => {
    const m = medianOf([p(280, 3), p(300, 4), p(2900, 40), p(290, null), p(50, 1, "ml")])!;
    expect(m.basis).toBe("g");
    expect(m.used).toHaveLength(4);
    expect(m.nutrients.kcal).toBe(295);
    expect(m.nutrients.protein).toBe(4);
  });
  it("needs at least two usable products", () => {
    expect(medianOf([p(100, 1)])).toBeNull();
    expect(medianOf([p(null, 1), p(100, 2)])).toBeNull();
  });
});
