"use client";
import { Plus, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { addProductEntry, addQuickEntry, addRecipeEntry, productFor, saveFood, toggleFavorite } from "@/app/actions/nutrition";
import { DecimalInput, Sheet, useToast } from "@/components/client";
import { Badge, Button, cx, Field, Input, Notice, Select } from "@/components/ui";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/client";
import type { Product } from "@/lib/data";
import { energyMismatch, NUTRIENT_KEYS, scale, type NutrientKey } from "@/nutrition/calc";
import { Scanner } from "./scanner";

export type RecipeLite = { id: string; name: string; isMeal: boolean; servings: number; finalWeight: number; perServingKcal: number | null; totalKcal: number | null };
type Tab = "search" | "scan" | "recent" | "favorites" | "meals" | "custom" | "quick";
const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

export function AddFood({
  open, onClose, date, recents, favorites, recipes,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  recents: (Product & { lastAmount: number })[];
  favorites: Product[];
  recipes: RecipeLite[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(recents.length ? "recent" : "search");
  const [meal, setMeal] = useState<string | null>(null);
  const [picked, setPicked] = useState<Product | null>(null);
  const [barcodeForNew, setBarcodeForNew] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setBarcodeForNew(null);
    }
  }, [open]);

  const quickAdd = (p: Product, amount: number) =>
    start(async () => {
      const r = await addProductEntry({ productId: p.id, amount, date, meal });
      toast({ text: r.error ? t("common.error") : `${t("common.saved")}: ${p.name}` });
    });

  const onCode = useCallback(async (code: string, format?: string) => {
    const res = await fetch(`/api/food/barcode/${code}${format ? `?format=${format}` : ""}`);
    const data = await res.json().catch(() => ({}));
    if (data.product) {
      setPicked(data.product);
      if (data.warnings?.includes("energy_mismatch")) toast({ text: t("nutrition.energyMismatch") });
    } else if (data.error === "not_found") {
      toast({ text: t("nutrition.notFound") });
      setBarcodeForNew(data.barcode ?? code);
      setTab("custom");
    } else if (data.error === "invalid_barcode") toast({ text: t("nutrition.invalidBarcode") });
    else toast({ text: data.error === "rate_limited" ? t("nutrition.rateLimited") : t("nutrition.unavailable") });
  }, [t, toast]);

  const tabs: { k: Tab; l: string }[] = [
    { k: "recent", l: t("nutrition.recent") }, { k: "search", l: t("nutrition.search") }, { k: "scan", l: t("nutrition.scan") },
    { k: "favorites", l: t("nutrition.favorites") }, { k: "meals", l: t("nutrition.meals") }, { k: "custom", l: t("nutrition.custom") }, { k: "quick", l: t("nutrition.quick") },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={picked ? picked.name : t("nutrition.add")} wide>
      {picked ? (
        <AmountPicker product={picked} pending={pending} onBack={() => setPicked(null)}
          onAdd={(amount) => start(async () => {
            const r = await addProductEntry({ productId: picked.id, amount, date, meal });
            toast({ text: r.error ? t("common.error") : `${t("common.saved")}: ${picked.name}` });
            if (!r.error) setPicked(null);
          })} />
      ) : (
        <div className="space-y-4">
          <div className="-mx-1 flex gap-1 overflow-x-auto pb-1" role="tablist">
            {tabs.map((x) => (
              <button key={x.k} role="tab" type="button" aria-selected={tab === x.k} onClick={() => setTab(x.k)}
                className={cx("h-9 shrink-0 rounded-full px-3.5 text-sm", tab === x.k ? "bg-accent text-accent-contrast" : "bg-surface-2 hover:bg-border")}>{x.l}</button>
            ))}
          </div>
          <Select aria-label={t("nutrition.mealLabel")} value={meal ?? ""} onChange={(e) => setMeal(e.target.value || null)} className="h-10">
            <option value="">{t("nutrition.noMeal")}</option>
            {MEALS.map((m) => <option key={m} value={m}>{t(`nutrition.meal.${m}`)}</option>)}
          </Select>

          {tab === "search" && <SearchTab onPick={setPicked} />}
          {tab === "scan" && <Scanner onCode={onCode} />}
          {(tab === "recent" || tab === "favorites") && (
            <ProductList
              items={tab === "recent" ? recents : favorites.map((p) => ({ ...p, lastAmount: p.servings[0]?.amount ?? 100 }))}
              onPick={setPicked}
              onQuick={quickAdd}
              pending={pending}
            />
          )}
          {tab === "meals" && <MealsTab recipes={recipes} pending={pending} onLog={(r, amount, mode) => start(async () => {
            const res = await addRecipeEntry({ recipeId: r.id, amount, mode, date, meal });
            toast({ text: res.error ? t("common.error") : `${t("common.saved")}: ${r.name}` });
          })} />}
          {tab === "custom" && <CustomFood barcode={barcodeForNew} onSaved={async (id) => {
            const prod = await productFor(id);
            if (prod) setPicked(prod);
          }} />}
          {tab === "quick" && <QuickTab pending={pending} onAdd={(q) => start(async () => {
            const r = await addQuickEntry({ ...q, date, meal });
            toast({ text: r.error ? t("common.error") : t("common.saved") });
          })} />}
          <p className="text-xs text-muted">{t("nutrition.offAttribution")}</p>
        </div>
      )}
    </Sheet>
  );
}

