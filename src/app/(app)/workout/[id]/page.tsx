import { notFound } from "next/navigation";
import { suggestNext } from "@/engine/progression";
import { pageCtx } from "@/lib/ctx";
import { exerciseHistory, getCustomExercises, getPlan, getPrefs, getProfile, getWorkout, libraryFor } from "@/lib/data";
import { WorkoutLogger, type ExerciseInfo } from "./logger";

export const dynamic = "force-dynamic";

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, settings } = await pageCtx();
  const workout = getWorkout(user.id, id);
  if (!workout) notFound();
  const library = libraryFor(user.id);

  const info: Record<string, ExerciseInfo> = {};
  const ids = new Set(workout.exercises.map((e) => e.exerciseId));
  for (const exId of ids) {
    const ex = library.find((e) => e.id === exId);
    const target = workout.exercises.find((e) => e.exerciseId === exId)?.target;
    // History before this workout only.
    const hist = exerciseHistory(user.id, exId, 4).filter((h) => h.date < workout.startedAt);
    info[exId] = {
      last: hist[0] ? { date: hist[0].date, sets: hist[0].sets.filter((s) => s.completed && s.type !== "warmup").map((s) => ({ w: s.weightKg, r: s.reps, d: s.durationS ?? null })) } : null,
      suggestion: ex && target ? suggestNext(ex, target, hist) : null,
    };
  }

  const plan = workout.planId ? getPlan(user.id, workout.planId) : null;
  const originalIds = plan?.data.sessions.find((s) => s.key === workout.sessionKey)?.exercises.map((e) => e.exerciseId) ?? null;

  return (
    <WorkoutLogger
      initial={workout}
      info={info}
      profile={getProfile(user.id)}
      prefs={getPrefs(user.id)}
      custom={getCustomExercises(user.id)}
      settings={{ restTimer: settings.restTimer, autoTimer: settings.autoTimer, showEffort: settings.showEffort, logMode: settings.logMode }}
      originalIds={originalIds}
    />
  );
}
