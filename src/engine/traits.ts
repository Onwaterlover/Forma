import type { Exercise, ExercisePref, Experience } from "./types";

export type Trait = "favorite" | "forAdvanced" | "tooEasy" | "unilateral" | "machine" | "bodyweight" | "loadable" | "stable" | "easy" | "technical" | "compound" | "isolation";

const LOADABLE = new Set(["total", "per_dumbbell", "per_side", "bodyweight_plus"]);

/**
 * Up to two short, factual reasons to pick (or not pick) an exercise, derived from its properties.
 * Used in the plan review so "Recommended" and the alternatives explain themselves.
 */
export function traitsOf(ex: Exercise, pref?: ExercisePref, experience?: Experience): Trait[] {
  const all: (Trait | false)[] = [
    (pref === "favorite" || pref === "like") && "favorite",
    // Level relative to the user: hard-to-learn lifts for beginners, easy bodyweight moves for experienced lifters.
    experience === "beginner" && ex.skill === 3 && "forAdvanced",
    !!experience && experience !== "beginner" && ex.kind === "bodyweight" && ex.skill === 1 && ex.mechanics === "compound" && "tooEasy",
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
