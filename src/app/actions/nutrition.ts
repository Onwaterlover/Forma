"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isIsoDate, shiftDate } from "@/lib/ctx";
import { energyEstimate } from "@/lib/estimate";
import {
  addEntry, copyDay, deleteEntry, deleteRecipe, diaryDay, getProduct, getRecipe, intakeHistory, saveCustomProduct, undoDelete, saveRecipe, setDayComplete,
  setFavorite, setTarget, updateEntry, type Recipe,
  saveAverageProduct, deleteOwnProduct, type Product,
} from "@/lib/data";
import { translator } from "@/i18n";
import { NUTRIENT_KEYS, sanitize, type Nutrients } from "@/nutrition/calc";
import { normalizeBarcode } from "@/nutrition/barcode";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
const meal = z.enum(MEALS).nullable();
const amount = z.number().positive().max(9999);
const date = z.string().refine(isIsoDate);

const done = () => revalidatePath("/nutrition");

export async function addProductEntry(input: { productId: string; amount: number; date: string; meal: string | null }) {
  const user = await requireUser();
  const p = z.object({ productId: z.string().max(64), amount, date, meal }).safeParse(input);
  if (!p.success) return { error: "invalid" };
  const id = await addEntry(user.id, { productId: p.data.productId, amount: p.data.amount, date: p.data.date, meal: p.data.meal });
  done();
  return id ? { id } : { error: "not_found" };
}

export async function addRecipeEntry(input: { recipeId: string; amount: number; mode: "grams" | "servings"; date: string; meal: string | null }) {
  const user = await requireUser();
  const p = z.object({ recipeId: z.string().max(64), amount, mode: z.enum(["grams", "servings"]), date, meal }).safeParse(input);
  if (!p.success) return { error: "invalid" };
  const id = await addEntry(user.id, { recipeId: p.data.recipeId, mode: p.data.mode, amount: p.data.amount, date: p.data.date, meal: p.data.meal });
  done();
  return id ? { id } : { error: "not_found" };
}

export async function addQuickEntry(input: { name: string; kcal: number; protein?: number | null; carbs?: number | null; fat?: number | null; date: string; meal: string | null }) {
  const user = await requireUser();
  const n = z.number().min(0).max(5000).nullable().optional();
  const p = z.object({ name: z.string().trim().min(1).max(80), kcal: z.number().min(0).max(10000), protein: n, carbs: n, fat: n, date, meal }).safeParse(input);
  if (!p.success) return { error: "invalid" };
  await addEntry(user.id, { date: p.data.date, meal: p.data.meal, amount: 100, quick: { name: p.data.name, kcal: p.data.kcal, protein: p.data.protein, carbs: p.data.carbs, fat: p.data.fat } });
  done();
  return {};
}

export async function editEntry(id: string, patch: { amount?: number; meal?: string | null }) {
  const user = await requireUser();
  const p = z.object({ amount: amount.optional(), meal: meal.optional() }).safeParse(patch);
  if (!p.success) return;
  await updateEntry(user.id, id, p.data);
  done();
}

export async function removeEntry(id: string) {
  const user = await requireUser();
  await deleteEntry(user.id, id);
  done();
}

/** Undo uses the server-side copy kept by deleteEntry, never data sent by the browser. */
export async function undoRemove(id: string) {
  const user = await requireUser();
  await undoDelete(user.id, id);
  done();
}

export async function copyFromYesterday(day: string) {
  const user = await requireUser();
  if (!isIsoDate(day)) return { n: 0 };
  const n = await copyDay(user.id, shiftDate(day, -1), day);
  done();
  return { n };
}

export async function markDay(day: string, complete: boolean | null) {
  const user = await requireUser();
  if (!isIsoDate(day)) return;
  await setDayComplete(user.id, day, complete);
  done();
}

export async function removeOwnProduct(productId: string) {
  const user = await requireUser();
  if (typeof productId !== "string" || productId.length > 64) return;
  await deleteOwnProduct(user.id, productId);
  done();
}

export async function toggleFavorite(productId: string, on: boolean) {
  const user = await requireUser();
  await setFavorite(user.id, productId, on);
  done();
}

const nutrientInput = z.object(Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, z.union([z.number(), z.string(), z.null()]).optional()])) as Record<(typeof NUTRIENT_KEYS)[number], z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodString, z.ZodNull]>>>);

export async function saveFood(input: unknown): Promise<{ id?: string; error?: string }> {
  const user = await requireUser();
  const p = z
    .object({
      id: z.string().max(64).optional(),
      name: z.string().trim().min(1).max(100),
      brand: z.string().trim().max(60).nullable(),
      barcode: z.string().max(20).nullable(),
      basis: z.enum(["g", "ml"]),
      state: z.enum(["raw", "cooked"]).nullable(),
      nutrients: nutrientInput,
      servings: z.array(z.object({ label: z.string().trim().min(1).max(40), amount })).max(5),
    })
    .safeParse(input);
  if (!p.success) return { error: "invalid" };
  const nutrients = sanitize(p.data.nutrients);
  if (nutrients.kcal === null) return { error: "kcal_required" };
  const barcode = p.data.barcode ? normalizeBarcode(p.data.barcode) : null;
  const id = await saveCustomProduct(user.id, { ...p.data, barcode, nutrients });
  done();
  return { id };
}

