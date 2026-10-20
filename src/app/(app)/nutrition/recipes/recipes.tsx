"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { removeRecipe, saveRecipeAction } from "@/app/actions/nutrition";
import { DecimalInput, Sheet, Switch, useToast } from "@/components/client";
import { Badge, Button, Card, Empty, Field, Input } from "@/components/ui";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/client";
import type { Product, Recipe } from "@/lib/data";
import { recipe as calc } from "@/nutrition/calc";

type Draft = { id?: string; name: string; ingredients: { productId: string | null; name: string; grams: number | null; nutrients: Product["nutrients"] }[]; cookedYieldG: number | null; servings: number | null; isMeal: boolean };

export function Recipes({ recipes }: { recipes: Recipe[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Product[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const h = setTimeout(() => fetch(`/api/food/search?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((r) => setFound(r.products ?? [])).catch(() => {}), 250);
    return () => clearTimeout(h);
  }, [q]);

  const preview = draft ? calc(draft.ingredients.map((i) => ({ ...i, grams: i.grams ?? 0 })), { cookedYieldG: draft.cookedYieldG, servings: draft.servings ?? 1 }) : null;

  return (
    <div className="space-y-3">
      <Button onClick={() => setDraft({ name: "", ingredients: [], cookedYieldG: null, servings: 1, isMeal: false })}><Plus size={18} aria-hidden />{t("nutrition.newRecipe")}</Button>
      {recipes.length === 0 ? <Empty>{t("nutrition.noResults")}</Empty> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-border">
            {recipes.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-4 py-3">
                <button type="button" className="min-w-0 flex-1 text-left"
                  onClick={() => setDraft({ id: r.id, name: r.name, ingredients: r.ingredients.map((i) => ({ ...i })), cookedYieldG: r.cookedYieldG, servings: r.servings, isMeal: r.isMeal })}>
                  <span className="block font-medium">{r.name} {r.isMeal && <Badge>{t("nutrition.meals")}</Badge>}</span>
                  <span className="block text-xs text-muted">{r.ingredients.length} · {fmt(locale, r.calc.total.kcal)} kcal {t("nutrition.total").toLowerCase()} · {fmt(locale, r.calc.perServing.kcal)} kcal {t("nutrition.perServing")}</span>
                </button>
                <Button variant="ghost" size="sm" aria-label={t("common.delete")} disabled={pending} onClick={() => start(async () => { await removeRecipe(r.id); router.refresh(); })}><Trash2 size={16} /></Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Sheet open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? draft.name : t("nutrition.newRecipe")} wide>
        {draft && (
          <div className="space-y-4">
            <Field label={t("nutrition.name")} htmlFor="r-name"><Input id="r-name" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <div>
              <p className="mb-2 text-sm font-medium">{t("nutrition.ingredients")}</p>
              <ul className="space-y-2">
                {draft.ingredients.map((i, k) => (
                  <li key={k} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{i.name}</span>
                    <div className="w-24"><DecimalInput aria-label={`${i.name} g`} value={i.grams} onChange={(v) => setDraft({ ...draft, ingredients: draft.ingredients.map((x, j) => (j === k ? { ...x, grams: v } : x)) })} className="h-10" /></div>
                    <span className="text-sm text-muted">g</span>
                    <Button variant="ghost" size="sm" aria-label={t("common.delete")} onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, j) => j !== k) })}><Trash2 size={15} /></Button>
                  </li>
                ))}
              </ul>
              <Input className="mt-3" type="search" placeholder={t("nutrition.addIngredient")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("nutrition.addIngredient")} />
              {found.length > 0 && (
                <ul className="mt-2 max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                  {found.map((p) => (
                    <li key={p.id}>
                      <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                        onClick={() => { setDraft({ ...draft, ingredients: [...draft.ingredients, { productId: p.id, name: p.name, grams: 100, nutrients: p.nutrients }] }); setQ(""); }}>
                        {p.name} {p.state && <span className="text-muted">({t(`nutrition.state.${p.state}`)})</span>} <span className="text-muted">· {fmt(locale, p.nutrients.kcal)} kcal/100</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("nutrition.cookedYield")} htmlFor="r-yield" hint={t("nutrition.cookedYieldHint")}><DecimalInput id="r-yield" value={draft.cookedYieldG} onChange={(v) => setDraft({ ...draft, cookedYieldG: v })} /></Field>
              <Field label={t("nutrition.servings")} htmlFor="r-serv"><DecimalInput id="r-serv" value={draft.servings} onChange={(v) => setDraft({ ...draft, servings: v })} /></Field>
            </div>
            <Switch checked={draft.isMeal} onChange={(isMeal) => setDraft({ ...draft, isMeal })} label={t("nutrition.saveMeal")} />
            {preview && draft.ingredients.length > 0 && (
              <p className="text-sm text-muted">
                {t("nutrition.total")}: {fmt(locale, preview.total.kcal)} kcal · {fmt(locale, preview.perServing.kcal)} kcal {t("nutrition.perServing")} · {fmt(locale, preview.per100.kcal)} kcal / 100 g
                {preview.total.incomplete?.length ? ` · * ${t("nutrition.incompleteValue")}` : ""}
              </p>
            )}
            <Button full disabled={pending || !draft.name.trim() || draft.ingredients.length === 0 || draft.ingredients.some((i) => !i.grams)}
              onClick={() => start(async () => {
                const r = await saveRecipeAction({ id: draft.id, name: draft.name, ingredients: draft.ingredients.map((i) => ({ productId: i.productId, name: i.name, grams: i.grams! })), cookedYieldG: draft.cookedYieldG, servings: draft.servings ?? 1, isMeal: draft.isMeal });
                toast({ text: r.error ? t("common.error") : t("common.saved") });
                if (!r.error) { setDraft(null); router.refresh(); }
              })}>{t("common.save")}</Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
