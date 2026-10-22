"use client";
import { ChevronLeft, ChevronRight, Copy, ListPlus, Plus, ScanBarcode, Search, Settings2, Utensils } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { addProductEntry, addRecipeEntry, copyFromYesterday, editEntry, markDay, productFor, recipeFor, removeEntry, saveMealFromEntries, undoRemove } from "@/app/actions/nutrition";
import { Sheet, useToast } from "@/components/client";
import { Button, Card, cx, Empty, Input, Meter, Select } from "@/components/ui";
import { fmt, fmtDate } from "@/i18n";
import { useI18n } from "@/i18n/client";
import type { DiaryEntry, Product, Recipe } from "@/lib/data";
import type { Nutrients, NutrientKey } from "@/nutrition/calc";
import { macroTargets } from "@/nutrition/energy";
import { AddFood, AmountInput, mealNow, servingsWithSlice, type RecipeLite } from "./add-food";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

const shift = (iso: string, d: number) => {
  const x = new Date(`${iso}T12:00:00`);
  x.setDate(x.getDate() + d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

export function Diary({
  date, today, entries, totals, complete, target, recents, recentMeals = [], favorites, recipes, showFiber, macroGoals = null, assistant,
}: {
  date: string;
  today: string;
  entries: DiaryEntry[];
  totals: Nutrients & { missing: Record<NutrientKey, number> };
  complete: boolean | null;
  target: { kcal: number | null; protein: number | null } | null;
  recents: (Product & { lastAmount: number })[];
  recentMeals?: { id: string; name: string; amount: number; mode: "servings" | "grams"; kcal: number | null; isMeal: boolean }[];
  favorites: Product[];
  recipes: RecipeLite[];
  showFiber: boolean;
  /** Set when macro goals are switched on in settings (which ones, colours). */
  macroGoals?: { protein: boolean; carbs: boolean; fat: boolean; fiber: boolean; colors: boolean } | null;
  assistant?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [adding, setAdding] = useState<null | { view: "search" | "scan"; product: (Product & { lastAmount?: number }) | null }>(null);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [editServings, setEditServings] = useState<{ label: string; amount: number }[]>([]);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  useEffect(() => {
    setEditRecipe(null);
    if (!editing?.recipeId) return;
    let live = true;
    recipeFor(editing.recipeId).then((r) => { if (live) setEditRecipe(r); }).catch(() => {});
    return () => { live = false; };
  }, [editing?.id, editing?.recipeId]);
  // Servings of the entry's product (egg, slice…), so it can be edited in pieces too.
  useEffect(() => {
    setEditServings([]);
    if (!editing?.productId) return;
    let live = true;
    productFor(editing.productId).then((p) => { if (live && p) setEditServings(servingsWithSlice(p, t("nutrition.slice"))); }).catch(() => {});
    return () => { live = false; };
  }, [editing?.id, editing?.productId]);
  const [amount, setAmount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [mealName, setMealName] = useState("");
  const [pending, start] = useTransition();

  const kcal = totals.kcal ?? 0;
  const label = date === today ? t("common.today") : date === shift(today, -1) ? t("common.yesterday") : fmtDate(locale, date, { weekday: "long", day: "numeric", month: "long" });
  // Goals: protein from the target; carbs, fat and fibre derived from calories when switched on in settings
  // (each one can be hidden there, as can the colours).
  const derived = macroGoals && target?.kcal ? macroTargets(target.kcal, target.protein) : null;
  const goals: Partial<Record<NutrientKey, number>> = {
    ...(target?.protein && (!macroGoals || macroGoals.protein) ? { protein: target.protein } : {}),
    ...(derived && macroGoals ? Object.fromEntries((["carbs", "fat", "fiber"] as const).filter((k) => macroGoals[k]).map((k) => [k, derived[k]])) : {}),
  };
  const colored = !!macroGoals?.colors;
  // Below 50 % red, from 50 % yellow, from 90 % green.
  const tone = (v: number, goal: number) => (v / goal >= 0.9 ? "text-accent" : v / goal >= 0.5 ? "text-warning" : "text-danger");
  const macro = (k: NutrientKey, name: string) => (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted">{name}</p>
      <p className={cx("text-lg font-semibold tabular-nums", colored && !!goals[k] && tone(totals[k] ?? 0, goals[k]!))}>
        {fmt(locale, totals[k] ?? 0)}<span className="text-sm font-normal text-muted">{goals[k] ? ` / ${fmt(locale, goals[k])}` : ""} g</span>
        {totals.incomplete?.includes(k) && <span className="ml-0.5 text-warning" title={t("nutrition.incompleteValue")}>*</span>}
      </p>
    </div>
  );

  const remove = (e: DiaryEntry) =>
    start(async () => {
      await removeEntry(e.id);
      toast({ text: `${t("common.deleted")}: ${e.name}`, action: { label: t("common.undo"), run: () => start(() => undoRemove(e.id)) } });
    });

  const groups = [...MEALS, null].map((m) => ({ meal: m, items: entries.filter((e) => e.meal === m) })).filter((g) => g.items.length > 0);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={`/nutrition?date=${shift(date, -1)}`} className="grid h-11 w-11 place-items-center rounded-xl hover:bg-surface-2" aria-label="←"><ChevronLeft size={20} /></Link>
        <h1 className="text-center text-xl font-semibold capitalize tracking-tight">{label}</h1>
        <Link href={`/nutrition?date=${shift(date, 1)}`} className={cx("grid h-11 w-11 place-items-center rounded-xl hover:bg-surface-2", date >= today && "pointer-events-none opacity-30")} aria-label="→"><ChevronRight size={20} /></Link>
      </div>

      <Card className="mb-4">
        <div className="flex items-end justify-between gap-3">
          <p className="text-4xl font-semibold tabular-nums tracking-tight">
            {fmt(locale, kcal)}
            {totals.incomplete?.includes("kcal") && <span className="text-warning" title={t("nutrition.incompleteValue")}>*</span>}
            <span className="ml-1 text-base font-normal text-muted">{target?.kcal ? `/ ${fmt(locale, target.kcal)} ` : ""}{t("common.kcal")}</span>
          </p>
          <Link href="/nutrition/targets" className="text-sm font-medium text-accent">{target?.kcal ? t("nutrition.target") : t("nutrition.setTarget")}</Link>
        </div>
        {target?.kcal ? (
          <div className="mt-3 space-y-1">
            <Meter value={kcal} max={target.kcal} label={t("nutrition.target")} />
            <p className="text-sm text-muted">{kcal <= target.kcal ? t("nutrition.remaining", { n: fmt(locale, target.kcal - kcal) }) : t("nutrition.over", { n: fmt(locale, kcal - target.kcal) })}</p>
          </div>
        ) : null}
        <div className={cx("mt-4 grid gap-3", showFiber ? "grid-cols-4" : "grid-cols-3")}>
          {macro("protein", t("nutrition.protein"))}
          {macro("carbs", t("nutrition.carbs"))}
          {macro("fat", t("nutrition.fat"))}
          {showFiber && macro("fiber", t("nutrition.fiber"))}
        </div>
      </Card>

      {/* Four ways to log, one tap each: search, barcode, photo, describe (the last two only with AI). */}
      <div className={cx("mb-2 grid gap-2", assistant ? "grid-cols-4" : "grid-cols-2")}>
        <Button size="tile" onClick={() => setAdding({ view: "search", product: null })}><Search size={20} aria-hidden />{t("nutrition.searchShort")}</Button>
        <Button size="tile" variant="secondary" onClick={() => setAdding({ view: "scan", product: null })}><ScanBarcode size={20} aria-hidden />{t("nutrition.scan")}</Button>
        {assistant}
      </div>
      <div className="mb-4 flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { const r = await copyFromYesterday(date); toast({ text: r.n ? t("nutrition.copied", { n: r.n }) : t("nutrition.noEntriesYesterday") }); })}>
          <Copy size={16} aria-hidden />{t("nutrition.copyYesterday")}
        </Button>
        {entries.length > 1 && <Button variant="ghost" size="sm" onClick={() => { setSelected(entries.filter((e) => e.basis !== "portion").map((e) => e.id)); setSaving(true); }}><ListPlus size={16} aria-hidden />{t("nutrition.saveMeal")}</Button>}
        <Link href="/nutrition/recipes" className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium hover:bg-surface-2"><Utensils size={16} aria-hidden />{t("nutrition.recipes")}</Link>
      </div>

      {entries.length === 0 ? (
        <Empty>{t("nutrition.empty")}<br /><span className="text-xs">{t("nutrition.help")}</span></Empty>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <Card key={g.meal ?? "none"} className="p-0 sm:p-0">
              {(groups.length > 1 || g.meal) && <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">{g.meal ? t(`nutrition.meal.${g.meal}`) : t("nutrition.noMeal")}</p>}
              <ul className="divide-y divide-border">
                {g.items.map((e) => (
                  <li key={e.id}>
                    <button type="button" onClick={() => { setEditing(e); setAmount(e.amount); }} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{e.name}</span>
                        <span className="block text-xs text-muted tabular-nums">
                          {e.basis === "portion" ? t("nutrition.portion") : `${fmt(locale, e.amount, 1)} ${e.basis}`}
                          {" · "}{t("nutrition.protein").slice(0, 1)} {fmt(locale, e.values.protein, 1)} · {t("nutrition.carbs").slice(0, 1)} {fmt(locale, e.values.carbs, 1)} · {t("nutrition.fat").slice(0, 1)} {fmt(locale, e.values.fat, 1)}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">{e.values.kcal === null ? t("nutrition.missing") : <>{fmt(locale, e.values.kcal)}<span className="ml-0.5 text-xs font-normal text-muted">kcal</span></>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {/* Only for values shown above (sugar, salt etc. are not shown; fibre only when switched on). */}
          {totals.incomplete?.some((k) => ["kcal", "protein", "carbs", "fat"].includes(k) || (k === "fiber" && showFiber)) ? <p className="text-xs text-muted">* {t("nutrition.incompleteValue")}</p> : null}
        </div>
      )}

      {/* Recently logged recipes and saved meals first (one tap logs them again), then products. */}
      {recentMeals.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("nutrition.recentMeals")}</h2>
          <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface px-3">
            {recentMeals.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <Link href={`/nutrition/recipes?open=${m.id}`} className="min-w-0 flex-1 py-2.5">
                  <span className="block truncate text-[15px] font-medium">{m.name}</span>
                  <span className="block text-xs text-muted">{m.mode === "servings" ? `${fmt(locale, m.amount)} × ${t("nutrition.portion")}` : `${fmt(locale, m.amount)} g`}{m.kcal !== null ? ` · ${fmt(locale, m.kcal)} kcal` : ""}</span>
                </Link>
                <button type="button" disabled={pending} aria-label={`${t("common.add")} ${m.name}`}
                  onClick={() => start(async () => {
                    const r = await addRecipeEntry({ recipeId: m.id, amount: m.amount, mode: m.mode, date, meal: date === today ? mealNow() : null });
                    toast({ text: r.error ? t("common.error") : `${t("common.saved")}: ${m.name}` });
                    router.refresh();
                  })}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent hover:bg-accent hover:text-accent-contrast">
                  <Plus size={20} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recents.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("nutrition.recent")}</h2>
          <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface px-3">
            {recents.slice(0, 8).map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <button type="button" onClick={() => setAdding({ view: "search", product: p })} className="min-w-0 flex-1 py-2.5 text-left">
                  <span className="block truncate text-[15px] font-medium">{p.name}</span>
                  <span className="block text-xs text-muted">{fmt(locale, p.lastAmount)} {p.basis}{p.nutrients.kcal !== null ? ` · ${fmt(locale, (p.nutrients.kcal * p.lastAmount) / 100)} kcal` : ""}</span>
                </button>
                <button type="button" disabled={pending} aria-label={`${t("common.add")} ${p.name}`}
                  onClick={() => start(async () => {
                    const r = await addProductEntry({ productId: p.id, amount: p.lastAmount, date, meal: date === today ? mealNow() : null });
                    toast({ text: r.error ? t("common.error") : `${t("common.saved")}: ${p.name}` });
                    router.refresh();
                  })}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent hover:bg-accent hover:text-accent-contrast">
                  <Plus size={20} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entries.length > 0 && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Settings2 size={16} className="text-muted" aria-hidden />
            {[{ v: true, l: t("nutrition.dayComplete") }, { v: false, l: t("nutrition.dayIncomplete") }].map((o) => (
              <button key={String(o.v)} type="button" aria-pressed={complete === o.v} disabled={pending}
                onClick={() => start(() => markDay(date, complete === o.v ? null : o.v))}
                className={cx("min-h-9 rounded-full border px-3", complete === o.v ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2")}>
                {o.l}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{t("nutrition.completeHint")}</p>
        </div>
      )}

      <AddFood open={!!adding} onClose={() => { setAdding(null); router.refresh(); }} date={date} today={today} view={adding?.view ?? "search"} product={adding?.product ?? null} favorites={favorites} recipes={recipes} />

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.name ?? ""}>
        {editing && (
          <div className="space-y-4">
            {editRecipe ? (
              // A logged recipe or saved meal: its ingredients right away (grams of a whole dish make no sense here).
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("nutrition.ingredientsOf")}</p>
                <ul className="divide-y divide-border rounded-xl border border-border px-3 text-sm">
                  {editRecipe.ingredients.map((i, k) => (
                    <li key={k} className="flex justify-between gap-3 py-2"><span className="min-w-0 truncate">{i.name}</span><span className="shrink-0 tabular-nums text-muted">{fmt(locale, i.grams)} g</span></li>
                  ))}
                </ul>
                <Link href={`/nutrition/recipes?open=${editRecipe.id}`} className="inline-flex text-sm font-medium text-accent">{t("nutrition.editRecipe")}</Link>
              </div>
            ) : editing.basis !== "portion" && (
              <div className="space-y-3">
                <AmountInput key={editServings.length} amount={amount} onChange={setAmount} basis={editing.basis} servings={editServings} />
              </div>
            )}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("nutrition.mealLabel")}</span>
              <Select value={editing.meal ?? ""} onChange={(ev) => setEditing({ ...editing, meal: ev.target.value || null })}>
                <option value="">{t("nutrition.noMeal")}</option>
                {MEALS.map((m) => <option key={m} value={m}>{t(`nutrition.meal.${m}`)}</option>)}
              </Select>
            </label>
            <div className="flex gap-2">
              <Button full disabled={pending || (editing.basis !== "portion" && !editRecipe && !amount)} onClick={() => start(async () => { await editEntry(editing.id, { amount: editing.basis === "portion" || editRecipe ? undefined : amount!, meal: editing.meal }); setEditing(null); })}>{t("common.save")}</Button>
              <Button variant="danger" onClick={() => { remove(editing); setEditing(null); }}>{t("common.delete")}</Button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={saving} onClose={() => setSaving(false)} title={t("nutrition.saveMeal")}>
        <div className="space-y-4">
          <Input placeholder={t("nutrition.mealName")} value={mealName} maxLength={80} onChange={(e) => setMealName(e.target.value)} aria-label={t("nutrition.mealName")} />
          <ul className="divide-y divide-border">
            {entries.filter((e) => e.basis !== "portion").map((e) => (
              <li key={e.id}>
                <label className="flex min-h-12 items-center gap-3">
                  <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={selected.includes(e.id)} onChange={(ev) => setSelected(ev.target.checked ? [...selected, e.id] : selected.filter((x) => x !== e.id))} />
                  <span className="flex-1 truncate">{e.name}</span>
                  <span className="text-sm text-muted tabular-nums">{fmt(locale, e.amount)} {e.basis}</span>
                </label>
              </li>
            ))}
          </ul>
          <Button full disabled={pending || !mealName.trim() || selected.length === 0}
            onClick={() => start(async () => {
              const r = await saveMealFromEntries(date, selected, mealName);
              // Saved: offer to add something that wasn't in the diary (opens the meal in Recipes).
              toast(r.error ? { text: t("common.error") } : { text: t("common.saved"), action: { label: t("nutrition.addIngredientShort"), run: () => router.push(`/nutrition/recipes?open=${r.id}`) } });
              if (!r.error) { setSaving(false); setMealName(""); }
            })}>
            {t("common.save")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
