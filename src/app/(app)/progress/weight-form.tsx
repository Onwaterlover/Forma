"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logWeight } from "@/app/actions/general";
import { DecimalInput, useToast } from "@/components/client";
import { Button, Input } from "@/components/ui";
import { useI18n } from "@/i18n/client";

/** Same weigh-ins as the quick field on "Today": shows what is saved for the chosen day, so it reads as edit, not a second entry. */
export function WeightForm({ today, known }: { today: string; known: Record<string, number> }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [kg, setKg] = useState<number | null>(known[today] ?? null);
  const [pending, start] = useTransition();
  return (
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
        <DecimalInput aria-label="kg" value={kg} onChange={setKg} placeholder="—" className="pr-8" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">kg</span>
      </div>
      <Button type="submit" variant="secondary" disabled={pending || kg === null}>{t("common.save")}</Button>
    </form>
  );
}
