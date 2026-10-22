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
import { ProductList } from "../add-food";

type Draft = { id?: string; name: string; ingredients: { productId: string | null; name: string; grams: number | null; nutrients: Product["nutrients"] }[]; cookedYieldG: number | null; servings: number | null; isMeal: boolean };

export function Recipes({ recipes }: { recipes: Recipe[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Product[] | null>(null);
  const [remote, setRemote] = useState<Product[] | null>(null);
  const [remoteState, setRemoteState] = useState<"idle" | "loading" | "error">("idle");
  const [pending, start] = useTransition();

  // Same search as adding food: own + basic foods as you type; Open Food Facts on request or when little is found.
  useEffect(() => {
    setFound(null);
    setRemote(null);
    setRemoteState("idle");
    if (q.trim().length < 2) return;
    let live = true;
    const h = setTimeout(async () => {
      const r = await fetch(`/api/food/search?q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => ({ products: [] }));
      if (!live) return;
      setFound(r.products ?? []);
      if (q.trim().length >= 3) searchOff(r.products ?? [], () => live);
    }, 450);
    return () => { live = false; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const searchOff = async (have: Product[], live = () => true) => {
    setRemoteState("loading");
    const r = await fetch(`/api/food/search?q=${encodeURIComponent(q)}&remote=1`).then((x) => x.json()).catch(() => ({ error: "x" }));
    if (!live()) return;
    if (r.error) return setRemoteState("error");
    setRemoteState("idle");
    setRemote((r.products ?? []).filter((p: Product) => !have.some((x) => x.id === p.id)));
  };
  const addIngredient = (p: Product) => {
    if (!draft) return;
    setDraft({ ...draft, ingredients: [...draft.ingredients, { productId: p.id, name: p.name, grams: p.servings[0]?.amount ?? 100, nutrients: p.nutrients }] });
    setQ("");
  };

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
              {q.trim().length >= 2 && (
                // Always says what happened: searching, found (tap to add), or nothing found.
                <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-border px-3">
                  {(() => {
                    const all = [...(found ?? []), ...(remote ?? [])];
                    if (found === null) return <p className="py-3 text-sm text-muted">{t("common.loading")}</p>;
                    if (!all.length) return <p className="py-3 text-sm text-muted">{remoteState === "loading" ? t("nutrition.searchingRemote") : remoteState === "error" ? t("nutrition.unavailable") : t("nutrition.nothingFound")}</p>;
                    return (
                      <>
                        <ProductList items={all} onPick={addIngredient} />
                        {remoteState === "loading" && <p className="py-2 text-center text-xs text-muted">{t("nutrition.searchingRemote")}</p>}
                      </>
                    );
                  })()}
                </div>
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
