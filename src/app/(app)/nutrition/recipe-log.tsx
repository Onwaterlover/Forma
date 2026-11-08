"use client";
import { Plus, Repeat, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addRecipeEntry, recipeFor, saveRecipeAction } from "@/app/actions/nutrition";
import { DecimalInput, Switch, useToast } from "@/components/client";
import { Button, cx, Field, Input } from "@/components/ui";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/client";
import type { Product, Recipe } from "@/lib/data";
import { recipe as calc } from "@/nutrition/calc";
import { SearchResults } from "./food-search";

type Item = { productId: string | null; name: string; grams: number | null; nutrients: Product["nutrients"] };

/**
 * Logging a recipe or saved meal: how much (servings or grams), and its ingredients, which can be changed for this
 * entry only (blueberries instead of mango today) or, with the switch, in the recipe too.
 */
export function RecipeLog({ recipeId, date, meal: startMeal, amount: startAmount, mode: startMode, onDone, onSaved }: {
  /** null: a new recipe, written here first and then ready to add. */
  recipeId: string | null;
  date: string;
  meal: string | null;
  /** Last logged amount, if any (e.g. from "Recent meals"). */
  amount?: number;
  mode?: "servings" | "grams";
  onDone: () => void;
  /** After saving the recipe here (e.g. to show its new name as the title). */
  onSaved?: (name: string) => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [r, setR] = useState<Recipe | null | undefined>(undefined);
  const [items, setItems] = useState<Item[]>([]);
  const [mode, setMode] = useState<"servings" | "grams">(startMode ?? "servings");
  const [amount, setAmount] = useState<number | null>(startAmount ?? 1);
  // The meal is decided by the caller (the section's "+", or the time of day); no picker here.
  const meal = startMeal;
  const [saveToRecipe, setSaveToRecipe] = useState(false);
  // Index of the ingredient being replaced, "new" while adding one, null when the search is closed.
  const [swap, setSwap] = useState<number | "new" | null>(null);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  // "Edit recipe" right here (name, servings, cooked weight, ingredients), without leaving the diary.
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ name: string; servings: number | null; yieldG: number | null }>({ name: "", servings: 1, yieldG: null });

  const load = (x: Recipe | null) => {
    setR(x);
    if (!x) return;
    setItems(x.ingredients.map((i) => ({ ...i })));
    setForm({ name: x.name, servings: x.servings, yieldG: x.cookedYieldG });
  };
  useEffect(() => {
    if (recipeId === null) {
      load({ id: "", name: "", ingredients: [], cookedYieldG: null, servings: 1, isMeal: false, calc: calc([]) });
      setEditing(true);
      setSwap("new");
      return;
    }
    let live = true;
    recipeFor(recipeId).then((x) => live && load(x)).catch(() => live && setR(null));
    return () => { live = false; };
  }, [recipeId]);

  if (r === undefined) return <p className="py-6 text-center text-sm text-muted">{t("common.loading")}</p>;
  if (r === null) return <p className="py-6 text-center text-sm text-muted">{t("common.error")}</p>;

  const ready = items.length > 0 && items.every((i) => i.grams && i.grams > 0);
  const changed = items.length !== r.ingredients.length || items.some((i, k) => i.productId !== r.ingredients[k]!.productId || i.name !== r.ingredients[k]!.name || i.grams !== r.ingredients[k]!.grams);
  const rawNow = items.reduce((a, i) => a + (i.grams ?? 0), 0);
  // The weight after cooking follows the ingredients, like on the server.
  const yieldNow = editing ? form.yieldG : r.cookedYieldG && r.calc.rawWeight > 0 ? Math.round(r.cookedYieldG * (rawNow / r.calc.rawWeight)) : null;
  const c = calc(items.map((i) => ({ ...i, grams: i.grams ?? 0 })), { cookedYieldG: yieldNow, servings: editing ? form.servings ?? 1 : r.servings });
  const grams = amount && amount > 0 ? (mode === "servings" ? (c.finalWeight / r.servings) * amount : amount) : 0;
  const kcal = c.per100.kcal === null ? null : (c.per100.kcal * grams) / 100;

  const pick = (p: Product) => {
    const k = swap;
    setItems((xs) => k === "new" ? [...xs, { productId: p.id, name: p.name, grams: 100, nutrients: p.nutrients }]
      : xs.map((x, j) => (j === k ? { productId: p.id, name: p.name, grams: x.grams, nutrients: p.nutrients } : x)));
    setSwap(null);
    setQ("");
  };
  const searchBox = (
    <div className="mt-2">
      <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("nutrition.searchIngredient")} aria-label={t("nutrition.searchIngredient")} />
      <SearchResults q={q} onPick={pick} />
    </div>
  );

  const saveRecipe = () => start(async () => {
    const res = await saveRecipeAction({
      id: r.id || undefined, name: form.name, cookedYieldG: form.yieldG, servings: form.servings ?? 1, isMeal: r.isMeal,
      ingredients: items.map((i) => ({ productId: i.productId, name: i.name, grams: i.grams! })),
    });
    toast({ text: res.error ? t("common.error") : t("common.saved") });
    if (res.error) return;
    load(await recipeFor(res.id ?? r.id));
    onSaved?.(form.name.trim());
    setEditing(false);
    router.refresh();
  });

  return (
    <div className="space-y-4">
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("nutrition.name")} htmlFor="rl-name"><Input id="rl-name" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t("nutrition.servings")} htmlFor="rl-serv"><DecimalInput id="rl-serv" value={form.servings} onChange={(v) => setForm({ ...form, servings: v })} /></Field>
          <Field label={t("nutrition.cookedYield")} htmlFor="rl-yield"><DecimalInput id="rl-yield" value={form.yieldG} onChange={(v) => setForm({ ...form, yieldG: v })} /></Field>
        </div>
      ) : null}

      {!editing && <>
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-sm" role="group" aria-label={t("nutrition.unit")}>
          {(["servings", "grams"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m}
              onClick={() => { if (m !== mode) { setMode(m); setAmount(m === "servings" ? 1 : Math.round(c.finalWeight / r.servings)); } }}
              className={cx("min-h-9 rounded-md px-3", mode === m ? "bg-surface font-medium shadow-sm" : "text-muted")}>
              {t(m === "servings" ? "nutrition.logServings" : "nutrition.logGrams")}
            </button>
          ))}
        </div>
        <div className="relative w-24">
          <DecimalInput aria-label={t(mode === "servings" ? "nutrition.logServings" : "nutrition.logGrams")} value={amount} onChange={setAmount} className={cx("h-10", mode === "grams" && "pr-6")} />
          {mode === "grams" && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted">g</span>}
        </div>
      </div>
      <p className="text-sm">
        <span className="font-semibold tabular-nums">{fmt(locale, grams)} g · {fmt(locale, kcal)} kcal</span>
        <span className="text-muted"> · {t("nutrition.wholeDish", { g: fmt(locale, c.finalWeight), kcal: fmt(locale, c.total.kcal) })}</span>
      </p>
      </>}

      <section>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">{t("nutrition.ingredients")}</p>
          {!editing && <button type="button" onClick={() => { setSaveToRecipe(false); setEditing(true); }} className="text-sm font-medium text-accent">{t("nutrition.editRecipe")}</button>}
        </div>
        <ul className="divide-y divide-border">
          {items.map((i, k) => (
            <li key={k} className="py-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">{i.name}</span>
                <div className="relative w-20 shrink-0">
                  <DecimalInput aria-label={`${i.name} (g)`} value={i.grams} onChange={(v) => setItems((xs) => xs.map((x, j) => (j === k ? { ...x, grams: v } : x)))} className="h-9 pr-6" />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted">g</span>
                </div>
                <button type="button" aria-label={`${t("nutrition.swapIngredient")}: ${i.name}`} onClick={() => { setQ(""); setSwap(swap === k ? null : k); }}
                  className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-surface-2", swap === k ? "text-accent" : "text-muted")}><Repeat size={16} aria-hidden /></button>
                <button type="button" aria-label={`${t("common.delete")}: ${i.name}`} disabled={items.length <= 1}
                  onClick={() => { setSwap(null); setItems((xs) => xs.filter((_, j) => j !== k)); }}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"><X size={16} aria-hidden /></button>
              </div>
              {swap === k && searchBox}
            </li>
          ))}
        </ul>
        {swap === "new" ? searchBox : (
          <Button variant="ghost" size="sm" className="mt-1" onClick={() => { setQ(""); setSwap("new"); }}><Plus size={16} aria-hidden />{t("nutrition.addIngredient")}</Button>
        )}
      </section>

      {editing && (
        <p className="text-sm text-muted">{t("nutrition.total")}: {fmt(locale, c.total.kcal)} kcal · {fmt(locale, c.perServing.kcal)} kcal {t("nutrition.perServing")}</p>
      )}
      {editing ? (
        <div className="flex gap-2">
          <Button full disabled={pending || !ready || !form.name.trim() || !(form.servings && form.servings > 0)} onClick={saveRecipe}>{t("common.save")}</Button>
          {r.id && <Button variant="ghost" disabled={pending} onClick={() => { load(r); setSwap(null); setEditing(false); }}>{t("common.cancel")}</Button>}
        </div>
      ) : <>
      {changed && (
        <div className="space-y-1">
          <Switch checked={saveToRecipe} onChange={setSaveToRecipe} label={t("nutrition.saveToRecipe")} />
          {!saveToRecipe && <p className="text-xs text-muted">{t("nutrition.changeTodayOnly")}</p>}
        </div>
      )}

      <Button full disabled={pending || !ready || !(amount && amount > 0)}
        onClick={() => start(async () => {
          const res = await addRecipeEntry({
            recipeId: r.id, amount: amount!, mode, date, meal,
            ...(changed ? { ingredients: items.map((i) => ({ productId: i.productId, name: i.name, grams: i.grams! })), saveToRecipe } : {}),
          });
          toast({ text: res.error ? t("common.error") : `${t("common.saved")}: ${r.name}` });
          if (!res.error) onDone();
        })}>
        {t("common.add")}
      </Button>
      </>}
    </div>
  );
}
