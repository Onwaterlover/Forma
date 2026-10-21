import { normalize } from "@/import/parse";
import type { Exercise, Muscle } from "./types";

// Body-part categories for browsing exercises (library and "Add exercise").
export const REGIONS = ["chest", "back", "shoulders", "arms", "legs", "glutes", "core", "conditioning"] as const;
export type Region = (typeof REGIONS)[number];
const REGION_MUSCLES: Record<Exclude<Region, "conditioning">, Muscle[]> = {
  chest: ["chest"], back: ["lats", "upper_back", "lower_back"], shoulders: ["front_delts", "side_delts", "rear_delts"],
  arms: ["biceps", "triceps", "forearms"], legs: ["quads", "hamstrings", "adductors", "calves"], glutes: ["glutes"], core: ["abs"],
};
export const regionsOf = (e: Exercise): Region[] =>
  e.pattern === "conditioning"
    ? ["conditioning"]
    : (Object.keys(REGION_MUSCLES) as Exclude<Region, "conditioning">[]).filter((r) => e.primary.some((m) => REGION_MUSCLES[r].includes(m)));

/**
 * Search by any language's name or a common alias, ignoring case and Polish/German letters. Every typed word
 * must appear, in any order and possibly cut short ("brzuszki maszyn" finds "Brzuszki na maszynie").
 */
export function matchesQuery(e: Exercise, q: string): boolean {
  const words = normalize(q).split(" ").filter(Boolean);
  return !words.length || [e.name.pl, e.name.en, e.name.de, ...(e.aliases ?? [])].some((n) => {
    const c = normalize(n);
    return words.every((w) => c.includes(w));
  });
}
