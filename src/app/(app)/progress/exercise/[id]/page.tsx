import { notFound } from "next/navigation";
import { TrendChart } from "@/components/charts";
import { Card, Empty, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { exerciseTrend } from "@/engine/progression";
import { exName, fmt, fmtDate } from "@/i18n";
import { pageCtx } from "@/lib/ctx";
import { exerciseHistory, libraryFor } from "@/lib/data";
import { metricLabel, metricUnit, setText } from "../../sets";

export const dynamic = "force-dynamic";

export default async function ExerciseProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, locale, t } = await pageCtx();
  const ex = (await libraryFor(user.id)).find((e) => e.id === id);
  if (!ex) notFound();
  const { metric, points } = exerciseTrend(ex, await exerciseHistory(user.id, ex.id, 200));
  const plotted = points.flatMap((p) => (p.value === null ? [] : [{ ...p, value: p.value }]));
  const first = plotted[0];
  const latest = plotted.at(-1);
  const unit = metricUnit(t, metric);
  const label = metricLabel(t, metric);
  const delta = first && latest && plotted.length > 1 ? latest.value - first.value : null;

  return (
    <>
      <PageHeader back={{ href: "/progress", label: t("progress.title") }} title={exName(ex, locale)} />
      {points.length === 0 || !latest ? <Empty>{t("progress.noRecords")}</Empty> : (
        <>
          <Card className="space-y-4">
            <div>
              <h2 className="text-sm text-muted">{label}</h2>
              <p className="text-3xl font-semibold tabular-nums">{fmt(locale, latest.value, 1)} <span className="text-base font-normal text-muted">{unit}</span></p>
              {delta !== null && (
                <p className="text-sm text-muted">{t("progress.since", { delta: `${delta > 0 ? "+" : ""}${fmt(locale, delta, 1)} ${unit}`, date: fmtDate(locale, first!.date) })}</p>
              )}
            </div>
            {plotted.length > 1
              ? <TrendChart label={`${exName(ex, locale)}: ${label}`} points={plotted.map((p) => ({ x: p.date.slice(0, 10), raw: p.value, trend: p.value }))} />
              : <p className="text-sm text-muted">{t("progress.trendLowData")}</p>}
            {metric === "e1rm" && <Notice>{t("progress.e1rmNote")}</Notice>}
            {metric === "assistance" && <Notice>{t("progress.assistanceNote")}</Notice>}
          </Card>

          <SectionTitle>{t("progress.bestPerWorkout")}</SectionTitle>
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-border">
              {[...points].reverse().map((p) => (
                <li key={p.date} className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <span className="text-sm text-muted">{fmtDate(locale, p.date, { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className="text-right">
                    <span className="tabular-nums">{setText(t, locale, ex, p)}</span>
                    {metric === "e1rm" && p.e1rm !== null && (
                      <span className="block text-xs text-muted">{t("progress.e1rm")} ({t("workout.estimate")}): <span className="tabular-nums">{fmt(locale, p.e1rm, 1)} kg</span></span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