export async function productFor(id: string) {
  const user = await requireUser();
  return await getProduct(user.id, id);
}

const ingredient = z.object({ productId: z.string().max(64).nullable(), name: z.string().max(120), grams: amount });

/** Recipes snapshot each ingredient's nutrients at save time (looked up on the server, not taken from the client). */
export async function saveRecipeAction(input: unknown): Promise<{ id?: string; error?: string }> {
  const user = await requireUser();
  const p = z
    .object({
      id: z.string().max(64).optional(),
      name: z.string().trim().min(1).max(80),
      ingredients: z.array(ingredient).min(1).max(60),
      cookedYieldG: z.number().positive().max(50000).nullable(),
      servings: z.number().positive().max(100),
      isMeal: z.boolean(),
    })
    .safeParse(input);
  if (!p.success) return { error: "invalid" };
  const ingredients: Recipe["ingredients"] = [];
  const existing = p.data.id ? await getRecipe(user.id, p.data.id) : null;
  for (const i of p.data.ingredients) {
    const prod = i.productId ? await getProduct(user.id, i.productId) : null;
    if (prod) {
      ingredients.push({ productId: prod.id, name: prod.name, grams: i.grams, nutrients: prod.nutrients });
      continue;
    }
    // Ingredients without a product (e.g. a meal saved from the diary) keep their stored snapshot.
    const kept = existing?.ingredients.find((x) => x.productId === null && x.name === i.name);
    if (!kept) return { error: "not_found" };
    ingredients.push({ ...kept, grams: i.grams });
  }
  const id = await saveRecipe(user.id, { ...p.data, ingredients });
  revalidatePath("/nutrition", "layout");
  return { id };
}

/** "Save as meal" from diary entries: uses each entry's own snapshot so the meal matches what was logged. */
export async function saveMealFromEntries(day: string, entryIds: string[], name: string) {
  const user = await requireUser();
  if (!isIsoDate(day) || !name.trim()) return { error: "invalid" };
  const entries = (await diaryDay(user.id, day)).entries.filter((e) => entryIds.includes(e.id) && e.basis !== "portion");
  if (!entries.length) return { error: "invalid" };
  const ingredients = entries.map((e) => ({ productId: e.productId, name: e.name, grams: e.amount, nutrients: e.nutrients as Nutrients }));
  const id = await saveRecipe(user.id, { name: name.trim().slice(0, 80), ingredients, cookedYieldG: null, servings: 1, isMeal: true });
  revalidatePath("/nutrition", "layout");
  return { id };
}

export async function removeRecipe(id: string) {
  const user = await requireUser();
  await deleteRecipe(user.id, id);
  revalidatePath("/nutrition", "layout");
}

export async function saveTarget(input: { kcal: number | null; protein: number | null; goal: string | null; source: "manual" | "estimate" | "suggestion" }) {
  const user = await requireUser();
  const p = z
    .object({
      kcal: z.number().min(800).max(8000).nullable(),
      protein: z.number().min(0).max(500).nullable(),
      goal: z.enum(["maintain", "lose", "gain", "recomp"]).nullable(),
      source: z.enum(["manual", "estimate", "suggestion"]),
    })
    .safeParse(input);
  if (!p.success) return { error: "invalid" };
  await setTarget(user.id, p.data);
  revalidatePath("/", "layout");
  return {};
}

/**
 * Weekly check-in: "was last week's diary complete?". The answer marks those days complete or
 * incomplete (incomplete days are left out of the estimate), then returns the fresh estimate.
 */
export async function answerWeek(weekStart: string, complete: boolean) {
  const user = await requireUser();
  if (!isIsoDate(weekStart)) return { error: "invalid" };
  const days = (await intakeHistory(user.id, weekStart)).filter((d) => d.date <= shiftDate(weekStart, 6) && d.kcal > 0);
  for (const d of days) await setDayComplete(user.id, d.date, complete);
  // No revalidation here: the card stays to show the result and refreshes the page when dismissed.
  if (!complete) return {};
  const { adaptive, suggestion } = await energyEstimate(user.id);
  return { adaptive, suggestion };
}

/** "Use the average of these results": creates a private "(≈ average of N)" product and returns it. */
export async function averageProduct(raw: unknown): Promise<{ product?: Product; error?: string }> {
  const user = await requireUser();
  const p = z.object({ ids: z.array(z.string().min(1).max(64)).min(2).max(10), name: z.string().trim().min(1).max(60) }).safeParse(raw);
  if (!p.success) return { error: "invalid" };
  const t = translator(user.locale);
  // Named after the search and how many products it is based on, so it is obviously an estimate.
  const r = await saveAverageProduct(user.id, p.data.ids, (n) => t("nutrition.avgName", { name: p.data.name, n }));
  if (!r) return { error: "too_few" };
  done();
  return { product: r.product };
}

/** A recipe or saved meal of this user (to show its ingredients from the diary). */
export async function recipeFor(id: string) {
  const user = await requireUser();
  return typeof id === "string" && id.length <= 64 ? await getRecipe(user.id, id) : null;
}
