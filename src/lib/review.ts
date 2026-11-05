// Weekly review on the Progress page: what last week's own data says, in a few facts and at most one tip.
// Pure and conservative: with too little data it says so instead of guessing.

export type Goal = "maintain" | "lose" | "gain" | "recomp" | null;

export interface ReviewInput {
  goal: Goal;
  /** Smoothed bodyweight (trend) points, oldest first. */
  trend: { date: string; trend: number }[];
  /** Days of the week with logged food (kcal > 0). */
  days: { kcal: number; protein: number }[];
  target: { kcal: number | null; protein: number | null } | null;
  workouts: { done: number; planned: number | null; sets: number; setsBefore: number };
  /** Monday and Sunday of the week reviewed. */
  weekStart: string;
  weekEnd: string;
}

export type Tip =
  | { key: "lowData" }
  | { key: "keep" }
  | { key: "underlog"; kcal: number }
  | { key: "lowerKcal" }
  | { key: "tooFast"; pct: number }
  | { key: "moreKcal" }
  | { key: "drift"; dir: "up" | "down" }
  | { key: "protein"; avg: number; target: number }
  | { key: "fewerWorkouts"; done: number; planned: number };

export interface Review {
  /** Trend change over the week in kg (per 7 days), when the weigh-ins allow it. */
  weight: number | null;
  food: { days: number; kcal: number; protein: number } | null;
  training: { done: number; planned: number | null; sets: number; setsBefore: number } | null;
  tip: Tip;
}

const DAY = 86_400_000;
const before = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) - days * DAY).toISOString().slice(0, 10);

export function weeklyReview(i: ReviewInput): Review {
  // Weight: trend at the end of the week against the end of the week before, scaled to 7 days.
  const end = [...i.trend].reverse().find((p) => p.date <= i.weekEnd);
  const start = [...i.trend].reverse().find((p) => p.date <= before(i.weekStart, 1));
  const span = end && start ? (Date.parse(end.date) - Date.parse(start.date)) / DAY : 0;
  const weight = end && start && end.date >= i.weekStart && span >= 5 ? Math.round(((end.trend - start.trend) / span) * 7 * 100) / 100 : null;

  const food = i.days.length
    ? { days: i.days.length, kcal: Math.round(i.days.reduce((a, d) => a + d.kcal, 0) / i.days.length), protein: Math.round(i.days.reduce((a, d) => a + d.protein, 0) / i.days.length) }
    : null;
  const training = i.workouts.done || i.workouts.planned ? i.workouts : null;

  const enoughFood = !!food && food.days >= 5;
  const bw = end?.trend ?? null;
  let tip: Tip | null = null;

  if (weight !== null && i.goal === "lose") {
    if (weight > -0.1 && enoughFood && i.target?.kcal && food!.kcal <= i.target.kcal - 250) tip = { key: "underlog", kcal: food!.kcal };
    else if (weight > -0.1 && enoughFood) tip = { key: "lowerKcal" };
    else if (bw && weight < -0.01 * bw) tip = { key: "tooFast", pct: Math.round((-weight / bw) * 1000) / 10 };
  } else if (weight !== null && i.goal === "gain") {
    if (weight < 0.1 && enoughFood) tip = { key: "moreKcal" };
  } else if (weight !== null && i.goal === "maintain" && Math.abs(weight) > 0.5) {
    tip = { key: "drift", dir: weight > 0 ? "up" : "down" };
  }
  if (!tip && food && food.days >= 3 && i.target?.protein && food.protein < 0.8 * i.target.protein) {
    tip = { key: "protein", avg: food.protein, target: i.target.protein };
  }
  if (!tip && training?.planned && training.done < training.planned * 0.5) tip = { key: "fewerWorkouts", done: training.done, planned: training.planned };
  if (!tip) tip = weight === null && !enoughFood && !training?.done ? { key: "lowData" } : { key: "keep" };
  return { weight, food, training, tip };
}
