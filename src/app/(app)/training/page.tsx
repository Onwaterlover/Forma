import { BookOpen, FileInput, History, Pencil, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Badge, Card, Empty, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { validatePlan } from "@/engine/validate";
import { pageCtx } from "@/lib/ctx";
import { getActivePlan, getPrefs, getProfile, inProgressWorkout, libraryFor, listPlans } from "@/lib/data";
import { PlanView } from "./plan-view";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const { user, locale, t } = await pageCtx();
  const plan = await getActivePlan(user.id);
  const profile = await getProfile(user.id);
  const library = await libraryFor(user.id);
  const plans = (await listPlans(user.id)).filter((p) => p.id !== plan?.id && p.status !== "archived");
  const running = await inProgressWorkout(user.id);
  const issues = plan && profile && plan.source !== "imported" ? validatePlan({ plan: plan.data, profile, prefs: await getPrefs(user.id), library }) : [];

  const links = [
    { href: "/training/setup", icon: SlidersHorizontal, label: profile ? t("plan.profile") : t("plan.create") },
    { href: "/training/import", icon: FileInput, label: t("plan.import") },
    { href: "/training/exercises", icon: BookOpen, label: t("library.title") },
    { href: "/training/history", icon: History, label: t("workout.history") },
  ];

  return (
    <>
      <PageHeader title={plan?.name ?? t("plan.title")} subtitle={plan ? `${t(`split.${plan.data.split}`, {})} · ${t("plan.perWeek", { n: plan.data.sessions.length })}` : undefined}
        action={plan && <LinkButton href={`/training/plan/${plan.id}`} variant="secondary" size="sm"><Pencil size={16} aria-hidden />{t("plan.edit")}</LinkButton>} />

      {running && (
        <Card className="mb-4 flex items-center justify-between gap-3">
          <p className="font-medium">{running.name} <Badge tone="accent">{t("workout.inProgress")}</Badge></p>
          <LinkButton href={`/workout/${running.id}`} size="sm">{t("workout.resume")}</LinkButton>
        </Card>
      )}

      {plan ? (
        <PlanView plan={plan.data} planId={plan.id} profile={profile} library={library} issues={issues} t={t} locale={locale} startable={!running} />
      ) : (
        <Empty action={<div className="flex flex-wrap justify-center gap-2"><LinkButton href="/training/setup">{t("plan.create")}</LinkButton><LinkButton href="/training/import" variant="secondary">{t("plan.import")}</LinkButton></div>}>
          {t("plan.noPlan")}
        </Empty>
      )}

      <nav className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t("nav.training")}>
        {links.map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href} className="flex min-h-14 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-2">
            <Icon size={18} className="text-accent" aria-hidden />{label}
          </Link>
        ))}
      </nav>

      {plans.length > 0 && (
        <>
          <SectionTitle>{t("plan.plans")}</SectionTitle>
          <ul className="space-y-2">
            {plans.map((p) => (
              <li key={p.id}>
                <Link href={`/training/plan/${p.id}`} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="flex gap-2"><Badge>{t(`plan.source.${p.source}`)}</Badge><Badge>{t(`plan.status.${p.status}`)}</Badge></span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
