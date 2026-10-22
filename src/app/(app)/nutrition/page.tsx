import { isIsoDate, pageCtx, shiftDate, todayIso, weekdayOf } from "@/lib/ctx";
import { currentTarget, diaryDay, favoriteProducts, intakeHistory, listRecipes, recentProducts, recentRecipes } from "@/lib/data";
import { WeeklyCheckin } from "./checkin";
import { Assistant } from "@/components/assistant";
import { aiProvider } from "@/lib/assistant";
import { Diary } from "./diary";

export const dynamic = "force-dynamic";

export default async function NutritionPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: raw } = await searchParams;
  const { user, settings } = await pageCtx();
  const date = isIsoDate(raw) ? raw : todayIso();
  const today = todayIso();
  // Last full week (Monday to Sunday) for the weekly check-in.
  const weekStart = shiftDate(today, -weekdayOf(today) - 7);
  const weekEnd = shiftDate(weekStart, 6);
  const [day, target, recents, favorites, recipes, lastWeek, recentMeals] = await Promise.all([
    diaryDay(user.id, date), currentTarget(user.id), recentProducts(user.id, 15), favoriteProducts(user.id), listRecipes(user.id), intakeHistory(user.id, weekStart), recentRecipes(user.id, 5),
  ]);
  const logged = lastWeek.filter((d) => d.date <= weekEnd && d.kcal > 0);
  // Ask once: as soon as the week's days carry an answer, the card disappears.
  const askWeek = date === today && logged.length >= 3 && logged.some((d) => d.complete === undefined);
  return (
    <>
    {askWeek && (
      <WeeklyCheckin weekStart={weekStart} weekEnd={weekEnd} days={logged.length} avgKcal={Math.round(logged.reduce((a, d) => a + d.kcal, 0) / logged.length)}
        protein={target?.protein_g ?? null} goal={target?.goal ?? settings.weightGoal} />
    )}
    <Diary
      date={date}
      today={todayIso()}
      entries={day.entries}
      totals={day.totals}
      complete={day.complete}
      target={target ? { kcal: target.kcal, protein: target.protein_g } : null}
      recents={recents}
      recentMeals={recentMeals}
      favorites={favorites}
      recipes={recipes.map((r) => ({ id: r.id, name: r.name, isMeal: r.isMeal, servings: r.servings, finalWeight: r.calc.finalWeight, perServingKcal: r.calc.perServing.kcal, totalKcal: r.calc.total.kcal }))}
      showFiber={settings.showFiber || (settings.showMacroTargets && settings.macroGoals.fiber)}
      macroGoals={settings.showMacroTargets ? settings.macroGoals : null}
      assistant={aiProvider() ? <Assistant scope="nutrition" date={date} enabled={settings.ai} provider={aiProvider()!} /> : null}
    />
    </>
  );
}
