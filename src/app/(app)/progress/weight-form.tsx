"use client";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logWeight, removeWeight } from "@/app/actions/general";
import { DecimalInput, useToast } from "@/components/client";
import { Button, cx, Input } from "@/components/ui";
import { fmt, fmtDate } from "@/i18n";
import { useI18n } from "@/i18n/client";

/**
 * Same weigh-ins as the quick field on "Today". The form shows what is saved for the chosen day, and the list
 * of recent weigh-ins lets you fix or delete one without remembering its date.
 */
export function WeightForm({ today, known }: { today: string; known: Record<string, number> }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [kg, setKg] = useState<number | null>(known[today] ?? null);
  const [all, setAll] = useState(false);
  const [pending, start] = useTransition();
  const recent = Object.entries(known).sort((a, b) => b[0].localeCompare(a[0]));
  const shown = all ? recent : recent.slice(0, 5);

  const remove = (d: string) => confirm(t("progress.deleteWeightConfirm")) && start(async () => {
    await removeWeight(d);
    if (d === date) setKg(null);
    toast({ text: t("common.deleted") });
    router.refresh();
  });

  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
        e.preventDefault();
        if (kg === null) return;
        start(async () => {
          const r = await logWeight(date, kg);
          toast({ text: r.error ? t("common.error") : t("common.saved") });
          if (!r.error) router.refresh();
        });
      }}>
        <label className="space-y-1 text-sm">
          <span className="block text-muted">{t("progress.addWeight")}</span>
          <Input type="date" value={date} max={today} onChange={(e) => { setDate(e.target.value); setKg(known[e.target.value] ?? null); }} className="w-40" />
        </label>
        <div className="relative w-28">
          <DecimalInput id="weight-kg" aria-label="kg" value={kg} onChange={setKg} placeholder="—" className="pr-8" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">kg</span>
        </div>
        <Button type="submit" variant="secondary" disabled={pending || kg === null}>{t("common.save")}</Button>
      </form>

      {recent.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("progress.recentWeights")}</p>
          <ul className="divide-y divide-border">
            {shown.map(([d, v]) => (
              <li key={d} className={cx("flex items-center gap-1", d === date && "font-semibold")}>
                {/* Tap the row to load it into the form above for a correction. */}
                <button type="button" className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2 text-left text-sm"
                  onClick={() => { setDate(d); setKg(v); document.getElementById("weight-kg")?.focus(); }}>
                  <span>{d === today ? t("common.today") : fmtDate(locale, d, { weekday: "short", day: "numeric", month: "short" })}</span>
                  <span className="inline-flex items-center gap-2 tabular-nums">{fmt(locale, v, 1)} kg<Pencil size={14} className="text-muted" aria-hidden /></span>
                </button>
                <button type="button" aria-label={`${t("common.delete")} ${d}`} disabled={pending} onClick={() => remove(d)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-danger-soft hover:text-danger">
                  <Trash2 size={15} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {recent.length > 5 && (
            <button type="button" className="mt-1 text-sm font-medium text-accent" onClick={() => setAll(!all)}>
              {all ? t("common.hide") : t("progress.allWeights", { n: recent.length })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
