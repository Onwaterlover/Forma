import { Bars, Sparkline, TrendChart } from "@/components/charts";
import { Camera, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Card, Empty, LinkButton, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { bestPoint, exerciseTrend, personalRecords } from "@/engine/progression";
import { exName, fmt, fmtDate } from "@/i18n";
import { pageCtx, shiftDate, todayIso } from "@/lib/ctx";
import {
  currentTarget, exerciseHistory, getActivePlan, intakeHistory, libraryFor, listMeasurements, listWeights, loggedExerciseIds, workoutDatesSince,
} from "@/lib/data";
import { measurementTrends } from "@/lib/measurements";
import { weightTrend } from "@/nutrition/energy";
import { MeasurementForm } from "./measurement-form";
import { metricLabel, metricUnit } from "./sets";
import { WeightForm } from "./weight-form";

export const dynamic = "force-dynamic";

const mondayOf = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export default async function ProgressPage() {
  const { user, locale, t, settings } = await pageCtx();
  const today = todayIso();

  const weights = await listWeights(user.id, shiftDate(today, -120));
  const trend = weightTrend(weights);
  const last = trend.at(-1);
  const weekAgo = [...trend].reverse().find((p) => p.date <= shiftDate(today, -7));
  const weeklyChange = last && weekAgo && last.date !== weekAgo.date ? ((last.trend - weekAgo.trend) / ((Date.parse(last.date) - Date.parse(weekAgo.date)) / 86_400_000)) * 7 : null;
  const signed = (n: number, digits: number) => `${n > 0 ? "+" : ""}${fmt(locale, n, digits)}`;

  const measurements = await listMeasurements(user.id);
  const sites = measurementTrends(measurements);

  const intake = settings.modules.nutrition ? await intakeHistory(user.id, shiftDate(today, -13)) : [];
  const target = await currentTarget(user.id);
  const calDays = Array.from({ length: 14 }, (_, i) => shiftDate(today, i - 13));
  const calData = calDays.map((d) => ({ label: d.slice(8), value: intake.find((x) => x.date === d)?.kcal ?? 0 }));
  const logged = intake.filter((x) => x.kcal > 0);
  const avg = logged.length ? logged.reduce((a, x) => a + x.kcal, 0) / logged.length : null;

  const since = mondayOf(shiftDate(today, -7 * 7));
  const dates = settings.modules.training ? await workoutDatesSince(user.id, since) : [];
  const weeks = Array.from({ length: 8 }, (_, i) => mondayOf(shiftDate(today, (i - 7) * 7)));
  const perWeek = weeks.map((w) => ({ label: fmtDate(locale, w, { day: "numeric", month: "numeric" }), value: dates.filter((d) => mondayOf(d) === w).length }));
  const plan = settings.modules.training ? await getActivePlan(user.id) : null;
  const planned = plan?.data.sessions.length ?? 0;
  const thisWeek = perWeek.at(-1)!.value;

  // Every logged exercise, most recently trained first; each row opens its trend.
  const library = await libraryFor(user.id);
  const records = settings.modules.training
    ? (
        await Promise.all(
          (await loggedExerciseIds(user.id)).map(async (id) => {
            const ex = library.find((e) => e.id === id);
            if (!ex) return [];
            const history = await exerciseHistory(user.id, id, 50);
            const trend = exerciseTrend(ex, history);
            const best = bestPoint(trend);
            return history[0] && best ? [{ ex, last: history[0].date, r: personalRecords(ex, history), best, metric: trend.metric }] : [];
          }),
        )
      )
        .flat()
        .sort((a, b) => b.last.localeCompare(a.last))
    : [];
  const recordRow = ({ ex, r, best, metric }: (typeof records)[number]) => (
    <li key={ex.id}>
      <Link href={`/progress/exercise/${ex.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{exName(ex, locale)}</p>
          <p className="text-sm text-muted">
            {r.maxLoad || r.bestE1rm ? (
              <>
                {r.maxLoad && <>{t("progress.maxLoad")}: <span className="tabular-nums text-text">{t("progress.repsAt", { reps: r.maxLoad.reps, weight: fmt(locale, r.maxLoad.weightKg, 2) })}{ex.loading === "per_dumbbell" ? ` ${t("workout.perDumbbell")}` : ""}</span></>}
                {r.bestE1rm && <> · {t("progress.e1rm")} ({t("workout.estimate")}): <span className="tabular-nums text-text">{fmt(locale, r.bestE1rm.value, 1)} kg</span></>}
              </>
            ) : (
              <>{metricLabel(t, metric)}: <span className="tabular-nums text-text">{fmt(locale, best.value, 1)} {metricUnit(t, metric)}</span></>
            )}
          </p>
        </div>
        <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );

  // Weekly review: short and honest; "no change needed" is a perfectly good answer.
  const review = plan && planned > 0
    ? perWeek.at(-2)!.value >= Math.ceil(planned * 0.75) ? t("progress.weeklyNoChange") : t("progress.weeklyLowData")
    : null;

  return (
    <>
      <PageHeader title={t("progress.title")} action={<LinkButton href="/progress/photos" variant="secondary" size="sm"><Camera size={16} aria-hidden />{t("progress.photos")}</LinkButton>} />

      {review && (
        <Card className="mb-4">
          <h2 className="font-semibold">{t("progress.weekly")}</h2>
          <p className="mt-1 text-sm">{t("progress.weeklyWorkouts", { done: thisWeek, planned })}</p>
          <p className="mt-1 text-sm text-muted">{review}</p>
        </Card>
      )}

      <SectionTitle>{t("progress.bodyweight")}</SectionTitle>
      <Card className="space-y-4">
        <WeightForm today={today} />
        {trend.length === 0 ? (
          <p className="text-sm text-muted">{t("progress.noWeight")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p className="text-3xl font-semibold tabular-nums">{fmt(locale, last!.trend, 1)} <span className="text-base font-normal text-muted">kg · {t("progress.trend").toLowerCase()}</span></p>
              {weeklyChange !== null && <p className="text-sm text-muted">{t("progress.weeklyChange", { kg: signed(weeklyChange, 2) })}</p>}
            </div>
            <TrendChart label={t("progress.bodyweight")} points={trend.map((p) => ({ x: p.date, raw: p.kg, trend: p.trend }))} />
            <p className="flex gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-accent" />{t("progress.trend")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted opacity-60" />{t("progress.raw")}</span>
            </p>
            <Notice>{t("progress.fluctuation")}</Notice>
          </>
        )}
      </Card>

      <SectionTitle>{t("progress.measurements")}</SectionTitle>
      <Card className="space-y-3">
        {sites.length === 0 ? <p className="text-sm text-muted">{t("progress.noMeasurements")}</p> : (
          <ul className="divide-y divide-border">
            {sites.map((s) => (
              <li key={s.site} className="flex items-center gap-3 py-2.5 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t(`progress.sites.${s.site}`)}</p>
                  <p className="text-xs text-muted">
                    {s.change === null ? fmtDate(locale, s.latest.date) : t("progress.since", { delta: `${signed(s.change, 1)} cm`, date: fmtDate(locale, s.first.date) })}
                  </p>
                </div>
                <Sparkline label={t(`progress.sites.${s.site}`)} points={s.points.map((p) => ({ x: p.date, y: p.cm }))} />
                <p className="w-24 shrink-0 text-right text-lg font-semibold tabular-nums">{fmt(locale, s.latest.cm, 1)} <span className="text-sm font-normal text-muted">cm</span></p>
              </li>
            ))}
          </ul>
        )}
        <MeasurementForm today={today} existing={measurements} />
      </Card>

      {settings.modules.nutrition && (
        <>
          <SectionTitle>{t("progress.calories")}</SectionTitle>
          <Card>
            {logged.length === 0 ? <p className="text-sm text-muted">{t("nutrition.empty")}</p> : (
              <>
                <Bars data={calData} label={t("progress.calories")} refLine={target?.kcal} />
                {avg !== null && <p className="mt-2 text-sm text-muted">{t("progress.avg", { n: fmt(locale, avg) })}</p>}
              </>
            )}
          </Card>
        </>
      )}

      {settings.modules.training && (
        <>
          <SectionTitle>{t("progress.workoutsPerWeek")}</SectionTitle>
          <Card><Bars data={perWeek} label={t("progress.workoutsPerWeek")} refLine={planned || null} /></Card>

          <SectionTitle>{t("progress.records")}</SectionTitle>
          {records.length === 0 ? <Empty>{t("progress.noRecords")}</Empty> : (
            <Card className="overflow-hidden p-0 sm:p-0">
              <ul className="divide-y divide-border">{records.slice(0, 8).map(recordRow)}</ul>
              {records.length > 8 && (
                <details className="group border-t border-border">
                  <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-accent">
                    <span className="group-open:hidden">{t("progress.showAll", { n: records.length })}</span>
                    <span className="hidden group-open:inline">{t("common.hide")}</span>
                  </summary>
                  <ul className="divide-y divide-border border-t border-border">{records.slice(8).map(recordRow)}</ul>
                </details>
              )}
              <p className="border-t border-border px-4 py-3 text-xs text-muted">{t("progress.e1rmNote")}</p>
            </Card>
          )}
        </>
      )}
    </>
  );
}
