import { EQUIPMENT, type Capability, type Equipment, type Exercise, type Kind, type Location } from "./types";

export const LOCATION_PRESETS: Record<string, { kind: Location["kind"]; equipment: Equipment[] }> = {
  // A typical gym: everything ticked; the user unticks what their gym lacks.
  commercial_gym: { kind: "gym", equipment: [...EQUIPMENT] },
  home_dumbbells: { kind: "home", equipment: ["adjustable_dumbbells", "bench", "incline_bench"] },
  home_gym: {
    kind: "home",
    equipment: ["barbell", "plates", "adjustable_dumbbells", "bench", "incline_bench", "rack", "pullup_bar", "bands"],
  },
  calisthenics_park: { kind: "park", equipment: ["pullup_bar", "dip_bars", "low_bar"] },
  bodyweight_only: { kind: "home", equipment: [] },
};

export function hasCapability(equipment: readonly Equipment[], cap: Capability): boolean {
  if (cap === "dumbbells") return equipment.includes("adjustable_dumbbells") || equipment.includes("fixed_dumbbells");
  return equipment.includes(cap);
}

export function isPossible(ex: Exercise, equipment: readonly Equipment[], excludedKinds: readonly Kind[] = []): boolean {
  if (excludedKinds.includes(ex.kind)) return false;
  if (!ex.equipment.every((c) => hasCapability(equipment, c))) return false;
  if (ex.equipmentAnyOf && !ex.equipmentAnyOf.some((c) => hasCapability(equipment, c))) return false;
  return true;
}

/** Union of equipment across several locations (used when a day allows more than one). */
export function equipmentOf(locations: Location[], ids: string[]): Equipment[] {
  const set = new Set<Equipment>();
  for (const l of locations) if (ids.includes(l.id)) l.equipment.forEach((e) => set.add(e));
  return [...set];
}

/** Equipment categories the user can actually use somewhere (for showing only relevant choices). */
export function availableKinds(locations: Location[], library: Exercise[]): Set<Kind> {
  const all = new Set<Equipment>(locations.flatMap((l) => l.equipment));
  const eq = [...all];
  return new Set(library.filter((e) => isPossible(e, eq)).map((e) => e.kind));
}
