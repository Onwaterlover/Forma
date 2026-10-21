import Link from "next/link";
import { Badge, Card, Empty, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { validatePlan } from "@/engine/validate";
import { pageCtx } from "@/lib/ctx";
import { getActivePlan, getPrefs, getProfile, inProgressWorkout, libraryFor, listPlans } from "@/lib/data";
import { PlanMenu } from "./plan-actions";
import { PlanView } from "./plan-view";
import { exName } from "@/i18n";
import { Assistant } from "@/components/assistant";
import { aiProvider } from "@/lib/assistant";
import { todayIso } from "@/lib/ctx";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const { user, locale, t, settings } = await pageCtx();
  const [plan, profile, library, allPlans, running, prefs] = await Promise.all([
    getActivePlan(user.id), getProfile(user.id), libraryFor(user.id), listPlans(user.id), inProgressWorkout(user.id), getPrefs(user.id),
  ]);
  const plans = allPlans.filter((p) => p.id !== plan?.id && p.status !== "archived");
  const issues = plan && profile && plan.source !== "imported" ? validatePlan({ plan: plan.data, profile, prefs, library }) : [];

  const exercises = plan ? [...new Set(plan.data.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))].map((id) => ({ id, name: exName(library.find((x) => x.id === id), locale, id) })) : [];

  return (
    <>
      <PageHeader title={plan?.name ?? t("plan.title")} subtitle={plan ? `${t(`split.${plan.data.split}`, {})} · ${t("plan.perWeek", { n: plan.data.sessions.length })}` : undefined}
        action={
          <div className="flex gap-2">
            {aiProvider() && <Assistant scope="training" date={todayIso()} enabled={settings.ai} provider={aiProvider()!} />}
            <PlanMenu planId={plan?.id ?? null} exercises={exercises} library={library} feedback={!!profile} logging={settings.logWorkouts} hasProfile={!!profile} />
          </div>
        } />

      {running && settings.logWorkouts && (
        <Card className="mb-4 flex items-center justify-between gap-3 print:hidden">
          <p className="font-medium">{running.name} <Badge tone="accent">{t("workout.inProgress")}</Badge></p>
          <LinkButton href={`/workout/${running.id}`} size="sm">{t("workout.resume")}</LinkButton>
        </Card>
      )}

      {plan ? (
        <PlanView plan={plan.data} planId={plan.id} profile={profile} library={library} issues={issues} t={t} locale={locale} startable={!running && settings.logWorkouts} />
      ) : (
        <Empty action={<div className="flex flex-wrap justify-center gap-2"><LinkButton href="/training/setup">{t("plan.create")}</LinkButton><LinkButton href="/training/import" variant="secondary">{t("plan.import")}</LinkButton></div>}>
          {t("plan.noPlan")}
        </Empty>
      )}

      {plans.length > 0 && (
        <div className="print:hidden">
          <SectionTitle>{t("plan.plans")}</SectionTitle>
          <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
            {plans.map((p) => (
              <li key={p.id}>
                <Link href={`/training/plan/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="truncate font-medium">{p.name}</span>
                  <Badge>{t(`plan.status.${p.status}`)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
