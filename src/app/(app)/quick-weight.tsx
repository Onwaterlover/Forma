"use client";
import { useState, useTransition } from "react";
import { logWeight } from "@/app/actions/general";
import { DecimalInput, useToast } from "@/components/client";
import { Button } from "@/components/ui";
import { useI18n } from "@/i18n/client";

export function QuickWeight({ date, current }: { date: string; current: number | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const [kg, setKg] = useState<number | null>(current);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (kg === null) return;
        start(async () => {
          const r = await logWeight(date, kg);
          toast({ text: r.error ? t("common.error") : t("common.saved") });
        });
      }}
    >
      <label className="sr-only" htmlFor="qw">{t("progress.bodyweight")}</label>
      <div className="relative w-32">
        <DecimalInput id="qw" value={kg} onChange={setKg} placeholder="—" className="pr-9" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">kg</span>
      </div>
      <Button type="submit" variant="secondary" disabled={pending || kg === null}>{t("today.quickWeight")}</Button>
    </form>
  );
}
