import { notFound } from "next/navigation";
import { planAction, restoreVersion } from "@/app/actions/training";
import { Assistant } from "@/components/assistant";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { fmtDate } from "@/i18n";
import { aiProvider } from "@/lib/assistant";
import { pageCtx, todayIso } from "@/lib/ctx";
import { getCustomExercises, getPlan, getPrefs, getProfile, lastWeights, listVersions } from "@/lib/data";
import { PlanEditor } from "./editor";
import { DeletePlanButton } from "../../plan-actions";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ then?: string; imported?: string }> }) {
  const { id } = await params;
  const { then, imported } = await searchParams;
  const { user, locale, t, settings } = await pageCtx();
  const plan = await getPlan(user.id, id);
  if (!plan) notFound();
  const versions = await listVersions(user.id, id);
  const btn = "h-9 rounded-xl bg-surface-2 px-3 text-sm font-medium hover:bg-border";

  return (
    <>
      {/* Kept minimal: no status/source/version badges; the assistant is here too, since imports land on this page. */}
      <PageHeader back={{ href: "/training", label: t("nav.training") }} title={plan.name}
        action={aiProvider() ? <Assistant scope="training" date={todayIso()} enabled={settings.ai} provider={aiProvider()!} /> : undefined}
      />
      {imported && plan.source === "imported" && (
        // Right after an import: one clear way back if the result is wrong.
        <Notice tone="accent" className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span>{t("import.done")}</span>
          <DeletePlanButton planId={id} undoImport />
        </Notice>
      )}
      <div className="mb-5 flex flex-wrap gap-2">
        {plan.status !== "active" && <form action={planAction.bind(null, id, "activate", undefined)}><button className={btn}>{t("plan.activate")}</button></form>}
        <DeletePlanButton planId={id} />
      </div>

      <PlanEditor
        planId={id}
        name={plan.name}
        initial={plan.data}
        profile={await getProfile(user.id)}
        prefs={await getPrefs(user.id)}
        custom={await getCustomExercises(user.id)}
        source={plan.source}
        lastKg={await lastWeights(user.id, [...new Set(plan.data.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))])}
        then={then === "analyze" || then === "optimize" ? then : null}
      />

      {/* History only matters once there is something to go back to; folded away by default. */}
      {versions.length > 1 && (
        <details className="mt-6">
          <summary className="cursor-pointer select-none py-2 text-sm font-medium text-muted">{t("plan.versions")}</summary>
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
        </details>
      )}
    </>
  );
}
