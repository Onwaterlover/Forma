// Core domain types for the training engine. Pure data, no I/O.

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const; // 0 = Monday
export type Weekday = (typeof WEEKDAYS)[number];

export const MUSCLES = [
  "chest", "lats", "upper_back", "front_delts", "side_delts", "rear_delts",
  "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "adductors", "calves", "abs", "lower_back",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const PATTERNS = [
  "squat", "hinge", "single_leg", "knee_ext", "knee_flex", "hip_ext", "calf",
  "h_push", "v_push", "chest_fly", "h_pull", "v_pull", "lateral_raise", "rear_delt",
  "elbow_flex", "elbow_ext", "core", "conditioning",
] as const;
export type Pattern = (typeof PATTERNS)[number];

export const EQUIPMENT = [
  "barbell", "plates", "adjustable_dumbbells", "fixed_dumbbells", "kettlebell", "bench", "incline_bench",
  "rack", "pullup_bar", "dip_bars", "low_bar", "rings", "bands", "cable", "smith",
  "leg_press", "leg_curl", "leg_extension", "chest_press", "shoulder_press_machine", "row_machine",
  "pec_deck", "calf_machine", "assisted_pullup", "back_extension", "glute_machines", "ab_machine", "cardio_machine", "jump_rope",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];
/** Virtual capability satisfied by either dumbbell type. */
export type Capability = Equipment | "dumbbells";

export const KINDS = ["barbell", "dumbbell", "kettlebell", "machine", "cable", "smith", "bodyweight", "band", "cardio"] as const;
export type Kind = (typeof KINDS)[number];

/** How a logged weight should be read. Never compare across models. */
export type Loading =
  | "total"          // whole external load (barbell incl. bar, machine stack, cable)
  | "per_dumbbell"   // weight of one dumbbell/kettlebell
  | "per_side"       // plates per side (plate-loaded machines)
  | "bodyweight"     // no external load possible/needed
  | "bodyweight_plus"// bodyweight + optional added weight
  | "assisted"       // assistance; more = easier
  | "time";          // holds / conditioning, logged in seconds

export type Mechanics = "compound" | "isolation";
export type Grip = "narrow" | "wide" | "neutral";
export type Lang = "pl" | "en" | "de";

export interface Exercise {
  id: string;
  name: Record<Lang, string>;
  aliases?: string[];
  primary: Muscle[];
  secondary: Muscle[];
  pattern: Pattern;
  /** All of these are required. */
  equipment: Capability[];
  /** At least one of these is required (if present). */
  equipmentAnyOf?: Capability[];
  kind: Kind;
  machineType?: "selectorized" | "plate_loaded";
  mechanics: Mechanics;
  /** 1 = easy to learn, 3 = technically demanding. */
  skill: 1 | 2 | 3;
  /** Systemic/local fatigue and risk when pushed hard. */
  fatigue: "low" | "moderate" | "high";
  /** Stable exercises are reasonable to take close to technical failure. */
  stable: boolean;
  loading: Loading;
  /** Small isolation lifts that usually suit higher reps. */
  smallMuscle?: boolean;
  /** One side at a time: each set takes roughly twice as long. */
  unilateral?: boolean;
  /** Grip / elbow-position variants the user can choose between (first = default). */
  grips?: Grip[];
  cue: Partial<Record<Lang, string>>;
  safety?: Partial<Record<Lang, string>>;
  custom?: boolean;
  /** Part of the muscle the variant stresses more than the plain lift (incline press → upper chest). */
  emphasis?: "upper_chest";
  /** Never picked by the generator (e.g. abduction/adduction machines); still available to import, swap or add. */
  accessoryOnly?: boolean;
}

export type Goal = "muscle" | "strength" | "health" | "conditioning" | "sport" | "start" | "unsure";
export type Experience = "beginner" | "intermediate" | "advanced";
/** Preferred equipment styles; several may be chosen, none = no preference. */
export type StylePref = "machines" | "free" | "bodyweight";
export type MusclePriority = "high" | "normal" | "low" | "maintain";
export type ExercisePref = "favorite" | "like" | "neutral" | "dislike" | "exclude" | "pain";

export interface Location {
  id: string;
  name: string;
  kind: "gym" | "home" | "park" | "outdoor" | "other";
  equipment: Equipment[];
}

export interface DayAvailability {
  /** Locations usable that day. Empty = no training that day. */
  locations: string[];
  /** User wants this day kept free. */
  rest?: boolean;
}

export type SportDemand = "legs" | "pull" | "push" | "grip" | "full";

export interface Sport {
  id: string;
  type: "climbing" | "bouldering" | "cycling" | "running" | "football" | "swimming" | "martial_arts" | "tennis" | "other";
  name?: string;
  /** Fixed days, or empty when the user only knows how many times per week (perWeek). */
  days: Weekday[];
  perWeek: number;
  minutes?: number;
  intensity?: "easy" | "moderate" | "hard";
  /** Only used for type "other". */
  demands?: SportDemand[];
}

export interface TrainingProfile {
  goal: Goal;
  secondaryGoals?: Goal[];
  experience: Experience;
  sessionsPerWeek: number;
  sessionMinutes: number;
  scheduleMode: "fixed" | "flexible";
  /** Index 0 = Monday. */
  week: DayAvailability[];
  locations: Location[];
  styles: StylePref[];
  excludedKinds: Kind[];
  priorities: Partial<Record<Muscle, MusclePriority>>;
  sports: Sport[];
  supersets: "allow" | "avoid";
  conditioning?: boolean;
  /** Free-text notes for the assistant (injuries, dislikes); the generator does not read them. */
  notes?: string;
}

export type Effort =
  | "leave_2_3"            // stop with ~2–3 reps in the tank (learning, risky lifts)
  | "leave_1_3"
  | "leave_0_2"
  | "last_set_failure_ok"; // stable exercise: last set may go to technical failure

export type Progression = "double" | "reps_then_variant" | "assist_reduce" | "time";

export interface PlannedExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  /** For time-based work (holds, conditioning). */
  seconds?: number;
  restSec: number;
  effort: Effort;
  progression: Progression;
  pattern: Pattern;
  priority: 1 | 2 | 3;
  /** Exercises sharing a group number are done as a superset. */
  superset?: number;
  grip?: Grip;
  note?: string;
  /**
   * Weight set in the plan (from an import or typed in the plan editor). Prefills the next workout when it is
   * newer than the last logged session of this exercise; otherwise the logged history wins.
   */
  startKg?: number;
  startKgAt?: string;
}

export interface PlannedSession {
  key: string;
  template: string;
  /** Optional user-facing name (imported/edited plans); otherwise derived from the template. */
  name?: string;
  day: Weekday | null;
  locationId: string;
  exercises: PlannedExercise[];
  estimatedMinutes: number;
}

export interface Message {
  code: string;
  params?: Record<string, string | number>;
}

export interface Plan {
  engineVersion: string;
  split: string;
  sessions: PlannedSession[];
  weeklySets: Partial<Record<Muscle, number>>;
  tradeoffs: Message[];
  notes: Message[];
}

export interface Issue extends Message {
  severity: "error" | "warning";
  session?: string;
  exerciseId?: string;
}
