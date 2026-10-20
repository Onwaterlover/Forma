import { z } from "zod";
import { LOCATION_PRESETS } from "./equipment";
import { EQUIPMENT, KINDS, MUSCLES, type TrainingProfile } from "./types";

const weekday = z.number().int().min(0).max(6);

export const profileSchema = z.object({
  goal: z.enum(["muscle", "strength", "health", "conditioning", "sport", "start", "unsure"]),
  secondaryGoals: z.array(z.enum(["muscle", "strength", "health", "conditioning", "sport", "start", "unsure"])).max(3).optional(),
  experience: z.enum(["beginner", "intermediate", "advanced"]),
  sessionsPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(10).max(180),
  scheduleMode: z.enum(["fixed", "flexible"]),
  week: z.array(z.object({ locations: z.array(z.string().max(64)).max(10), rest: z.boolean().optional() })).length(7),
  locations: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().min(1).max(60),
        kind: z.enum(["gym", "home", "park", "outdoor", "other"]),
        equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length),
      }),
    )
    .min(1)
    .max(10),
  styles: z.array(z.enum(["machines", "free", "bodyweight"])).max(3),
  excludedKinds: z.array(z.enum(KINDS)).max(KINDS.length),
  priorities: z.partialRecord(z.enum(MUSCLES), z.enum(["high", "normal", "low", "maintain"])),
  sports: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        type: z.enum(["climbing", "bouldering", "cycling", "running", "football", "swimming", "martial_arts", "tennis", "other"]),
        name: z.string().max(60).optional(),
        days: z.array(weekday).max(7),
        perWeek: z.number().int().min(0).max(14),
        minutes: z.number().int().min(0).max(600).optional(),
        intensity: z.enum(["easy", "moderate", "hard"]).optional(),
        demands: z.array(z.enum(["legs", "pull", "push", "grip", "full"])).optional(),
      }),
    )
    .max(10),
  supersets: z.enum(["allow", "avoid"]),
  conditioning: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

const LEGACY_STYLE: Record<string, TrainingProfile["styles"]> = { machines: ["machines"], free: ["free"], bodyweight: ["bodyweight"], mixed: ["machines", "free"], none: [] };

export function parseProfile(data: unknown): TrainingProfile {
  // Profiles saved before multi-select styles stored a single "style" value.
  if (data && typeof data === "object" && !("styles" in data) && "style" in data) {
    const { style, ...rest } = data as Record<string, unknown>;
    data = { ...rest, styles: LEGACY_STYLE[String(style)] ?? [] };
  }
  const p = profileSchema.parse(data) as TrainingProfile;
  p.styles = [...new Set(p.styles)];
  const ids = new Set(p.locations.map((l) => l.id));
  // Drop references to locations that no longer exist instead of failing later.
  p.week = p.week.map((d) => ({ ...d, locations: d.locations.filter((l) => ids.has(l)) }));
  return p;
}

export function defaultProfile(): TrainingProfile {
  return {
    goal: "unsure",
    experience: "beginner",
    sessionsPerWeek: 3,
    sessionMinutes: 45,
    scheduleMode: "fixed",
    week: [
      { locations: ["gym"] }, { locations: [] }, { locations: ["gym"] }, { locations: [] },
      { locations: ["gym"] }, { locations: [] }, { locations: [], rest: true },
    ],
    locations: [{ id: "gym", name: "Siłownia", kind: "gym", equipment: [...LOCATION_PRESETS.commercial_gym!.equipment] }],
    styles: [],
    excludedKinds: [],
    priorities: {},
    sports: [],
    supersets: "allow",
  };
}
