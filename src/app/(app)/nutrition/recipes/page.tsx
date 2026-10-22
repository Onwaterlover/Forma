import { PageHeader } from "@/components/ui";
import { pageCtx } from "@/lib/ctx";
import { listRecipes } from "@/lib/data";
import { Recipes } from "./recipes";

export const dynamic = "force-dynamic";

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  const { user, t } = await pageCtx();
  return (
    <>
      <PageHeader back={{ href: "/nutrition", label: t("nav.nutrition") }} title={t("nutrition.recipes")} subtitle={t("nutrition.help")} />
      <Recipes recipes={await listRecipes(user.id)} openId={open ?? null} />
    </>
  );
}
