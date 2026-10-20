"use client";
import { ChevronLeft, ChevronRight, Copy, ListPlus, Plus, Settings2, Utensils } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { copyFromYesterday, editEntry, markDay, removeEntry, saveMealFromEntries, undoRemove } from "@/app/actions/nutrition";
import { DecimalInput, Sheet, useToast } from "@/components/client";
import { Button, Card, cx, Empty, Input, Meter, Select } from "@/components/ui";
import { fmt, fmtDate } from "@/i18n";
import { useI18n } from "@/i18n/client";
import type { DiaryEntry, Product } from "@/lib/data";
import type { Nutrients, NutrientKey } from "@/nutrition/calc";
import { AddFood, type RecipeLite } from "./add-food";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

const shift = (iso: string, d: number) => {
  const x = new Date(`${iso}T12:00:00`);
  x.setDate(x.getDate() + d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

export function Diary({
  date, today, entries, totals, complete, target, recents, favorites, recipes, showFiber,
}: {
  date: string;
  today: string;
  entries: DiaryEntry[];
  totals: Nutrients & { missing: Record<NutrientKey, number> };
  complete: boolean | null;
  target: { kcal: number | null; protein: number | null } | null;
  recents: (Product & { lastAmount: number })[];
  favorites: Product[];
  recipes: RecipeLite[];
  showFiber: boolean;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [mealName, setMealName] = useState("");
  const [pending, start] = useTransition();

  const kcal = totals.kcal ?? 0;
  const label = date === today ? t("common.today") : date === shift(today, -1) ? t("common.yesterday") : fmtDate(locale, date, { weekday: "long", day: "numeric", month: "long" });
  const macro = (k: NutrientKey, name: string) => (
    <div className="min-w-0">
      <p className="text-xs text-muted">{name}</p>
      <p className="text-lg font-semibold tabular-nums">
        {fmt(locale, totals[k] ?? 0)}<span className="text-sm font-normal text-muted"> g</span>
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
          {macro("protein", t("nutrition.protein") + (target?.protein ? ` / ${fmt(locale, target.protein)}` : ""))}
          {macro("carbs", t("nutrition.carbs"))}
          {macro("fat", t("nutrition.fat"))}
          {showFiber && macro("fiber", t("nutrition.fiber"))}
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setAdding(true)} className="flex-1 sm:flex-none"><Plus size={18} aria-hidden />{t("nutrition.add")}</Button>
        <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await copyFromYesterday(date); toast({ text: r.n ? t("nutrition.copied", { n: r.n }) : t("nutrition.noEntriesYesterday") }); })}>
          <Copy size={16} aria-hidden />{t("nutrition.copyYesterday")}
        </Button>
        {entries.length > 1 && <Button variant="secondary" onClick={() => { setSelected(entries.filter((e) => e.basis !== "portion").map((e) => e.id)); setSaving(true); }}><ListPlus size={16} aria-hidden />{t("nutrition.saveMeal")}</Button>}
        <Link href="/nutrition/recipes" className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-medium hover:bg-surface-2"><Utensils size={16} aria-hidden />{t("nutrition.recipes")}</Link>
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
                      <span className="shrink-0 font-medium tabular-nums">{e.values.kcal === null ? t("nutrition.missing") : `${fmt(locale, e.values.kcal)}`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {totals.incomplete?.length ? <p className="text-xs text-muted">* {t("nutrition.incompleteValue")}</p> : null}
        </div>
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

      <AddFood open={adding} onClose={() => { setAdding(false); router.refresh(); }} date={date} recents={recents} favorites={favorites} recipes={recipes} />

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.name ?? ""}>
        {editing && (
          <div className="space-y-4">
            {editing.basis !== "portion" && (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">{t("nutrition.amount")} ({editing.basis})</span>
                <DecimalInput value={amount} onChange={setAmount} autoFocus />
              </label>
            )}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("nutrition.mealLabel")}</span>
              <Select value={editing.meal ?? ""} onChange={(ev) => setEditing({ ...editing, meal: ev.target.value || null })}>
                <option value="">{t("nutrition.noMeal")}</option>
                {MEALS.map((m) => <option key={m} value={m}>{t(`nutrition.meal.${m}`)}</option>)}
              </Select>
            </label>
            <div className="flex gap-2">
              <Button full disabled={pending || (editing.basis !== "portion" && !amount)} onClick={() => start(async () => { await editEntry(editing.id, { amount: editing.basis === "portion" ? undefined : amount!, meal: editing.meal }); setEditing(null); })}>{t("common.save")}</Button>
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
            onClick={() => start(async () => { const r = await saveMealFromEntries(date, selected, mealName); toast({ text: r.error ? t("common.error") : t("common.saved") }); if (!r.error) { setSaving(false); setMealName(""); } })}>
            {t("common.save")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
