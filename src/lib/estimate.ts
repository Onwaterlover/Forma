import "server-only";
import { adaptiveTdee, ESTIMATE_DAYS, suggestTarget, type WeightGoal } from "@/nutrition/energy";
import { shiftDate, todayIso } from "./ctx";
import { currentTarget, getSettings, intakeHistory, listWeights } from "./data";

/** The adaptive energy estimate and a target suggestion (never applied automatically). */
export async function energyEstimate(userId: string) {
  const today = todayIso();
  const from = shiftDate(today, -(ESTIMATE_DAYS - 1));
  const [intake, weights, allWeights, target, settings] = await Promise.all([
    intakeHistory(userId, from), listWeights(userId, from), listWeights(userId), currentTarget(userId), getSettings(userId),
  ]);
  const adaptive = adaptiveTdee(intake, weights, { today });
  const lastKg = allWeights.at(-1)?.kg ?? null;
  const goal = (target?.goal as WeightGoal | null) ?? settings.weightGoal;
  const suggestion = goal && lastKg ? suggestTarget(adaptive, goal, target?.kcal ?? null, lastKg) : null;
  return { adaptive, suggestion, target, lastKg, goal };
}
