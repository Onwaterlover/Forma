import { createManualPlan } from "@/app/actions/training";
import { PageHeader } from "@/components/ui";
import { pageCtx } from "@/lib/ctx";
import { getCustomExercises } from "@/lib/data";
import { Importer } from "./importer";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const { user, t } = await pageCtx();
  return (
    <>
      <PageHeader back={{ href: "/training", label: t("nav.training") }}         title={t("import.title")}
        subtitle={t("import.hint")}
        action={<form action={createManualPlan}><button className="h-9 rounded-xl bg-surface-2 px-3 text-sm font-medium hover:bg-border">{t("plan.manual")}</button></form>}
      />
      <Importer custom={await getCustomExercises(user.id)} />
    </>
  );
}
