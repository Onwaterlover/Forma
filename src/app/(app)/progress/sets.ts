import type { BestSetPoint, TrendMetric } from "@/engine/progression";
import type { Exercise } from "@/engine/types";
import { fmt, type Locale, type T } from "@/i18n";

/** The estimate is labelled as one wherever it appears. */
export const metricLabel = (t: T, metric: TrendMetric) => (metric === "e1rm" ? `${t("progress.e1rm")} (${t("workout.estimate")})` : t(`progress.metric.${metric}`));

export const metricUnit = (t: T, metric: TrendMetric) => (metric === "time" ? t("plan.seconds") : metric === "reps" ? t("plan.reps") : "kg");

/** "60 kg × 10 per dumbbell", "15 reps", "45 s". */
export function setText(t: T, locale: Locale, ex: Exercise, p: Pick<BestSetPoint, "weightKg" | "reps" | "durationS">): string {
  if (ex.loading === "time") return `${p.durationS ?? "?"} ${t("plan.seconds")}`;
  const loaded = p.weightKg !== null && (p.weightKg > 0 || ex.loading === "assisted");
  if (!loaded) return `${p.reps ?? "?"} ${t("plan.reps")}`;
  const units: Record<string, string> = { per_dumbbell: t("workout.perDumbbell"), per_side: t("workout.perSide"), assisted: t("workout.assistance") };
  const unit = units[ex.loading];
  return `${t("progress.repsAt", { reps: p.reps ?? "?", weight: fmt(locale, p.weightKg, 2) })}${unit ? ` ${unit}` : ""}`;
}
