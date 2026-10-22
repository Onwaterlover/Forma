import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { substitutes } from "@/engine/select";
import { compareTo, verdictOf } from "@/engine/compare";
import { traitsOf } from "@/engine/traits";
import { DICTS, exName } from "@/i18n";
import { pageCtx } from "@/lib/ctx";
import { getPlan, getPrefs, getProfile, libraryFor } from "@/lib/data";
import { PlanReview, type ReviewDay } from "./review";

export const dynamic = "force-dynamic";

/** Step-by-step review of a freshly generated plan: recommended exercise per slot plus a few alternatives. */
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, t, locale } = await pageCtx();
  const [plan, profile, prefs, library] = await Promise.all([getPlan(user.id, id), getProfile(user.id), getPrefs(user.id), libraryFor(user.id)]);
  if (!plan || !profile) notFound();
  const lookup = (exId: string) => library.find((e) => e.id === exId);
  const option = (exId: string) => {
    const ex = lookup(exId);
    // Recommended: only what it trains (the user found the list of traits too much).
    return { id: exId, name: exName(ex, locale, exId), traits: [] as ReturnType<typeof traitsOf>, primary: ex?.primary ?? [], secondary: ex?.secondary ?? [] };
  };
  // Alternatives explain themselves by how they differ from the recommended exercise, not by repeating its traits.
  const alternative = (exId: string, rec: string, equipment: string[], priority: 1 | 2 | 3) => {
    const ex = lookup(exId);
    const base = lookup(rec);
    const verdict = ex && base ? verdictOf(ex, base, { profile, equipment: equipment as never, library }, priority) : undefined;
    // Alternatives: what they train plus at most two differences, the most important first.
    const level = ex ? traitsOf(ex, prefs[exId], profile.experience).filter((tr) => tr === "forAdvanced" || tr === "tooEasy") : [];
    const diffs = ex && base ? compareTo(ex, base).filter((d) => d.key !== "similar") : [];
    return { ...option(exId), traits: level.slice(0, Math.max(0, 2 - diffs.length)), diffs: diffs.slice(0, 2), verdict };
  };

  const days: ReviewDay[] = plan.data.sessions.map((s) => {
    const equipment = profile.locations.find((l) => l.id === s.locationId)?.equipment ?? [];
    const inSession = new Set(s.exercises.map((e) => e.exerciseId));
    return {
      key: s.key,
      day: s.day !== null ? DICTS[locale].days.long[s.day]! : t("plan.flexibleDay"),
      title: s.name ?? t(`template.${s.template}`),
      slots: s.exercises.map((e, index) => {
        const original = lookup(e.exerciseId);
        // Same movement first; at most three alternatives keep the choice quick.
        const alts = original
          ? substitutes(original, { profile, prefs, library, equipment, excludeIds: inSession }).filter((x) => x.pattern === original.pattern).slice(0, 3)
          : [];
        return { index, options: [option(e.exerciseId), ...alts.map((x) => alternative(x.id, e.exerciseId, equipment, e.priority))] };
      }),
    };
  });

  return (
    <>
      <PageHeader title={t("review.title")} subtitle={t("review.hint")} />
      <PlanReview planId={plan.id} days={days} />
    </>
  );
}
