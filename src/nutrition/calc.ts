// Pure nutrition arithmetic. A missing value is `null` and stays missing — it is never treated as 0.

export const NUTRIENT_KEYS = ["kcal", "protein", "carbs", "fat", "fiber", "sugar", "satFat", "salt"] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export type Nutrients = Record<NutrientKey, number | null> & {
  /** Nutrients whose value is a lower bound because some ingredient lacked data. */
  incomplete?: NutrientKey[];
};

export const emptyNutrients = (): Nutrients => ({ kcal: null, protein: null, carbs: null, fat: null, fiber: null, sugar: null, satFat: null, salt: null });

/** Accepts "12,5", "12.5", " 1 234,5 "; returns null for anything that isn't a finite number. */
export function parseDecimal(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const s = input.trim().replace(/\s/g, "");
  if (!s) return null;
  // "1.234,5" (pl/de thousands) → "1234.5"; "1,234.5" (en) → "1234.5"
  let norm = s;
  if (s.includes(",") && s.includes(".")) {
    norm = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else {
    norm = s.replace(",", ".");
  }
  if (!/^-?\d*\.?\d+$/.test(norm)) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export const kjToKcal = (kj: number) => kj / 4.184;

/** Scale per-100 values to an eaten amount (grams or ml, same basis as the per-100 values). */
export function scale(per100: Nutrients, amount: number): Nutrients {
  const out = emptyNutrients();
  for (const k of NUTRIENT_KEYS) {
    const v = per100[k];
    out[k] = v === null ? null : r1((v * amount) / 100);
  }
  if (per100.incomplete?.length) out.incomplete = [...per100.incomplete];
  return out;
}

/** Sum several entries; a nutrient missing in some entries becomes a flagged lower bound. */
export function sum(items: Nutrients[]): Nutrients & { missing: Record<NutrientKey, number> } {
  const out = emptyNutrients() as Nutrients & { missing: Record<NutrientKey, number> };
  out.missing = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Record<NutrientKey, number>;
  const incomplete = new Set<NutrientKey>();
  for (const it of items) {
    for (const k of NUTRIENT_KEYS) {
      const v = it[k];
      if (v === null) {
        out.missing[k]++;
        continue;
      }
      out[k] = r1((out[k] ?? 0) + v);
      if (it.incomplete?.includes(k)) incomplete.add(k);
    }
  }
  for (const k of NUTRIENT_KEYS) if (out.missing[k] > 0 && out[k] !== null) incomplete.add(k);
  if (incomplete.size) out.incomplete = [...incomplete];
  return out;
}

export interface Ingredient {
  name: string;
  grams: number;
  nutrients: Nutrients; // per 100 g snapshot
}

export interface RecipeResult {
  total: Nutrients;
  rawWeight: number;
  /** Weight the per-100 values refer to: the cooked yield if given, else the raw ingredient weight. */
  finalWeight: number;
  per100: Nutrients;
  perServing: Nutrients;
}

export function recipe(ingredients: Ingredient[], opts: { cookedYieldG?: number | null; servings?: number } = {}): RecipeResult {
  const total = sum(ingredients.map((i) => scale(i.nutrients, i.grams)));
  const { missing: _m, ...totalClean } = total;
  const rawWeight = r1(ingredients.reduce((a, i) => a + i.grams, 0));
  const finalWeight = opts.cookedYieldG && opts.cookedYieldG > 0 ? opts.cookedYieldG : rawWeight;
  const servings = opts.servings && opts.servings > 0 ? opts.servings : 1;
  const per = (div: number) => {
    const o = emptyNutrients();
    for (const k of NUTRIENT_KEYS) o[k] = totalClean[k] === null || div <= 0 ? null : r1(totalClean[k]! / div);
    if (totalClean.incomplete) o.incomplete = [...totalClean.incomplete];
    return o;
  };
  return { total: totalClean, rawWeight, finalWeight, per100: per(finalWeight / 100), perServing: per(servings) };
}

/** Label sanity check: does the stated energy roughly match 4/4/9 (+2 for fibre)? */
export function energyMismatch(n: Nutrients): boolean {
  if (n.kcal === null || n.protein === null || n.carbs === null || n.fat === null) return false;
  const calc = 4 * n.protein + 4 * n.carbs + 9 * n.fat + 2 * (n.fiber ?? 0);
  return Math.abs(calc - n.kcal) > Math.max(40, n.kcal * 0.25);
}

export const MACRO_LIMITS: Partial<Record<NutrientKey, number>> = { kcal: 950, protein: 100, carbs: 100, fat: 100, fiber: 100, sugar: 100, satFat: 100, salt: 100 };

/** Drops impossible values (negative, NaN, > physical maximum per 100 g) to null instead of keeping bad data. */
export function sanitize(n: Partial<Record<NutrientKey, unknown>>): Nutrients {
  const out = emptyNutrients();
  for (const k of NUTRIENT_KEYS) {
    const v = parseDecimal(n[k] as string | number | null | undefined);
    out[k] = v === null || v < 0 || v > (MACRO_LIMITS[k] ?? Infinity) ? null : r1(v);
  }
  if (out.sugar !== null && out.carbs !== null && out.sugar > out.carbs + 0.5) out.sugar = null;
  if (out.satFat !== null && out.fat !== null && out.satFat > out.fat + 0.5) out.satFat = null;
  return out;
}
