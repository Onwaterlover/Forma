import { PageHeader } from "@/components/ui";
import { pageCtx } from "@/lib/ctx";
import { getProfile } from "@/lib/data";
import { SetupWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const { user, t } = await pageCtx();
  return (
    <>
      <PageHeader back={{ href: "/training", label: t("nav.training") }} title={t("onb.title")} />
      <SetupWizard initial={await getProfile(user.id)} />
    </>
  );
}
