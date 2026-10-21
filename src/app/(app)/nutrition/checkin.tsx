"use client";
import { CalendarCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { answerWeek, saveTarget } from "@/app/actions/nutrition";
import { useToast } from "@/components/client";
import { Button, Card, Notice } from "@/components/ui";
import { fmt, fmtDate } from "@/i18n";
import { useI18n } from "@/i18n/client";
import type { AdaptiveResult, TargetSuggestion } from "@/nutrition/energy";

/**
 * Monday check-in about the previous week. The estimate is only as good as the diary, so it first asks
 * whether everything was logged; only then does it look at the numbers and maybe suggest a new target.
 */
export function WeeklyCheckin({ weekStart, weekEnd, avgKcal, days, protein, goal }: {
  weekStart: string;
  weekEnd: string;
  avgKcal: number;
  days: number;
  protein: number | null;
  goal: string | null;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<null | { complete: false } | { complete: true; adaptive: AdaptiveResult; suggestion: TargetSuggestion | null }>(null);

  const answer = (complete: boolean) =>
    start(async () => {
      const r = await answerWeek(weekStart, complete);
      if ("error" in r) return toast({ text: t("common.error") });
      setResult(complete && "adaptive" in r && r.adaptive ? { complete: true, adaptive: r.adaptive, suggestion: r.suggestion ?? null } : { complete: false });
    });

  const range = `${fmtDate(locale, weekStart)} – ${fmtDate(locale, weekEnd)}`;

  return (
    <Card className="mb-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarCheck size={20} className="text-accent" aria-hidden />
        <h2 className="font-semibold">{t("checkin.title", { range })}</h2>
      </div>

      {!result ? (
        <>
          <p className="text-sm text-muted">{t("checkin.stats", { kcal: fmt(locale, avgKcal), days })}</p>
          <p className="text-[15px]">{t("checkin.question")}</p>
          <p className="text-xs text-muted">{t("checkin.why")}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={pending} onClick={() => answer(true)}>{t("checkin.yes")}</Button>
            <Button variant="secondary" disabled={pending} onClick={() => answer(false)}>{t("checkin.no")}</Button>
          </div>
        </>
      ) : !result.complete ? (
        <>
          <p className="text-sm">{t("checkin.noResult")}</p>
          <Button variant="secondary" onClick={() => router.refresh()}>{t("common.done")}</Button>
        </>
      ) : (
        <>
          {result.adaptive.status === "insufficient" ? (
            <>
              <p className="text-sm">{t("checkin.notYet")}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{result.adaptive.reasons.map((r) => <li key={r}>{t(`targets.reason.${r}`)}</li>)}</ul>
            </>
          ) : (
            <p className="text-sm">{t("checkin.trend", { kg: fmt(locale, result.adaptive.kgPerWeek, 2), tdee: fmt(locale, result.adaptive.tdee) })}</p>
          )}
          {result.suggestion?.kind === "change" ? (
            <Notice tone="accent">
              <p>{t(`targets.reason.${result.suggestion.reason}`)} {t("targets.suggested", { kcal: fmt(locale, result.suggestion.kcal) })}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" disabled={pending} onClick={() => start(async () => {
                  const s = result.suggestion as Extract<TargetSuggestion, { kind: "change" }>;
                  const r = await saveTarget({ kcal: s.kcal, protein, goal, source: "suggestion" });
                  toast({ text: r.error ? t("common.error") : t("common.saved") });
                  router.refresh();
                })}>{t("common.accept")}</Button>
                <Button size="sm" variant="ghost" onClick={() => router.refresh()}>{t("common.reject")}</Button>
              </div>
            </Notice>
          ) : (
            <>
              {result.suggestion && result.adaptive.status !== "insufficient" && <p className="text-sm text-muted">{t(`targets.reason.${result.suggestion.reason}`)}</p>}
              {!result.suggestion && result.adaptive.status !== "insufficient" && <p className="text-sm text-muted">{t("checkin.setGoal")}</p>}
              <Button variant="secondary" onClick={() => router.refresh()}>{t("common.done")}</Button>
            </>
          )}
        </>
      )}
    </Card>
  );
}
