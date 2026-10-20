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

    const partnerIdx = pe.superset === undefined ? -1 : exercises.findIndex((o, j) => j > i && o.superset === pe.superset);
    if (partnerIdx >= 0) {
      const partner = exercises[partnerIdx]!;
      done.add(partnerIdx);
      const rounds = Math.max(pe.sets, partner.sets);
      total += rounds * (workSec(pe, ex) + workSec(partner, lookup(partner.exerciseId)) + TIME.supersetSwitchSec);
      total += (rounds - 1) * Math.max(pe.restSec, partner.restSec);
    } else {
      total += pe.sets * workSec(pe, ex) + (pe.sets - 1) * pe.restSec;
    }
    total += TIME.transitionSec;
  });
  return total;
}

export const estimateMinutes = (exercises: PlannedExercise[], lookup: Lookup) =>
  Math.ceil(estimateSeconds(exercises, lookup) / 60);
