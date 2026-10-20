import { PageHeader } from "@/components/ui";
import { pageCtx } from "@/lib/ctx";
import { listRecipes } from "@/lib/data";
import { Recipes } from "./recipes";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const { user, t } = await pageCtx();
  return (
    <>
      <PageHeader title={t("nutrition.recipes")} subtitle={t("nutrition.help")} />
      <Recipes recipes={listRecipes(user.id)} />
    </>
  );
}
