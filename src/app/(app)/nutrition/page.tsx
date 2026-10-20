import { isIsoDate, pageCtx, todayIso } from "@/lib/ctx";
import { currentTarget, diaryDay, favoriteProducts, listRecipes, recentProducts } from "@/lib/data";
import { Assistant } from "@/components/assistant";
import { aiConfigured } from "@/lib/assistant";
import { Diary } from "./diary";

export const dynamic = "force-dynamic";

export default async function NutritionPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: raw } = await searchParams;
  const { user, settings } = await pageCtx();
  const date = isIsoDate(raw) ? raw : todayIso();
  const day = await diaryDay(user.id, date);
  const target = await currentTarget(user.id);
  return (
    <Diary
      date={date}
      today={todayIso()}
      entries={day.entries}
      totals={day.totals}
      complete={day.complete}
      target={target ? { kcal: target.kcal, protein: target.protein_g } : null}
      recents={await recentProducts(user.id, 15)}
      favorites={await favoriteProducts(user.id)}
      recipes={(await listRecipes(user.id)).map((r) => ({ id: r.id, name: r.name, isMeal: r.isMeal, servings: r.servings, finalWeight: r.calc.finalWeight, perServingKcal: r.calc.perServing.kcal, totalKcal: r.calc.total.kcal }))}
      showFiber={settings.showFiber}
      assistant={aiConfigured() ? <Assistant scope="nutrition" date={date} enabled={settings.ai} /> : null}
    />
  );
}
