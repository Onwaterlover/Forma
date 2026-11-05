import type { Exercise, PlannedExercise } from "./types";

// Session time model. Assumptions are deliberately explicit so they can be checked against logged durations.
export const TIME = {
  prepSec: 120,            // getting ready, first equipment set-up
  generalWarmupSec: 180,   // light general warm-up
  firstCompoundWarmupSec: 120, // ~2 ramp-up sets before the first loaded compound
  laterHeavyWarmupSec: 60, // one ramp-up set before later heavy compounds
  secPerRep: 3.5,
  setSetupSec: 15,
  transitionSec: 60,       // moving to the next exercise / changing equipment
  supersetSwitchSec: 15,
  unilateralFactor: 1.8,   // both sides, short switch between them
};

type Lookup = (id: string) => Exercise | undefined;

function workSec(pe: PlannedExercise, ex?: Exercise): number {
  if (pe.seconds) return pe.seconds + 10;
  const reps = ((pe.repMin + pe.repMax) / 2) * TIME.secPerRep * (ex?.unilateral ? TIME.unilateralFactor : 1);
  return reps + TIME.setSetupSec;
}

const isLoaded = (ex: Exercise) => !["bodyweight", "time"].includes(ex.loading);

export function estimateSeconds(exercises: PlannedExercise[], lookup: Lookup): number {
  if (exercises.length === 0) return 0;
  let total = TIME.prepSec + TIME.generalWarmupSec;
  let firstCompoundDone = false;
  const done = new Set<number>();

  exercises.forEach((pe, i) => {
    if (done.has(i)) return;
    const ex = lookup(pe.exerciseId);
    if (ex && ex.mechanics === "compound" && isLoaded(ex) && ex.pattern !== "conditioning") {
      if (!firstCompoundDone) {
        total += TIME.firstCompoundWarmupSec;
        firstCompoundDone = true;
      } else if (ex.fatigue === "high") {
        total += TIME.laterHeavyWarmupSec;
      }
    }

    // A superset (two or three exercises) is done in rounds: one set of each, then the rest.
    const later = pe.superset === undefined ? [] : exercises.flatMap((o, j) => (j > i && o.superset === pe.superset ? [j] : []));
    if (later.length) {
      later.forEach((j) => done.add(j));
      const group = [pe, ...later.map((j) => exercises[j]!)];
      const rounds = Math.max(...group.map((x) => x.sets));
      total += rounds * (group.reduce((a, x) => a + workSec(x, lookup(x.exerciseId)), 0) + TIME.supersetSwitchSec * (group.length - 1));
      total += (rounds - 1) * Math.max(...group.map((x) => x.restSec));
    } else {
      total += pe.sets * workSec(pe, ex) + (pe.sets - 1) * pe.restSec;
    }
    total += TIME.transitionSec;
  });
  return total;
}

export const estimateMinutes = (exercises: PlannedExercise[], lookup: Lookup) =>
  Math.ceil(estimateSeconds(exercises, lookup) / 60);
