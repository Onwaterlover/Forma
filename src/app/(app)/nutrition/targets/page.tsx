import { PageHeader } from "@/components/ui";
import { pageCtx } from "@/lib/ctx";
import { energyEstimate } from "@/lib/estimate";
import { TargetsForm } from "./form";

export const dynamic = "force-dynamic";

export default async function TargetsPage() {
  const { user, t, settings } = await pageCtx();
  const { adaptive, suggestion, target, lastKg, goal } = await energyEstimate(user.id);
  return (
    <>
      <PageHeader back={{ href: "/nutrition", label: t("nav.nutrition") }} title={t("targets.title")} subtitle={t("targets.noAuto")} />
      <TargetsForm target={target ? { kcal: target.kcal, protein: target.protein_g, goal } : null} lastKg={lastKg} adaptive={adaptive} suggestion={suggestion} body={settings.body} />
    </>
  );
}
