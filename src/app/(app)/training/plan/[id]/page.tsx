import { notFound } from "next/navigation";
import { planAction, restoreVersion } from "@/app/actions/training";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import { fmtDate } from "@/i18n";
import { pageCtx } from "@/lib/ctx";
import { getCustomExercises, getPlan, getPrefs, getProfile, listVersions } from "@/lib/data";
import { PlanEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ then?: string }> }) {
  const { id } = await params;
  const { then } = await searchParams;
  const { user, locale, t } = await pageCtx();
  const plan = await getPlan(user.id, id);
  if (!plan) notFound();
  const versions = await listVersions(user.id, id);
  const btn = "h-9 rounded-xl bg-surface-2 px-3 text-sm font-medium hover:bg-border";

  return (
    <>
      <PageHeader
        title={plan.name}
        subtitle={<span className="flex flex-wrap gap-2"><Badge tone={plan.status === "active" ? "accent" : "neutral"}>{t(`plan.status.${plan.status}`)}</Badge><Badge>{t(`plan.source.${plan.source}`)}</Badge><Badge>{t("plan.version", { n: plan.current_version })}</Badge></span>}
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {plan.status !== "active" && <form action={planAction.bind(null, id, "activate", undefined)}><button className={btn}>{t("plan.activate")}</button></form>}
        <form action={planAction.bind(null, id, "duplicate", undefined)}><button className={btn}>{t("plan.duplicate")}</button></form>
        {plan.status !== "archived" && <form action={planAction.bind(null, id, "archive", undefined)}><button className={btn}>{t("plan.archive")}</button></form>}
      </div>

      <PlanEditor
        planId={id}
        name={plan.name}
        initial={plan.data}
        profile={await getProfile(user.id)}
        prefs={await getPrefs(user.id)}
        custom={await getCustomExercises(user.id)}
        source={plan.source}
        then={then === "analyze" || then === "optimize" ? then : null}
      />

      <SectionTitle>{t("plan.versions")}</SectionTitle>
      <Card className="p-0 sm:p-0">
        <ul className="divide-y divide-border">
          {versions.map((v) => (
            <li key={v.version} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm">
                <span className="font-medium">{t("plan.version", { n: v.version })}</span>
                <span className="ml-2 text-muted">{fmtDate(locale, v.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{v.note ? ` · ${v.note}` : ""}</span>
              </span>
              {v.version === plan.current_version ? (
                <Badge tone="accent">{t("plan.current")}</Badge>
              ) : (
                <form action={restoreVersion.bind(null, id, v.version)}><button className="text-sm font-medium text-accent hover:underline">{t("plan.restore")}</button></form>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
