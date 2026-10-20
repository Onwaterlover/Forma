import { PageHeader } from "@/components/ui";
import { pageCtx } from "@/lib/ctx";
import { getCustomExercises, getPrefs } from "@/lib/data";
import { Library } from "./library";

export const dynamic = "force-dynamic";

export default async function ExercisesPage() {
  const { user, t } = await pageCtx();
  return (
    <>
      <PageHeader title={t("library.title")} subtitle={t("library.prefHint")} />
      <Library prefs={getPrefs(user.id)} custom={getCustomExercises(user.id)} />
    </>
  );
}
