import { PageHeader } from "@/components/ui";
import { pageCtx, shiftDate, todayIso } from "@/lib/ctx";
import { currentTarget, intakeHistory, listWeights } from "@/lib/data";
import { adaptiveTdee, suggestTarget } from "@/nutrition/energy";
import { TargetsForm } from "./form";

export const dynamic = "force-dynamic";

export default async function TargetsPage() {
  const { user, t, settings } = await pageCtx();
  const today = todayIso();
  const from = shiftDate(today, -27);
  const weights = listWeights(user.id, from);
  const adaptive = adaptiveTdee(intakeHistory(user.id, from), weights, { today });
  const target = currentTarget(user.id);
  const lastKg = listWeights(user.id).at(-1)?.kg ?? null;
  const goal = (target?.goal as "maintain" | "lose" | "gain" | "recomp" | null) ?? settings.weightGoal;
  const suggestion = goal && lastKg ? suggestTarget(adaptive, goal, target?.kcal ?? null, lastKg) : null;
  return (
    <>
      <PageHeader title={t("targets.title")} subtitle={t("targets.noAuto")} />
      <TargetsForm target={target ? { kcal: target.kcal, protein: target.protein_g, goal } : null} lastKg={lastKg} adaptive={adaptive} suggestion={suggestion} />
    </>
  );
}
