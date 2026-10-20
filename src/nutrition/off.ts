import { energyMismatch, kjToKcal, sanitize, type Nutrients } from "./calc";

// Mapping of Open Food Facts product JSON to our product shape. Pure and unit-tested.
// Data © Open Food Facts contributors, ODbL — attribution is shown wherever products are displayed.

export const OFF_FIELDS = [
  "code", "product_name", "product_name_pl", "product_name_de", "product_name_en", "brands", "quantity",
  "product_quantity_unit", "serving_size", "serving_quantity", "nutriments", "nutrition_data_per",
].join(",");

export interface ProductDraft {
  barcode: string;
  name: string;
  brand: string | null;
  basis: "g" | "ml";
  nutrients: Nutrients;
  servings: { label: string; amount: number }[];
  warnings: ("energy_mismatch" | "no_nutrition" | "no_energy")[];
}

type OffNutriments = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function mapOffProduct(raw: unknown, lang: "pl" | "de" | "en" = "pl"): ProductDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const barcode = str(p.code);
  const name = str(p[`product_name_${lang}`]) ?? str(p.product_name) ?? str(p.product_name_en) ?? str(p.product_name_pl) ?? str(p.product_name_de);
  if (!barcode || !name) return null;

  const n = (p.nutriments && typeof p.nutriments === "object" ? p.nutriments : {}) as OffNutriments;
  let kcal = n["energy-kcal_100g"];
  if (kcal === undefined || kcal === null || kcal === "") {
    const kj = Number(n["energy-kj_100g"] ?? n["energy_100g"]);
    kcal = Number.isFinite(kj) && kj > 0 ? kjToKcal(kj) : null;
  }
  const nutrients = sanitize({
    kcal,
    protein: n["proteins_100g"],
    carbs: n["carbohydrates_100g"],
    fat: n["fat_100g"],
    fiber: n["fiber_100g"],
    sugar: n["sugars_100g"],
    satFat: n["saturated-fat_100g"],
    salt: n["salt_100g"],
  });

  const unit = str(p.product_quantity_unit)?.toLowerCase();
  const qty = str(p.quantity)?.toLowerCase() ?? "";
  const basis: "g" | "ml" = unit === "ml" || /\d\s*(ml|cl|l)\b/.test(qty) ? "ml" : "g";

  const servings: ProductDraft["servings"] = [];
  const sq = Number(p.serving_quantity);
  if (Number.isFinite(sq) && sq > 0 && sq < 5000) servings.push({ label: str(p.serving_size) ?? `${sq} ${basis}`, amount: sq });

  const warnings: ProductDraft["warnings"] = [];
  if (Object.values(nutrients).every((v) => v === null)) warnings.push("no_nutrition");
  else if (nutrients.kcal === null) warnings.push("no_energy");
  if (energyMismatch(nutrients)) warnings.push("energy_mismatch");

  return { barcode, name, brand: str(p.brands)?.split(",")[0]?.trim() ?? null, basis, nutrients, servings, warnings };
}
