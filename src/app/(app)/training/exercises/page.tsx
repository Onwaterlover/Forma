import { PageHeader } from "@/components/ui";
import { pageCtx } from "@/lib/ctx";
import { getCustomExercises, getPrefs } from "@/lib/data";
import { Library } from "./library";

export const dynamic = "force-dynamic";

export default async function ExercisesPage() {
  const { user, t } = await pageCtx();
  return (
    <>
      <PageHeader back={{ href: "/training", label: t("nav.training") }} title={t("library.title")} subtitle={t("library.prefHint")} />
      <Library prefs={await getPrefs(user.id)} custom={await getCustomExercises(user.id)} />
    </>
  );
}
