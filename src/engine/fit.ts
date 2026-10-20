import { estimateMinutes } from "./duration";
import { REST } from "./prescribe";
import type { Exercise, Message, Pattern, PlannedExercise, TrainingProfile } from "./types";

type Lookup = (id: string) => Exercise | undefined;

// Antagonist / non-competing pairs that work as time-saving supersets.
const PAIRS: [Pattern, Pattern][] = [
  ["h_push", "h_pull"], ["v_push", "v_pull"], ["h_push", "v_pull"], ["v_push", "h_pull"],
  ["elbow_flex", "elbow_ext"], ["lateral_raise", "rear_delt"], ["chest_fly", "rear_delt"],
  ["lateral_raise", "elbow_flex"], ["calf", "lateral_raise"], ["knee_flex", "knee_ext"], ["core", "elbow_ext"],
];

const HEAVY_LOWER: Pattern[] = ["squat", "hinge"];

export function canPair(a: Exercise, b: Exercise): boolean {
  if (a.pattern === "conditioning" || b.pattern === "conditioning") return false;
  if ((a.fatigue === "high" && HEAVY_LOWER.includes(a.pattern)) || (b.fatigue === "high" && HEAVY_LOWER.includes(b.pattern))) return false;
  return PAIRS.some(([x, y]) => (a.pattern === x && b.pattern === y) || (a.pattern === y && b.pattern === x));
}

/** Put superset partners next to each other, keeping the first one's position. */
export function groupSupersets(list: PlannedExercise[]): PlannedExercise[] {
  const out: PlannedExercise[] = [];
  const taken = new Set<number>();
  list.forEach((pe, i) => {
    if (taken.has(i)) return;
    out.push(pe);
    if (pe.superset === undefined) return;
    const j = list.findIndex((o, k) => k > i && o.superset === pe.superset);
    if (j >= 0) {
      out.push(list[j]!);
      taken.add(j);
    }
  });
  return out;
}

function addSupersets(list: PlannedExercise[], lookup: Lookup, limit: number): boolean {
  let added = false;
  let group = Math.max(0, ...list.map((e) => e.superset ?? 0)) + 1;
  for (let i = 0; i < list.length; i++) {
    if (estimateMinutes(list, lookup) <= limit) break;
    const a = list[i]!;
    const ea = lookup(a.exerciseId);
    if (a.superset !== undefined || !ea) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]!;
      const eb = lookup(b.exerciseId);
      if (b.superset !== undefined || !eb || !canPair(ea, eb)) continue;
      a.superset = group;
      b.superset = group;
      group++;
      added = true;
      break;
    }
  }
  return added;
}

/**
 * Shrinks a session until its estimate fits the time limit, cutting the least important work first.
 * Every cut is reported; nothing is dropped silently.
 */
export function fitToTime(
  input: PlannedExercise[],
  limit: number,
  p: Pick<TrainingProfile, "supersets" | "experience">,
  lookup: Lookup,
): { exercises: PlannedExercise[]; tradeoffs: Message[] } {
  let list = input.map((e) => ({ ...e }));
  const tradeoffs: Message[] = [];
  const fits = () => estimateMinutes(list, lookup) <= limit;
  if (fits()) return { exercises: list, tradeoffs };

  const trySupersets = () => {
    if (p.supersets === "allow" && addSupersets(list, lookup, limit)) {
      list = groupSupersets(list);
      tradeoffs.push({ code: "supersets_added" });
    }
  };
  const removeByPriority = (prio: 1 | 2 | 3, code: string, keepAtLeast = 0) => {
    const removed: string[] = [];
    while (!fits() && list.length > keepAtLeast) {
      const idx = list.map((e) => e.priority).lastIndexOf(prio);
      if (idx < 0) break;
      const [gone] = list.splice(idx, 1);
      removed.push(gone!.exerciseId);
      // A superset partner left alone is just a normal exercise again.
      if (gone!.superset !== undefined) list.forEach((e) => e.superset === gone!.superset && delete e.superset);
    }
    if (removed.length) tradeoffs.push({ code, params: { exercises: removed.join(",") } });
  };

  // Beginners get fewer moving parts: drop optional work before introducing supersets.
  if (p.experience !== "beginner") trySupersets();
  if (!fits()) removeByPriority(3, "optional_removed");
  if (!fits() && p.experience === "beginner") trySupersets();

  if (!fits()) {
    let changed = false;
    for (const e of list) {
      const ex = lookup(e.exerciseId);
      const min = ex?.mechanics === "compound" ? REST.minCompound : REST.minIsolation;
      if (e.restSec > min) {
        e.restSec = min;
        changed = true;
      }
    }
    if (changed) tradeoffs.push({ code: "rest_shortened" });
  }

  for (const prio of [2, 1] as const) {
    if (fits()) break;
    let changed = false;
    for (const e of list) {
      if (e.priority === prio && e.sets > 2) {
        e.sets = 2;
        changed = true;
      }
    }
    if (changed) tradeoffs.push({ code: "sets_reduced" });
  }

  if (!fits()) removeByPriority(2, "important_removed", 2);
  if (!fits()) {
    // Very short sessions: one hard set per exercise still provides a meaningful stimulus.
    let changed = false;
    for (const e of list.slice(1)) {
      if (e.sets > 1 && !e.seconds) {
        e.sets = 1;
        changed = true;
      }
    }
    if (changed) tradeoffs.push({ code: "single_sets" });
  }
  if (!fits()) removeByPriority(1, "main_removed", 2);
  if (!fits()) tradeoffs.push({ code: "still_over_time", params: { minutes: estimateMinutes(list, lookup), limit } });
  return { exercises: list, tradeoffs };
}