function ProductList({ items, onPick, onQuick, pending }: { items: (Product & { lastAmount?: number })[]; onPick: (p: Product) => void; onQuick?: (p: Product, amount: number) => void; pending?: boolean }) {
  const { t, locale } = useI18n();
  if (!items.length) return <p className="py-4 text-center text-sm text-muted">{t("nutrition.noResults")}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((p) => (
        <li key={p.id} className="flex items-center gap-2">
          <button type="button" onClick={() => onPick(p)} className="min-w-0 flex-1 py-3 text-left">
            <span className="block truncate font-medium">{p.name}{p.state && <span className="ml-1.5 text-xs font-normal text-muted">({t(`nutrition.state.${p.state}`)})</span>}</span>
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

function SearchTab({ onPick }: { onPick: (p: Product) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [local, setLocal] = useState<Product[]>([]);
  const [remote, setRemote] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  // Debounced local search only; the remote database is queried on explicit request.
  useEffect(() => {
    setRemote(null);
    setError(null);
    if (q.trim().length < 2) return setLocal([]);
    const id = ++seq.current;
    const h = setTimeout(async () => {
      const r = await fetch(`/api/food/search?q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => ({ products: [] }));
      if (id === seq.current) setLocal(r.products ?? []);
    }, 250);
    return () => clearTimeout(h);
  }, [q]);

  const searchRemote = async () => {
    setLoading(true);
    setError(null);
    const r = await fetch(`/api/food/search?q=${encodeURIComponent(q)}&remote=1`).then((x) => x.json()).catch(() => ({ error: "unavailable" }));
    setLoading(false);
    if (r.error) setError(r.error === "rate_limited" ? t("nutrition.rateLimited") : t("nutrition.unavailable"));
    else setRemote((r.products ?? []).filter((p: Product) => !local.some((l) => l.id === p.id)));
  };

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) searchRemote(); }} className="flex gap-2">
        <Input type="search" autoFocus placeholder={t("nutrition.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("nutrition.search")} />
      </form>
      {q.trim().length >= 2 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("nutrition.localResults")}</p>
          <ProductList items={local} onPick={onPick} />
          {remote === null ? (
            <Button variant="secondary" full disabled={loading} onClick={searchRemote}>{loading ? t("common.loading") : t("nutrition.searchRemote")}</Button>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("nutrition.remoteResults")}</p>
              <ProductList items={remote} onPick={onPick} />
            </>
          )}
          {error && <Notice tone="warning">{error}</Notice>}
        </>
      )}
    </div>
  );
}

export function AmountPicker({ product, onAdd, onBack, pending }: { product: Product; onAdd: (amount: number) => void; onBack: () => void; pending: boolean }) {
  const { t, locale } = useI18n();
  const [amount, setAmount] = useState<number | null>(product.servings[0]?.amount ?? 100);
  const [fav, setFav] = useState(!!product.favorite);
  const v = scale(product.nutrients, amount ?? 0);
  const row = (k: NutrientKey, label: string) => (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{v[k] === null ? <span className="text-warning">{t("nutrition.missing")}</span> : `${fmt(locale, v[k], 1)} ${k === "kcal" ? "kcal" : "g"}`}</span>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {product.brand && <Badge>{product.brand}</Badge>}
        {product.state && <Badge tone="accent">{t(`nutrition.state.${product.state}`)}</Badge>}
        <Badge>{product.source === "off" ? t("nutrition.sourceOff") : t("nutrition.sourceCustom")}</Badge>
        <button type="button" aria-pressed={fav} className="ml-auto inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted hover:bg-surface-2"
          onClick={() => { setFav(!fav); toggleFavorite(product.id, !fav); }}>
          <Star size={16} className={fav ? "fill-current text-warning" : ""} aria-hidden />{fav ? t("nutrition.unfavorite") : t("nutrition.favorite")}
        </button>
      </div>
      {energyMismatch(product.nutrients) && <Notice tone="warning">{t("nutrition.energyMismatch")}</Notice>}
      <Field label={`${t("nutrition.amount")} (${product.basis})`} htmlFor="amount">
        <DecimalInput id="amount" value={amount} onChange={setAmount} autoFocus className="h-14 text-2xl font-semibold" />
      </Field>
      <div className="flex flex-wrap gap-2">
        {product.servings.map((s) => <Button key={s.label} size="sm" variant="secondary" onClick={() => setAmount(s.amount)}>{s.label}</Button>)}
        {[50, 100, 150, 200].map((g) => <Button key={g} size="sm" variant="secondary" onClick={() => setAmount(g)}>{g} {product.basis}</Button>)}
      </div>
      <div className="divide-y divide-border rounded-xl border border-border px-3">
        {row("kcal", t("common.kcal"))}
        {row("protein", t("nutrition.protein"))}
        {row("carbs", t("nutrition.carbs"))}
        {row("fat", t("nutrition.fat"))}
        {row("fiber", t("nutrition.fiber"))}
      </div>
      <p className="text-xs text-muted">{t("nutrition.per100", { basis: product.basis })}: {product.nutrients.kcal === null ? t("nutrition.missing") : `${fmt(locale, product.nutrients.kcal)} kcal`}</p>
      <div className="flex gap-2">
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

function CustomFood({ barcode, onSaved }: { barcode: string | null; onSaved: (id: string) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [f, setF] = useState({ name: "", brand: "", basis: "g" as "g" | "ml", state: "" as "" | "raw" | "cooked", barcode: barcode ?? "", serving: null as number | null });
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
