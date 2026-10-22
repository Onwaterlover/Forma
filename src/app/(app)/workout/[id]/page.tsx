import { notFound } from "next/navigation";
import { suggestNext } from "@/engine/progression";
import { summarizeWorkout } from "@/engine/summary";
import { pageCtx, shiftDate, todayIso, weekdayOf } from "@/lib/ctx";
import { exerciseHistory, getActivePlan, getCustomExercises, getPlan, getPrefs, getProfile, getWorkout, libraryFor, workoutDatesSince } from "@/lib/data";
import { WorkoutLogger, type ExerciseInfo } from "./logger";
import { SummaryCard } from "./summary";

export const dynamic = "force-dynamic";

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, settings, t, locale } = await pageCtx();
  const workout = await getWorkout(user.id, id);
  if (!workout) notFound();
  const finished = workout.status !== "in_progress";
  const library = await libraryFor(user.id);
  const lookup = (exId: string) => library.find((e) => e.id === exId);

  const info: Record<string, ExerciseInfo> = {};
  const histories: Record<string, Awaited<ReturnType<typeof exerciseHistory>>> = {};
  await Promise.all([...new Set(workout.exercises.map((e) => e.exerciseId))].map(async (exId) => {
    const ex = lookup(exId);
    const target = workout.exercises.find((e) => e.exerciseId === exId)?.target;
    // History before this workout only (a longer window for records in the summary).
    const hist = (await exerciseHistory(user.id, exId, finished ? 50 : 4)).filter((h) => h.date < workout.startedAt);
    histories[exId] = hist;
    info[exId] = {
      last: hist[0] ? { date: hist[0].date, sets: hist[0].sets.filter((s) => s.completed && s.type !== "warmup").map((s) => ({ w: s.weightKg, r: s.reps, d: s.durationS ?? null })) } : null,
      suggestion: ex && target ? suggestNext(ex, target, hist.slice(0, 4)) : null,
    };
  }));

  const [plan, profile, prefs, custom] = await Promise.all([
    workout.planId ? getPlan(user.id, workout.planId) : null, getProfile(user.id), getPrefs(user.id), getCustomExercises(user.id),
  ]);
  const originalIds = plan?.data.sessions.find((s) => s.key === workout.sessionKey)?.exercises.map((e) => e.exerciseId) ?? null;
  // Superset pairs from the plan (exercise → group), so the workout shows them too.
  const supersets: Record<string, number> = Object.fromEntries(
    (plan?.data.sessions.find((s) => s.key === workout.sessionKey)?.exercises ?? []).filter((e) => e.superset !== undefined).map((e) => [e.exerciseId, e.superset!]),
  );

  let summary = null;
  if (finished && workout.notes !== "skipped" && workout.notes !== "postponed") {
    const today = todayIso();
    const [weekDates, active] = await Promise.all([workoutDatesSince(user.id, `${shiftDate(today, -weekdayOf(today))}T00:00`), getActivePlan(user.id)]);
    summary = (
      <SummaryCard
        s={summarizeWorkout(workout, lookup, histories)}
        status={workout.status === "completed" ? "completed" : "abandoned"}
        week={{ done: weekDates.length, planned: active?.data.sessions.length ?? null }}
        t={t}
        locale={locale}
      />
    );
  }

  return (
    <>
      <WorkoutLogger
        initial={workout}
        info={info}
        profile={profile}
        prefs={prefs}
        custom={custom}
        settings={{ restTimer: settings.restTimer, autoTimer: settings.autoTimer, showEffort: settings.showEffort, logMode: settings.logMode }}
        originalIds={originalIds}
        supersets={supersets}
        summary={summary}
      />
    </>
  );
}
