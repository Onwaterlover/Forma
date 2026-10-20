import Link from "next/link";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { fmtDate } from "@/i18n";
import { pageCtx } from "@/lib/ctx";
import { listWorkouts } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { user, locale, t } = await pageCtx();
  const workouts = await listWorkouts(user.id, 100);
  return (
    <>
      <PageHeader back={{ href: "/training", label: t("nav.training") }} title={t("workout.history")} />
      {workouts.length === 0 ? (
        <Empty>{t("workout.noHistory")}</Empty>
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-border">
            {workouts.map((w) => {
              const minutes = w.ended_at ? Math.round((Date.parse(w.ended_at) - Date.parse(w.started_at)) / 60000) : null;
              return (
                <li key={w.id}>
                  <Link href={`/workout/${w.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block font-medium">{w.name}</span>
                      <span className="block text-sm text-muted">
                        {fmtDate(locale, w.started_at, { weekday: "short", day: "numeric", month: "short" })}
                        {minutes !== null && minutes > 0 ? ` · ${minutes} ${t("common.min")}` : ""}
                        {" · "}
                        {w.logged_sets > 0 ? t("workout.loggedSets", { n: w.logged_sets }) : t("workout.notLogged")}
                      </span>
                    </span>
                    {w.status !== "completed" && <Badge tone={w.status === "in_progress" ? "accent" : "neutral"}>{w.status === "in_progress" ? t("workout.inProgress") : w.notes === "skipped" ? t("workout.skipped") : t("workout.abandon")}</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
