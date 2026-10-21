import type { Exercise, ExercisePref } from "./types";

export type Trait = "favorite" | "unilateral" | "machine" | "bodyweight" | "loadable" | "stable" | "easy" | "technical" | "compound" | "isolation";

const LOADABLE = new Set(["total", "per_dumbbell", "per_side", "bodyweight_plus"]);

/**
 * Up to two short, factual reasons to pick (or not pick) an exercise, derived from its properties.
 * Used in the plan review so "Recommended" and the alternatives explain themselves.
 */
export function traitsOf(ex: Exercise, pref?: ExercisePref): Trait[] {
  const all: (Trait | false)[] = [
    (pref === "favorite" || pref === "like") && "favorite",
    !!ex.unilateral && "unilateral",
    (ex.kind === "machine" || ex.kind === "cable" || ex.kind === "smith") && "machine",
    (ex.kind === "bodyweight" || ex.kind === "band") && "bodyweight",
    LOADABLE.has(ex.loading) && "loadable",
    ex.stable && "stable",
    ex.skill === 1 ? "easy" : ex.skill === 3 && "technical",
    ex.mechanics === "compound" ? "compound" : "isolation",
  ];
  return all.filter((t): t is Trait => !!t).slice(0, 2);
}
