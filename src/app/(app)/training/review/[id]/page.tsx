import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { substitutes } from "@/engine/select";
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
    return { id: exId, name: exName(ex, locale, exId), traits: ex ? traitsOf(ex, prefs[exId]) : [] };
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
        return { index, options: [option(e.exerciseId), ...alts.map((x) => option(x.id))] };
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
