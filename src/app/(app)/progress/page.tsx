import { Bars, TrendChart } from "@/components/charts";
import { Card, Empty, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { personalRecords } from "@/engine/progression";
import { exName, fmt, fmtDate } from "@/i18n";
import { pageCtx, shiftDate, todayIso } from "@/lib/ctx";
import {
  currentTarget, exerciseHistory, getActivePlan, intakeHistory, libraryFor, listWeights, loggedExerciseIds, workoutDatesSince,
} from "@/lib/data";
import { weightTrend } from "@/nutrition/energy";
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

  const library = await libraryFor(user.id);
  const records = settings.modules.training
    ? (
        await Promise.all(
          (await loggedExerciseIds(user.id)).map(async (id) => {
            const ex = library.find((e) => e.id === id);
            return { ex, r: ex ? personalRecords(ex, await exerciseHistory(user.id, id, 50)) : { repsAtLoad: {} } };
          }),
        )
      )
        .filter((x) => x.ex && (x.r.maxLoad || x.r.bestE1rm))
        .slice(0, 12)
    : [];

  // Weekly review: short and honest; "no change needed" is a perfectly good answer.
  const review = plan && planned > 0
    ? perWeek.at(-2)!.value >= Math.ceil(planned * 0.75) ? t("progress.weeklyNoChange") : t("progress.weeklyLowData")
    : null;

  return (
    <>
      <PageHeader title={t("progress.title")} />

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
              {weeklyChange !== null && <p className="text-sm text-muted">{t("progress.weeklyChange", { kg: `${weeklyChange > 0 ? "+" : ""}${fmt(locale, weeklyChange, 2)}` })}</p>}
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
            <Card className="p-0 sm:p-0">
              <ul className="divide-y divide-border">
                {records.map(({ ex, r }) => (
                  <li key={ex!.id} className="px-4 py-3">
                    <p className="font-medium">{exName(ex, locale)}</p>
                    <p className="text-sm text-muted">
                      {r.maxLoad && <>{t("progress.maxLoad")}: <span className="tabular-nums text-text">{t("progress.repsAt", { reps: r.maxLoad.reps, weight: fmt(locale, r.maxLoad.weightKg, 2) })}{ex!.loading === "per_dumbbell" ? ` ${t("workout.perDumbbell")}` : ""}</span></>}
                      {r.bestE1rm && <> · {t("progress.e1rm")} ({t("workout.estimate")}): <span className="tabular-nums text-text">{fmt(locale, r.bestE1rm.value, 1)} kg</span></>}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="px-4 pb-3 text-xs text-muted">{t("progress.e1rmNote")}</p>
            </Card>
          )}
        </>
      )}

      <p className="mt-6 text-xs text-muted">{t("progress.comingSoon")}</p>
    </>
  );
}
