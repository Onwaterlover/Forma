"use client";
import { ChevronLeft, Flame, PackagePlus, Plus, ScanBarcode, Star, Utensils } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { addProductEntry, addQuickEntry, addRecipeEntry, averageProduct, productFor, saveFood, toggleFavorite } from "@/app/actions/nutrition";
import { DecimalInput, Sheet, useToast } from "@/components/client";
import { Badge, Button, cx, Field, Input, Notice, Select } from "@/components/ui";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/client";
import type { Product } from "@/lib/data";
import { energyMismatch, medianOf, NUTRIENT_KEYS, scale, type NutrientKey } from "@/nutrition/calc";
import { typicalSlice } from "@/nutrition/slices";
import { Scanner } from "./scanner";

export type RecipeLite = { id: string; name: string; isMeal: boolean; servings: number; finalWeight: number; perServingKcal: number | null; totalKcal: number | null };
type View = "search" | "scan" | "meals" | "custom" | "quick";
const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

/** Meal suggested by the time of day when logging for today (the user can change it). */
export function mealNow(): (typeof MEALS)[number] {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  return h < 11 ? "breakfast" : h < 17 ? "lunch" : h < 22 ? "dinner" : "snack";
}

export function AddFood({
  open, onClose, date, today, view: startView, product, favorites, recipes,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  today: string;
  /** Where the sheet opens: the search list or straight into the camera scanner. */
  view: "search" | "scan";
  /** Open directly on the amount screen for this product (e.g. tapped in "Recent"). */
  product: Product | null;
  favorites: Product[];
  recipes: RecipeLite[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [view, setView] = useState<View>(startView);
  const [meal, setMeal] = useState<string | null>(null);
  const [picked, setPicked] = useState<Product | null>(null);
  const [barcodeForNew, setBarcodeForNew] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ name: string; brand: string | null } | null>(null);
  const [scanned, setScanned] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (open) {
      setScanned(false);
      setView(startView);
      setPicked(product);
      setBarcodeForNew(null);
      setMeal(date === today ? mealNow() : null);
    }
  }, [open, startView, product, date, today]);

  const add = (p: Product, amount: number, close = false) =>
    start(async () => {
      const r = await addProductEntry({ productId: p.id, amount, date, meal });
      toast({ text: r.error ? t("common.error") : `${t("common.saved")}: ${p.name}` });
      if (!r.error) {
        setPicked(null);
        if (close) onClose();
      }
    });

  const onCode = useCallback(async (code: string, format?: string) => {
    const res = await fetch(`/api/food/barcode/${code}${format ? `?format=${format}` : ""}`);
    const data = await res.json().catch(() => ({}));
    if (data.product) {
      setPicked(data.product);
      setScanned(true);
      if (data.warnings?.includes("energy_mismatch")) toast({ text: t("nutrition.energyMismatch") });
    } else if (data.error === "not_found") {
      toast({ text: t(data.partial ? "nutrition.noValues" : "nutrition.notFound") });
      setPrefill(data.partial ?? null);
      setBarcodeForNew(data.barcode ?? code);
      setView("custom");
    } else if (data.error === "invalid_barcode") toast({ text: t("nutrition.invalidBarcode") });
    else toast({ text: data.error === "rate_limited" ? t("nutrition.rateLimited") : t("nutrition.unavailable") });
  }, [t, toast]);

  const title = picked ? picked.name : view === "scan" ? t("nutrition.scan") : view === "meals" ? t("nutrition.meals") : view === "custom" ? t("nutrition.custom") : view === "quick" ? t("nutrition.quick") : t("nutrition.add");

  return (
    <Sheet open={open} onClose={onClose} title={title} wide full>
      {picked ? (
        // From "Recent" on the diary page the sheet only exists for this product, so adding closes it.
        <AmountPicker product={picked} pending={pending} onBack={() => (product ? onClose() : setPicked(null))} onAdd={(amount) => add(picked, amount, !!product || scanned)}
          onRescan={scanned ? () => { setPicked(null); setScanned(false); setView("scan"); } : undefined}
          meal={<MealSelect meal={meal} onChange={setMeal} />} />
      ) : (
        <div className="space-y-4">
          {view !== "search" && (
            <button type="button" onClick={() => setView("search")} className="-ml-1 inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ChevronLeft size={16} aria-hidden />{t("nutrition.search")}</button>
          )}
          <MealSelect meal={meal} onChange={setMeal} />

          {view === "search" && (
            <SearchTab onPick={setPicked} onScan={() => setView("scan")}>
              {favorites.length > 0 && (
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("nutrition.favorites")}</p>
                  <ProductList items={favorites.map((p) => ({ ...p, lastAmount: p.servings[0]?.amount ?? 100 }))} onPick={setPicked} onQuick={(p, a) => add(p, a)} pending={pending} />
                </section>
              )}
              <div className="grid grid-cols-3 gap-2">
                {([["meals", Utensils, "nutrition.meals"], ["custom", PackagePlus, "nutrition.custom"], ["quick", Flame, "nutrition.quick"]] as const).map(([v, Icon, label]) => (
                  <Button key={v} variant="secondary" size="tile" onClick={() => setView(v)}><Icon size={18} aria-hidden />{t(label)}</Button>
                ))}
              </div>
            </SearchTab>
          )}
          {view === "scan" && open && <Scanner onCode={onCode} />}
          {view === "meals" && <MealsTab recipes={recipes} pending={pending} onLog={(r, amount, mode) => start(async () => {
            const res = await addRecipeEntry({ recipeId: r.id, amount, mode, date, meal });
            toast({ text: res.error ? t("common.error") : `${t("common.saved")}: ${r.name}` });
            if (!res.error) onClose();
          })} />}
          {view === "custom" && <CustomFood barcode={barcodeForNew} prefill={prefill} onSaved={async (id) => {
            const prod = await productFor(id);
            if (prod) setPicked(prod);
          }} />}
          {view === "quick" && <QuickTab pending={pending} onAdd={(q) => start(async () => {
            const r = await addQuickEntry({ ...q, date, meal });
            toast({ text: r.error ? t("common.error") : t("common.saved") });
          })} />}
          <p className="text-xs text-muted">{t("nutrition.offAttribution")}</p>
        </div>
      )}
    </Sheet>
  );
}

