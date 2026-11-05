import { Bars, Sparkline, TrendChart } from "@/components/charts";
import { Camera, ChevronRight, CircleCheck } from "lucide-react";
import Link from "next/link";
import { Card, Empty, LinkButton, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { bestPoint, exerciseTrend, personalRecords } from "@/engine/progression";
import { exName, fmt, fmtDate } from "@/i18n";
import { pageCtx, shiftDate, todayIso } from "@/lib/ctx";
import {
  currentTarget, exerciseHistory, getActivePlan, intakeHistory, libraryFor, listMeasurements, listWeights, listWorkouts, loggedExerciseIds,
} from "@/lib/data";
import { measurementTrends } from "@/lib/measurements";
import { weeklyReview, type Goal } from "@/lib/review";
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

  const plan = settings.modules.training ? await getActivePlan(user.id) : null;
  const planned = plan?.data.sessions.length ?? 0;

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

  // Last full week (Monday to Sunday) in a few facts from the user's own data and at most one tip; "nothing to
  // change" is a perfectly good answer.
  const weekStart = shiftDate(mondayOf(today), -7);
  const weekEnd = shiftDate(weekStart, 6);
  const inWeek = (iso: string, from = weekStart, to = weekEnd) => iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const recent = settings.modules.training ? await listWorkouts(user.id, 60) : [];
  const doneIn = (from: string, to: string) => recent.filter((w) => w.status === "completed" && inWeek(w.started_at, from, to));
  const review = weeklyReview({
    goal: settings.weightGoal ?? ((target?.goal as Goal) || null),
    trend,
    days: intake.filter((d) => d.kcal > 0 && inWeek(d.date)).map((d) => ({ kcal: d.kcal, protein: d.protein })),
    target: target ? { kcal: target.kcal, protein: target.protein_g } : null,
    workouts: {
      // Workouts planned count only for a week the plan existed throughout (a new plan has nothing to miss yet).
      done: doneIn(weekStart, weekEnd).length, planned: plan && plan.created_at.slice(0, 10) <= weekStart ? planned || null : null,
      sets: doneIn(weekStart, weekEnd).reduce((a, w) => a + w.logged_sets, 0),
      setsBefore: doneIn(shiftDate(weekStart, -7), shiftDate(weekStart, -1)).reduce((a, w) => a + w.logged_sets, 0),
    },
    weekStart, weekEnd,
  });
  const tipText = (() => {
    const tip = review.tip;
    switch (tip.key) {
      case "underlog": return t("progress.review.underlog", { kcal: fmt(locale, tip.kcal) });
      case "tooFast": return t("progress.review.tooFast", { pct: fmt(locale, tip.pct, 1) });
      case "drift": return t(`progress.review.drift_${tip.dir}`);
      case "protein": return t("progress.review.protein", { avg: fmt(locale, tip.avg), target: fmt(locale, tip.target) });
      case "fewerWorkouts": return t("progress.review.fewerWorkouts", { done: tip.done, planned: tip.planned });
      default: return t(`progress.review.${tip.key}`);
    }
  })();

  return (
    <>
      <PageHeader title={t("progress.title")} action={<LinkButton href="/progress/photos" variant="secondary" size="sm"><Camera size={16} aria-hidden />{t("progress.photos")}</LinkButton>} />

      {/* Last week in one sentence (green when on track); the numbers are folded under "Details". */}
      <Card className="mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-muted">{t("progress.review.title", { range: `${fmtDate(locale, weekStart, { day: "numeric", month: "short" })} – ${fmtDate(locale, weekEnd, { day: "numeric", month: "short" })}` })}</h2>
        <Notice tone={review.tip.key === "keep" ? "accent" : "neutral"} className={review.tip.key === "keep" ? "border border-accent/40" : undefined}>
          <span className="flex items-start gap-2">
            {review.tip.key === "keep" && <CircleCheck size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />}
            <span className={review.tip.key === "keep" ? "font-medium text-accent" : undefined}>{tipText}</span>
          </span>
        </Notice>
        {(review.weight !== null || review.food || review.training) && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">{t("progress.review.details")}</summary>
            <ul className="mt-1.5 space-y-1">
            {review.weight !== null && <li>{t("progress.review.weight", { delta: signed(review.weight, 2) })}</li>}
            {review.food && (
              <li>
                {t("progress.review.food", { kcal: fmt(locale, review.food.kcal), days: review.food.days })}
                {target?.kcal ? <span className="text-muted"> · {t("progress.review.target", { n: fmt(locale, target.kcal) })}</span> : null}
                {target?.protein_g ? <span className="text-muted"> · {t("progress.review.protein_line", { g: fmt(locale, review.food.protein), target: fmt(locale, target.protein_g) })}</span> : null}
              </li>
            )}
            {review.training && (
              <li>
                {review.training.planned ? t("progress.review.training", { done: review.training.done, planned: review.training.planned }) : t("progress.review.trainingNoPlan", { done: review.training.done })}
                {review.training.sets > 0 && <span className="text-muted"> · {t("progress.review.sets", { n: review.training.sets })}{review.training.setsBefore > 0 ? ` (${signed(review.training.sets - review.training.setsBefore, 0)})` : ""}</span>}
              </li>
            )}
            </ul>
          </details>
        )}
      </Card>

      <SectionTitle>{t("progress.bodyweight")}</SectionTitle>
      <Card className="space-y-4">
        <WeightForm today={today} known={Object.fromEntries(weights.map((w) => [w.date, w.kg]))} when={Object.fromEntries(weights.flatMap((w) => {
          // Time of day of the weigh-in (only when it was entered on that day): before 12 morning, from 18 evening.
          const local = new Date(w.created_at).toLocaleString("sv-SE", { timeZone: process.env.APP_TIME_ZONE || "Europe/Warsaw" });
          if (local.slice(0, 10) !== w.date) return [];
          const h = Number(local.slice(11, 13));
          return [[w.date, h < 12 ? "morning" : h >= 18 ? "evening" : "day"]];
        }))} />
        {trend.length === 0 ? (
          <p className="text-sm text-muted">{t("progress.noWeight")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p className="text-3xl font-semibold tabular-nums">{fmt(locale, last!.trend, 1)} <span className="text-base font-normal text-muted">kg · {t("progress.trend").toLowerCase()}</span></p>
              {weeklyChange !== null && <p className="text-sm text-muted">{t("progress.weeklyChange", { kg: signed(weeklyChange, 2) })}</p>}
            </div>
            {/* One point draws an empty frame; the chart appears from the second weigh-in. */}
            {trend.length < 2 ? (
              <p className="text-sm text-muted">{t("progress.chartSoon")}</p>
            ) : (
              <>
                <TrendChart label={t("progress.bodyweight")} points={trend.map((p) => ({ x: p.date, raw: p.kg, trend: p.trend }))} />
                <p className="flex gap-4 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-accent" />{t("progress.trend")}</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted opacity-60" />{t("progress.raw")}</span>
                </p>
              </>
            )}
            <Notice>{t("progress.fluctuation")}</Notice>
          </>
        )}
      </Card>

      {sites.length === 0 ? (
        // Optional: until the first measurement it is a single collapsed line.
        <details className="mt-6 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <summary className="cursor-pointer list-none font-semibold">{t("progress.measurements")} <span className="font-normal text-muted">· {t("common.optional")}</span></summary>
          <div className="mt-3 space-y-3">
            <p className="text-sm text-muted">{t("progress.noMeasurements")}</p>
            <MeasurementForm today={today} existing={measurements} />
          </div>
        </details>
      ) : (
      <>
      <SectionTitle>{t("progress.measurements")}</SectionTitle>
      <Card className="space-y-3">
        {(
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
      </>
      )}

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
          {records.length > 0 && (
            // Folded away by default: useful now and then, not every day.
            <details className="group mt-6">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 text-sm font-medium">
                {t("progress.records")} ({records.length})
                <ChevronRight size={16} className="text-muted transition-transform group-open:rotate-90" aria-hidden />
              </summary>
            <Card className="mt-2 overflow-hidden p-0 sm:p-0">
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
            </details>
          )}
        </>
      )}
    </>
  );
}
