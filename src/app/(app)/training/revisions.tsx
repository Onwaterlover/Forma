"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { restoreWorkout } from "@/app/actions/training";
import { useToast } from "@/components/client";
import { Button } from "@/components/ui";
import { fmtDate } from "@/i18n";
import { useI18n } from "@/i18n/client";
import type { WorkoutRevision } from "@/lib/data";

/**
 * Kept copies of workouts with a "Restore" button: earlier versions of one workout ("versions"), or workouts
 * deleted in the last 90 days ("deleted", which opens the restored workout).
 */
export function RevisionList({ items, kind }: { items: WorkoutRevision[]; kind: "versions" | "deleted" }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const when = (iso: string) => fmtDate(locale, iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <ul className="divide-y divide-border">
      {items.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{kind === "deleted" ? r.name : t(`workout.revision.${r.reason}`)}</span>
            <span className="block text-xs text-muted">
              {kind === "deleted" ? `${fmtDate(locale, r.startedAt, { weekday: "short", day: "numeric", month: "short" })} · ` : ""}
              {t("workout.savedAt", { when: when(r.createdAt) })} · {t("workout.loggedSets", { n: r.sets })}
            </span>
          </span>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => {
            const res = await restoreWorkout(r.id);
            toast({ text: res.error ? t("common.error") : t("workout.restored") });
            if (!res.id) return;
            if (kind === "deleted") router.push(`/workout/${res.id}`);
            else router.refresh();
          })}>{t("workout.restore")}</Button>
        </li>
      ))}
    </ul>
  );
}
