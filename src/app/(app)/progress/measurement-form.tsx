"use client";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logMeasurements } from "@/app/actions/general";
import { DecimalInput, useToast } from "@/components/client";
import { Button, cx, Input } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { emptyMeasurement, MEASUREMENT_MAX_CM, MEASUREMENT_MIN_CM, MEASUREMENT_SITES, type Measurement, type MeasurementSite } from "@/lib/measurements";

/** Quick entry for one day; picking a day that already has a row loads it for editing. */
export function MeasurementForm({ today, existing }: { today: string; existing: Measurement[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const load = (date: string) => existing.find((m) => m.date === date) ?? emptyMeasurement(date);
  const [m, setM] = useState<Measurement>(() => load(today));
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => { setM(load(today)); setOpen(true); }}>
        <Plus size={16} aria-hidden />{t("progress.addMeasurement")}
      </Button>
    );
  }
  const had = existing.some((x) => x.date === m.date);
  const empty = MEASUREMENT_SITES.every((s) => m[s] === null);
  const outOfRange = (s: MeasurementSite) => { const v = m[s]; return v !== null && !(v > MEASUREMENT_MIN_CM && v < MEASUREMENT_MAX_CM); };
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const { date, ...values } = m;
      start(async () => {
        const r = await logMeasurements(date, values);
        toast({ text: r.error ? t("common.error") : r.deleted ? t("common.deleted") : t("common.saved") });
        if (!r.error) { setOpen(false); router.refresh(); }
      });
    }}>
      <label className="block space-y-1 text-sm">
        <span className="block text-muted">{t("progress.addMeasurement")}</span>
        <Input type="date" value={m.date} max={today} onChange={(e) => e.target.value && setM(load(e.target.value))} className="w-40" />
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {MEASUREMENT_SITES.map((s) => (
          <label key={s} className="space-y-1 text-sm">
            <span className="block text-muted">{t(`progress.sites.${s}`)}</span>
            <span className="relative block">
              <DecimalInput aria-label={`${t(`progress.sites.${s}`)} (cm)`} aria-invalid={outOfRange(s)} value={m[s]} onChange={(v) => setM((x) => ({ ...x, [s]: v }))} placeholder="—"
                className={cx("pr-9", outOfRange(s) && "border-danger")} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">cm</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">{t("progress.measureHint")}</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || (empty && !had) || MEASUREMENT_SITES.some(outOfRange)}>{t("common.save")}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
      </div>
    </form>
  );
}