function MealSelect({ meal, onChange }: { meal: string | null; onChange: (m: string | null) => void }) {
  const { t } = useI18n();
  return (
    <Select aria-label={t("nutrition.mealLabel")} value={meal ?? ""} onChange={(e) => onChange(e.target.value || null)} className="h-10">
      <option value="">{t("nutrition.noMeal")}</option>
      {MEALS.map((m) => <option key={m} value={m}>{t(`nutrition.meal.${m}`)}</option>)}
    </Select>
  );
}

export function ProductList({ items, onPick, onQuick, pending }: { items: (Product & { lastAmount?: number })[]; onPick: (p: Product) => void; onQuick?: (p: Product, amount: number) => void; pending?: boolean }) {
  const { t, locale } = useI18n();
  if (!items.length) return <p className="py-4 text-center text-sm text-muted">{t("nutrition.noResults")}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((p) => (
        <li key={p.id} className="flex items-center gap-2">
          <button type="button" onClick={() => onPick(p)} className="min-w-0 flex-1 py-3 text-left">
            <span className="block truncate font-medium">{p.name}{p.state && p.source !== "generic" && <span className="ml-1.5 text-xs font-normal text-muted">({t(`nutrition.state.${p.state}`)})</span>}</span>
            <span className="block truncate text-xs text-muted">
              {p.brand ? `${p.brand} · ` : ""}{p.nutrients.kcal === null ? t("nutrition.missing") : `${fmt(locale, p.nutrients.kcal)} kcal`} / 100 {p.basis}
              {p.lastAmount ? ` · ${t("nutrition.lastAmount", { n: `${fmt(locale, p.lastAmount)} ${p.basis}` })}` : ""}
              {p.source === "custom" ? ` · ${t("nutrition.sourceCustom")}` : ""}
            </span>
          </button>
          {onQuick && p.lastAmount ? (
            <button type="button" disabled={pending} onClick={() => onQuick(p, p.lastAmount!)} aria-label={`${t("common.add")} ${p.name} ${p.lastAmount} ${p.basis}`}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent hover:bg-accent hover:text-accent-contrast">
              <Plus size={20} />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * "Not exactly this? Use the average of similar results": the median of the top results (same as the server
 * computes), shown with a few of their names so it's clear what it is based on.
 */
function AverageOffer({ query, items, onPick }: { query: string; items: Product[]; onPick: (p: Product) => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  const top = items.filter((p) => p.source !== "custom" || !p.name.includes("≈")).slice(0, 8);
  // A basic food among the first results is better than any average.
  const m = query.trim().length >= 3 && top.length >= 3 && !top.slice(0, 3).some((p) => p.source === "generic") ? medianOf(top) : null;
  if (!m) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border px-3 py-2.5">
      <div className="min-w-0 text-sm">
        <p className="font-medium">{t("nutrition.avgOffer", { n: m.used.length, kcal: fmt(locale, m.nutrients.kcal), basis: m.basis })}</p>
        <p className="truncate text-xs text-muted">{m.used.slice(0, 3).map((p) => p.name).join(" · ")}</p>
      </div>
      <Button size="sm" variant="secondary" className="shrink-0" disabled={pending} onClick={() => start(async () => {
        const r = await averageProduct({ ids: m.used.map((p) => p.id), name: query.trim().slice(0, 60) });
        if (r.product) onPick(r.product);
        else toast({ text: t("common.error") });
      })}>{t("nutrition.avgUse")}</Button>
    </div>
  );
}

function SearchTab({ onPick, onScan, children }: { onPick: (p: Product) => void; onScan: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [local, setLocal] = useState<Product[]>([]);
  const [remote, setRemote] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const [searched, setSearched] = useState(false);
  // One search: own + basic foods as you type, then Open Food Facts right after (cached server-side), merged into one list.
  useEffect(() => {
    setRemote(null);
    setError(null);
    setSearched(false);
    if (q.trim().length < 2) return setLocal([]);
    const id = ++seq.current;
    const h = setTimeout(async () => {
      const r = await fetch(`/api/food/search?q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => ({ products: [] }));
      if (id !== seq.current) return;
      const found: Product[] = r.products ?? [];
      setLocal(found);
      setSearched(true);
      if (q.trim().length >= 3) searchRemote(found, id);
    }, 450);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const searchRemote = async (have: Product[] = local, id = seq.current) => {
    setLoading(true);
    setError(null);
    const r = await fetch(`/api/food/search?q=${encodeURIComponent(q)}&remote=1`).then((x) => x.json()).catch(() => ({ error: "unavailable" }));
    if (id !== seq.current) return;
    setLoading(false);
    if (r.error) setError(r.error === "rate_limited" ? t("nutrition.rateLimited") : t("nutrition.unavailable"));
    else setRemote((r.products ?? []).filter((p: Product) => !have.some((l) => l.id === p.id)));
  };

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => e.preventDefault()} className="flex gap-2">
        <Input type="search" autoFocus placeholder={t("nutrition.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("nutrition.search")} />
        <Button type="button" variant="secondary" onClick={onScan} aria-label={t("nutrition.scan")}><ScanBarcode size={20} aria-hidden /></Button>
      </form>
      {q.trim().length < 2 && children}
      {q.trim().length >= 2 && (
        <>
          <AverageOffer query={q} items={[...local, ...(remote ?? [])]} onPick={onPick} />
          {(() => {
            const all = [...local, ...(remote ?? [])];
            if (!searched) return <p className="py-3 text-center text-sm text-muted">{t("common.loading")}</p>;
            if (!all.length && loading) return <p className="py-3 text-center text-sm text-muted">{t("nutrition.searchingRemote")}</p>;
            if (!all.length) return <p className="py-4 text-center text-sm text-muted">{error ?? t("nutrition.nothingFound")}</p>;
            return (
              <>
                <ProductList items={all} onPick={onPick} />
                {loading && <p className="py-2 text-center text-xs text-muted">{t("nutrition.searchingRemote")}</p>}
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}

/** Product servings, plus "slice (≈ 12 g)" for sliced ham/cheese that came without one. */
export function servingsWithSlice(p: Pick<Product, "servings" | "name" | "basis">, label: string) {
  if (p.servings.length || p.basis !== "g") return p.servings;
  const g = typicalSlice(p.name);
  return g ? [{ label: `${label} (≈ ${g} g)`, amount: g }] : [];
}

export function AmountPicker({ product, onAdd, onBack, pending, meal, onRescan }: { product: Product & { lastAmount?: number }; onAdd: (amount: number) => void; onBack: () => void; pending: boolean; meal?: ReactNode; onRescan?: () => void }) {
  const { t, locale } = useI18n();
  // Basic foods start at one piece (one egg); everything else at the last amount or 100 g.
  // (Countable servings only: an egg, a slice of bread, a pot; spoons and sprays start in grams.)
  const startPieces = product.source === "generic" && !product.lastAmount && (product.servings[0]?.amount ?? 0) >= 30;
  const [amount, setAmount] = useState<number | null>(product.lastAmount ?? (startPieces ? product.servings[0]!.amount : 100));
  const [fav, setFav] = useState(!!product.favorite);
  const v = scale(product.nutrients, amount ?? 0);
  const num = (k: NutrientKey) => (v[k] === null ? <span className="text-warning">?</span> : fmt(locale, v[k], k === "kcal" ? 0 : 1));
  // Averages of similar products are estimates: the only case worth a note under the values.
  const estimate = product.source === "custom" && product.name.includes("≈");
  const macros: NutrientKey[] = ["protein", "carbs", "fat", ...(v.fiber !== null ? (["fiber"] as const) : [])];
  return (
    <div className="space-y-3">
      {onRescan && (
        // After a scan, make sure it is the right product before choosing the amount.
        <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-3 py-2.5 text-sm">
          <span className="min-w-0">
            <span className="block font-medium text-accent">{t("nutrition.scannedCheck")}</span>
            <span className="line-clamp-2 text-muted">{product.name}</span>
          </span>
          <Button size="sm" variant="ghost" className="shrink-0 whitespace-nowrap" onClick={onRescan}>{t("nutrition.rescan")}</Button>
        </div>
      )}
      {(product.brand || product.state) && (
        <div className="flex flex-wrap items-center gap-2">
          {product.brand && <Badge>{product.brand}</Badge>}
          {product.state && <Badge tone="accent">{t(`nutrition.state.${product.state}`)}</Badge>}
        </div>
      )}
      {energyMismatch(product.nutrients) && <Notice tone="warning">{t("nutrition.energyMismatch")}</Notice>}
      {meal}
      <AmountInput amount={amount} onChange={setAmount} basis={product.basis} servings={servingsWithSlice(product, t("nutrition.slice"))} startPieces={startPieces} />
      {/* The amount's calories big, per 100 g beside them, macros underneath; fits a phone screen without scrolling. */}
      <div className="rounded-2xl bg-surface-2 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="tabular-nums"><span className="text-3xl font-semibold">{num("kcal")}</span><span className="ml-1 text-sm text-muted">kcal</span></p>
          <p className="text-right text-xs text-muted tabular-nums">
            {product.nutrients.kcal === null ? t("nutrition.missing") : `${fmt(locale, product.nutrients.kcal)} kcal`} {t("nutrition.per100", { basis: product.basis })}
          </p>
        </div>
        <div className={cx("mt-3 grid gap-1 border-t border-border pt-3", macros.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
          {macros.map((k) => (
            <div key={k} className="min-w-0">
              <p className="font-semibold tabular-nums">{num(k)}<span className="ml-0.5 text-xs font-normal text-muted">g</span></p>
              <p className="truncate text-[11px] text-muted">{t(`nutrition.${k}`)}</p>
            </div>
          ))}
        </div>
        {estimate && <p className="mt-2 text-xs text-muted">{t("nutrition.estimateNote")}</p>}
      </div>
      <div className="sticky bottom-0 -mx-5 flex gap-2 bg-surface px-5 pt-1">
        {/* Favourite as a star next to Back: always at hand, no extra row. */}
        <Button variant="secondary" className="w-12 shrink-0 px-0" aria-pressed={fav} aria-label={fav ? t("nutrition.unfavorite") : t("nutrition.favorite")} title={fav ? t("nutrition.unfavorite") : t("nutrition.favorite")}
          onClick={() => { setFav(!fav); toggleFavorite(product.id, !fav); }}>
          <Star size={22} className={fav ? "fill-current text-warning" : "text-text"} aria-hidden />
        </Button>
        <Button variant="ghost" onClick={onBack}>{t("common.back")}</Button>
        <Button full disabled={pending || !amount || amount <= 0} onClick={() => amount && onAdd(amount)}>{t("common.add")}</Button>
      </div>
    </div>
  );
}

function MealsTab({ recipes, onLog, pending }: { recipes: RecipeLite[]; onLog: (r: RecipeLite, amount: number, mode: "grams" | "servings") => void; pending: boolean }) {
  const { t, locale } = useI18n();
  const [servings, setServings] = useState<Record<string, number | null>>({});
  if (!recipes.length) return <p className="py-4 text-center text-sm text-muted">{t("nutrition.noResults")}</p>;
  return (
    <ul className="divide-y divide-border">
      {recipes.map((r) => (
        <li key={r.id} className="flex items-center gap-2 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.name}</p>
            <p className="text-xs text-muted">
              {r.isMeal ? `${fmt(locale, r.totalKcal)} kcal` : `${fmt(locale, r.perServingKcal)} kcal ${t("nutrition.perServing")}`}
            </p>
          </div>
          {!r.isMeal && (
            <div className="w-20"><DecimalInput aria-label={t("nutrition.logServings")} value={servings[r.id] ?? 1} onChange={(v) => setServings({ ...servings, [r.id]: v })} className="h-10" /></div>
          )}
          <button type="button" disabled={pending} aria-label={`${t("common.add")} ${r.name}`}
            onClick={() => (r.isMeal ? onLog(r, r.finalWeight, "grams") : onLog(r, servings[r.id] ?? 1, "servings"))}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent hover:bg-accent hover:text-accent-contrast">
            <Plus size={20} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function CustomFood({ barcode, prefill, onSaved }: { barcode: string | null; prefill?: { name: string; brand: string | null } | null; onSaved: (id: string) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [f, setF] = useState({ name: prefill?.name ?? "", brand: prefill?.brand ?? "", basis: "g" as "g" | "ml", state: "" as "" | "raw" | "cooked", barcode: barcode ?? "", serving: null as number | null });
  const [n, setN] = useState<Record<NutrientKey, number | null>>(Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, null])) as Record<NutrientKey, number | null>);
  const [pending, start] = useTransition();
  useEffect(() => setF((x) => ({ ...x, barcode: barcode ?? x.barcode })), [barcode]);
  const labels: Record<NutrientKey, string> = {
    kcal: t("common.kcal"), protein: t("nutrition.protein"), carbs: t("nutrition.carbs"), fat: t("nutrition.fat"),
    fiber: t("nutrition.fiber"), sugar: t("nutrition.sugar"), satFat: t("nutrition.satFat"), salt: t("nutrition.salt"),
  };
  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await saveFood({
          name: f.name, brand: f.brand || null, barcode: f.barcode || null, basis: f.basis, state: f.state || null, nutrients: n,
          servings: f.serving ? [{ label: `${t("nutrition.serving")} ${f.serving} ${f.basis}`, amount: f.serving }] : [],
        });
        if (r.error || !r.id) return toast({ text: t("common.error") });
        onSaved(r.id);
      });
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("nutrition.name")} htmlFor="cf-name"><Input id="cf-name" required maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={`${t("nutrition.brand")} (${t("common.optional")})`} htmlFor="cf-brand"><Input id="cf-brand" maxLength={60} value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></Field>
        <Field label={t("nutrition.basis")} htmlFor="cf-basis">
          <Select id="cf-basis" value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value as "g" | "ml" })}><option value="g">100 g</option><option value="ml">100 ml</option></Select>
        </Field>
        <Field label={t("nutrition.stateLabel")} htmlFor="cf-state">
          <Select id="cf-state" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value as "" | "raw" | "cooked" })}>
            <option value="">—</option><option value="raw">{t("nutrition.state.raw")}</option><option value="cooked">{t("nutrition.state.cooked")}</option>
          </Select>
        </Field>
        <Field label={`${t("nutrition.barcode")} (${t("common.optional")})`} htmlFor="cf-code"><Input id="cf-code" inputMode="numeric" value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value.replace(/\D/g, "").slice(0, 14) })} /></Field>
        <Field label={`${t("nutrition.serving")} (${f.basis}, ${t("common.optional")})`} htmlFor="cf-serv"><DecimalInput id="cf-serv" value={f.serving} onChange={(v) => setF({ ...f, serving: v })} /></Field>
      </div>
      <p className="text-sm font-medium">{t("nutrition.fromLabel")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {NUTRIENT_KEYS.map((k) => (
          <label key={k} className="space-y-1 text-sm">
            <span className={cx("block", k === "kcal" && "font-medium")}>{labels[k]}{k === "kcal" ? " *" : ""}</span>
            <DecimalInput value={n[k]} onChange={(v) => setN({ ...n, [k]: v })} required={k === "kcal"} />
          </label>
        ))}
      </div>
      <Button type="submit" full disabled={pending || !f.name.trim() || n.kcal === null}>{t("nutrition.createProduct")}</Button>
    </form>
  );
}

function QuickTab({ onAdd, pending }: { onAdd: (q: { name: string; kcal: number; protein: number | null; carbs: number | null; fat: number | null }) => void; pending: boolean }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [v, setV] = useState<{ kcal: number | null; protein: number | null; carbs: number | null; fat: number | null }>({ kcal: null, protein: null, carbs: null, fat: null });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (v.kcal !== null) onAdd({ name: name.trim() || t("nutrition.quick"), kcal: v.kcal, protein: v.protein, carbs: v.carbs, fat: v.fat }); setV({ kcal: null, protein: null, carbs: null, fat: null }); setName(""); }}>
      <Input placeholder={t("nutrition.quickName")} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label={t("nutrition.quickName")} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["kcal", "protein", "carbs", "fat"] as const).map((k) => (
          <label key={k} className="space-y-1 text-sm">
            <span className="block">{k === "kcal" ? `${t("nutrition.kcalOnly")} *` : `${t(`nutrition.${k}`)} (g)`}</span>
            <DecimalInput value={v[k]} onChange={(x) => setV({ ...v, [k]: x })} />
          </label>
        ))}
      </div>
      <Button type="submit" full disabled={pending || v.kcal === null}>{t("common.add")}</Button>
    </form>
  );
}

const ROW = 40;
/** Amounts on the wheel: 5 g steps up to 1 kg, then 10 g steps up to 2 kg (an off-step value is slotted in). */
function wheelValues(extra: number | null): number[] {
  const v: number[] = [];
  for (let x = 5; x <= 1000; x += 5) v.push(x);
  for (let x = 1010; x <= 2000; x += 10) v.push(x);
  if (extra && extra > 0 && !v.includes(extra)) v.splice(v.findIndex((x) => x > extra) === -1 ? v.length : v.findIndex((x) => x > extra), 0, extra);
  return v;
}

/** Scroll wheel for the amount (like a phone's time picker); a tap on "type it" switches to the keyboard. */
/**
 * Amount in grams/ml or in pieces of a serving (egg, slice, pot…). Used when adding and when editing an entry.
 * Opens in pieces when the amount is a whole number of servings (or `startPieces`).
 */
export function AmountInput({ amount, onChange, basis, servings, startPieces }: {
  amount: number | null; onChange: (v: number | null) => void; basis: string; servings: { label: string; amount: number }[]; startPieces?: boolean;
}) {
  const { t, locale } = useI18n();
  const [unit, setUnit] = useState<number | null>(() => {
    if (!servings.length) return null;
    if (startPieces) return 0;
    // Only countable servings (≥ 30 g: egg, slice of bread, pot); 100 g of flour is not "10 tablespoons".
    const i = amount ? servings.findIndex((s) => s.amount >= 30 && Number.isInteger(amount / s.amount) && amount / s.amount <= 20) : -1;
    return i >= 0 ? i : null;
  });
  const [count, setCount] = useState<number | null>(() => (unit !== null && amount ? amount / servings[unit]!.amount : 1));
  const pieceLabel = (label: string) => { const s = label.replace(/^1\s+/, ""); return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1); };
  const segment = (on: boolean) => cx("min-h-10 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors", on ? "bg-accent text-accent-contrast" : "text-muted hover:text-text");
  const changeCount = (c: number | null) => { setCount(c); onChange(c && c > 0 ? Math.round(c * servings[unit!]!.amount * 10) / 10 : null); };
  return (
    <>
      {servings.length > 0 && (
        // One full-width switch: grams or the product's own unit (piece, slice, spoon).
        <div className={cx("gap-1 rounded-xl bg-surface-2 p-1", servings.length >= 3 ? "grid grid-cols-2" : "flex flex-wrap")} role="group" aria-label={t("nutrition.unit")}>
          <button type="button" className={segment(unit === null)} aria-pressed={unit === null} onClick={() => setUnit(null)}>{basis === "ml" ? t("nutrition.unitMl") : t("nutrition.unitGrams")}</button>
          {servings.map((sv, i) => (
            <button key={sv.label} type="button" className={segment(unit === i)} aria-pressed={unit === i}
              onClick={() => { setUnit(i); setCount(1); onChange(sv.amount); }}>
              {pieceLabel(sv.label)}
            </button>
          ))}
        </div>
      )}
      {unit !== null ? (
        <div className="flex flex-col items-center gap-1.5 py-2">
          <div className="flex items-center gap-4">
            <Button variant="secondary" aria-label="−" className="h-12 w-12 rounded-full! px-0 text-2xl" disabled={!count || count <= 0.5} onClick={() => changeCount(Math.max(0.5, (count ?? 1) - (count && count <= 1 ? 0.5 : 1)))}>−</Button>
            <div className="w-24"><DecimalInput aria-label={pieceLabel(servings[unit]!.label)} value={count} onChange={changeCount} className="h-14 text-center text-3xl! font-semibold" /></div>
            <Button variant="secondary" aria-label="+" className="h-12 w-12 rounded-full! px-0 text-2xl" onClick={() => changeCount((count ?? 0) < 1 ? 1 : (count ?? 0) + 1)}>+</Button>
          </div>
          <p className="text-sm text-muted tabular-nums">= {fmt(locale, amount ?? 0)} {basis}</p>
        </div>
      ) : (
        <AmountWheel value={amount} onChange={onChange} unit={basis} />
      )}
    </>
  );
}

export function AmountWheel({ value, onChange, unit }: { value: number | null; onChange: (v: number) => void; unit: string }) {
  const { t } = useI18n();
  const [typing, setTyping] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState(() => wheelValues(value));
  const settled = useRef(value);
  const frame = useRef(0);

  // Follow outside changes (serving chips): rebuild the list if needed and scroll to the value.
  useEffect(() => {
    if (value === null || value === settled.current) return;
    settled.current = value;
    const list = values.includes(value) ? values : wheelValues(value);
    if (list !== values) setValues(list);
    requestAnimationFrame(() => ref.current?.scrollTo({ top: list.indexOf(value) * ROW, behavior: "smooth" }));
  }, [value, values]);

  // Position the wheel only once it is actually laid out (a sheet may still be opening); until then scroll
  // events are ignored, otherwise the wheel would report its top value (5) and overwrite the saved amount.
  const ready = useRef(false);
  useEffect(() => {
    ready.current = false;
    let tries = 0;
    const place = () => {
      const el = ref.current;
      if (!el) return;
      if (el.clientHeight === 0 && tries++ < 30) return void requestAnimationFrame(place);
      if (value !== null) el.scrollTop = Math.max(0, values.indexOf(value)) * ROW;
      requestAnimationFrame(() => { ready.current = true; });
    };
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing]);

  if (typing) {
    return (
      <div className="flex items-center gap-2">
        <DecimalInput id="amount" value={value} onChange={(v) => v !== null && onChange(v)} autoFocus className="h-14 text-2xl font-semibold" />
        <span className="text-muted">{unit}</span>
        <Button variant="ghost" size="sm" onClick={() => setTyping(false)}>{t("nutrition.wheel")}</Button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-3">
      <div className="relative h-[200px] w-36">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 rounded-xl bg-surface-2" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-surface to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-surface to-transparent" />
        <div ref={ref} role="listbox" aria-label={t("nutrition.amount")} tabIndex={0}
          className="no-scrollbar relative h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
          onScroll={(e) => {
            if (!ready.current) return;
            const el = e.currentTarget;
            cancelAnimationFrame(frame.current);
            frame.current = requestAnimationFrame(() => {
              const v = values[Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)))]!;
              if (v !== settled.current) { settled.current = v; onChange(v); }
            });
          }}>
          <div style={{ height: 80 }} />
          {values.map((v) => (
            <button key={v} type="button" role="option" aria-selected={v === value}
              onClick={(e) => e.currentTarget.parentElement?.scrollTo({ top: values.indexOf(v) * ROW, behavior: "smooth" })}
              className={cx("flex h-10 w-full snap-center items-center justify-center tabular-nums transition-colors", v === value ? "text-2xl font-semibold" : "text-lg text-muted")}>
              {v}
            </button>
          ))}
          <div style={{ height: 80 }} />
        </div>
      </div>
      <div className="flex flex-col items-stretch gap-1.5">
        {/* Common amounts in one tap, so the wheel is only for fine tuning. */}
        {[100, 200, 300].map((q) => (
          <Button key={q} size="sm" variant={value === q ? "primary" : "secondary"} onClick={() => onChange(q)}>{q} {unit}</Button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setTyping(true)}>{t("nutrition.typeAmount")}</Button>
      </div>
    </div>
  );
}
