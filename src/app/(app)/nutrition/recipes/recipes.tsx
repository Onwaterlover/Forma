"use client";
import { Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { productFor, removeRecipe, saveRecipeAction } from "@/app/actions/nutrition";
import { DecimalInput, Sheet, Switch, useToast } from "@/components/client";
import { Badge, Button, Card, Empty, Field, Input } from "@/components/ui";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/client";
import type { Product, Recipe } from "@/lib/data";
import { recipe as calc } from "@/nutrition/calc";
import { AmountInput, ProductList, servingsWithSlice } from "../add-food";

type Draft = { id?: string; name: string; ingredients: { productId: string | null; name: string; grams: number | null; nutrients: Product["nutrients"] }[]; cookedYieldG: number | null; servings: number | null; isMeal: boolean };

/** `openId`: opened straight away (from the diary: a logged meal's ingredients, or "Add ingredient" after saving a meal). */
export function Recipes({ recipes, openId }: { recipes: Recipe[]; openId?: string | null }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const toDraft = (r: Recipe): Draft => ({ id: r.id, name: r.name, ingredients: r.ingredients.map((i) => ({ ...i })), cookedYieldG: r.cookedYieldG, servings: r.servings, isMeal: r.isMeal });
  const [draft, setDraft] = useState<Draft | null>(() => { const r = openId ? recipes.find((x) => x.id === openId) : undefined; return r ? toDraft(r) : null; });
  // The ingredient whose amount is being changed (same wheel / pieces / quick amounts as when adding food).
  const [editIdx, setEditIdx] = useState<number | null>(null);
  // Servings are loaded for one ingredient at a time and tagged with it; the amount editor appears once they are
  // in, so it opens in the right unit instead of switching from grams to pieces.
  const [editServings, setEditServings] = useState<{ idx: number; list: { label: string; amount: number }[] } | null>(null);
  const loadServings = (k: number, pid: string | null) => {
    if (!pid) return setEditServings({ idx: k, list: [] });
    setEditServings(null);
    productFor(pid).then((pr) => setEditServings({ idx: k, list: pr ? servingsWithSlice(pr, t("nutrition.slice"), t("nutrition.piece")) : [] })).catch(() => setEditServings({ idx: k, list: [] }));
  };
  const editIngredient = (k: number) => {
    setEditIdx(editIdx === k ? null : k);
    if (editIdx !== k) loadServings(k, draft?.ingredients[k]?.productId ?? null);
  };
  // The ingredient search opens with the "Add ingredient" button (and on its own for an empty recipe).
  const [searching, setSearching] = useState(false);
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
    setDraft({ ...draft, ingredients: [...draft.ingredients, { productId: p.id, name: p.name, grams: 100, nutrients: p.nutrients }] });
    setQ("");
    setSearching(false);
    // Open the new ingredient's amount right away (starts at 100 g).
    setEditIdx(draft.ingredients.length);
    loadServings(draft.ingredients.length, p.id);
  };

  const preview = draft ? calc(draft.ingredients.map((i) => ({ ...i, grams: i.grams ?? 0 })), { cookedYieldG: draft.cookedYieldG, servings: draft.servings ?? 1 }) : null;

  return (
    <div className="space-y-3">
      <Button onClick={() => { setEditIdx(null); setSearching(false); setQ(""); setDraft({ name: "", ingredients: [], cookedYieldG: null, servings: 1, isMeal: false }); }}><Plus size={18} aria-hidden />{t("nutrition.newRecipe")}</Button>
      {recipes.length === 0 ? <Empty>{t("nutrition.noResults")}</Empty> : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-border">
            {recipes.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-4 py-3">
                <button type="button" className="min-w-0 flex-1 text-left"
                  onClick={() => { setEditIdx(null); setSearching(false); setQ(""); setDraft(toDraft(r)); }}>
                  <span className="block font-medium">{r.name} {r.isMeal && <Badge>{t("nutrition.meals")}</Badge>}</span>
                  <span className="block text-xs text-muted">{r.ingredients.length} · {fmt(locale, r.calc.total.kcal)} kcal {t("nutrition.total").toLowerCase()} · {fmt(locale, r.calc.perServing.kcal)} kcal {t("nutrition.perServing")}</span>
                </button>
                <Button variant="ghost" size="sm" aria-label={t("common.delete")} disabled={pending} onClick={() => start(async () => { await removeRecipe(r.id); router.refresh(); })}><Trash2 size={16} /></Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Sheet open={!!draft} onClose={() => { setDraft(null); setEditIdx(null); setSearching(false); setQ(""); }} title={draft?.id ? draft.name : t("nutrition.newRecipe")} wide full>
        {draft && (
          <div className="space-y-4">
            <Field label={t("nutrition.name")} htmlFor="r-name"><Input id="r-name" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <div>
              <p className="mb-2 text-sm font-medium">{t("nutrition.ingredients")}</p>
              <ul className="space-y-2">
                {draft.ingredients.map((i, k) => (
                  <li key={k} className="rounded-xl border border-border">
                    <div className="flex items-center gap-2 px-3">
                      <button type="button" className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2.5 text-left" onClick={() => editIngredient(k)} aria-expanded={editIdx === k}>
                        <span className="min-w-0 truncate text-sm">{i.name}</span>
                        <span className="shrink-0 text-sm font-medium tabular-nums">{i.grams ? fmt(locale, i.grams) : "—"} g</span>
                      </button>
                      <Button variant="ghost" size="sm" aria-label={t("common.delete")} onClick={() => { setEditIdx(null); setDraft({ ...draft, ingredients: draft.ingredients.filter((_, j) => j !== k) }); }}><Trash2 size={15} /></Button>
                    </div>
                    {editIdx === k && (
                      <div className="min-h-[200px] space-y-3 border-t border-border px-3 py-3">
                        {editServings?.idx === k && (
                          <>
                            <AmountInput key={k} amount={i.grams} basis="g" servings={editServings.list}
                              onChange={(v) => setDraft((d) => d && { ...d, ingredients: d.ingredients.map((x, j) => (j === k ? { ...x, grams: v } : x)) })} />
                            <Button full variant="secondary" disabled={!i.grams} onClick={() => setEditIdx(null)}><Check size={18} aria-hidden />{t("common.done")}</Button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {searching || draft.ingredients.length === 0 ? (
                <div className="mt-3 flex gap-2">
                  {/* With the keyboard up the search moves to the top of the sheet, so the results show above it. */}
                  <Input type="search" autoFocus={searching} placeholder={t("nutrition.searchIngredient")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("nutrition.addIngredient")}
                    onFocus={(e) => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 300); }} />
                  {draft.ingredients.length > 0 && <Button variant="ghost" onClick={() => { setSearching(false); setQ(""); }}>{t("common.cancel")}</Button>}
                </div>
              ) : (
                <Button variant="secondary" full className="mt-3" onClick={() => { setEditIdx(null); setSearching(true); }}><Plus size={18} aria-hidden />{t("nutrition.addIngredient")}</Button>
              )}
              {(searching || draft.ingredients.length === 0) && q.trim().length >= 2 && (
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
