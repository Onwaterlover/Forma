import { Clock, Link2, MapPin } from "lucide-react";
import { startWorkout } from "@/app/actions/training";
import { HowToPicker } from "@/components/how-to";
import { Notice } from "@/components/ui";
import { BALANCED } from "@/engine/volume";
import type { Effort, Exercise, Issue, Plan, TrainingProfile } from "@/engine/types";
import { exName, fmt, fmtRest, renderMessage, type Locale, type T } from "@/i18n";
import { DICTS } from "@/i18n";
import { PrintButton } from "./print-button";

/** The plan as a clean, printable document: one block per training day, one line per exercise. */
export function PlanView({
  plan, planId, profile, library, issues, t, locale, startable,
}: {
  plan: Plan;
  planId: string;
  profile: TrainingProfile | null;
  library: Exercise[];
  issues: Issue[];
  t: T;
  locale: Locale;
  startable: boolean;
}) {
  const lookup = (id: string) => library.find((e) => e.id === id);
  const locName = (id: string) => profile?.locations.find((l) => l.id === id)?.name ?? "";
  const days = DICTS[locale].days.long;
  const maxSets = Math.max(1, ...BALANCED.map((m) => plan.weeklySets[m] ?? 0));
  const msg = (m: Parameters<typeof renderMessage>[0]) => renderMessage(m, t, locale, lookup, locName);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const usedIds = plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));

  return (
    <div className="space-y-4">
      {(errors.length > 0 || warnings.length > 0) && (
        <Notice tone={errors.length ? "danger" : "warning"} className="print:hidden">
          <p className="mb-1 font-medium">{t("plan.issues")}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {[...errors, ...warnings].slice(0, 8).map((i, k) => <li key={k}>{msg({ code: i.code, params: { ...i.params, ...(i.session ? { session: i.session } : {}), ...(i.exerciseId ? { exercise: i.exerciseId } : {}) } })}</li>)}
          </ul>
        </Notice>
      )}

      <div className="flex flex-wrap items-center justify-end gap-1 print:hidden">
        <HowToPicker ids={usedIds} library={library} />
        <PrintButton />
      </div>

      <div className="grid gap-3 lg:grid-cols-2 print:block print:space-y-4">
        {plan.sessions.map((s) => {
          // The most common effort cue is said once per day; only exceptions appear on the line itself.
          const counts = new Map<Effort, number>();
          for (const e of s.exercises) counts.set(e.effort, (counts.get(e.effort) ?? 0) + 1);
          const mainEffort = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
          return (
            <section key={s.key} className="break-inside-avoid rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
              <header className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">{s.day !== null ? days[s.day] : t("plan.flexibleDay")}</p>
                  <h3 className="text-lg font-semibold leading-snug">{s.name ?? t(`template.${s.template}`)}</h3>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
                    <span className="inline-flex items-center gap-1"><Clock size={14} aria-hidden />{t("plan.estimated", { n: s.estimatedMinutes })}</span>
                    {locName(s.locationId) && <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden />{locName(s.locationId)}</span>}
                  </p>
                </div>
                {startable && (
                  <form action={startWorkout.bind(null, planId, s.key, undefined, undefined)} className="print:hidden">
                    <button type="submit" className="h-9 rounded-xl bg-accent px-3 text-sm font-medium text-accent-contrast hover:bg-accent-hover">{t("plan.start")}</button>
                  </form>
                )}
              </header>
              <ol className="divide-y divide-border">
                {s.exercises.map((e, i) => {
                  const prevSame = i > 0 && e.superset !== undefined && s.exercises[i - 1]!.superset === e.superset;
                  const details = [
                    e.restSec > 0 && `${t("plan.rest")} ${fmtRest(e.restSec)}`,
                    e.grip && `${t("plan.grip")} ${t(`plan.grips.${e.grip}`)}`,
                    e.superset !== undefined && !prevSame && t("plan.superset"),
                    e.effort !== mainEffort && t(`effort.${e.effort}`),
                  ].filter(Boolean).join(" · ");
                  return (
                    <li key={e.exerciseId} className="grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-2 py-2.5">
                      <span className="text-sm tabular-nums text-muted">{prevSame ? <Link2 size={14} aria-label={t("plan.superset")} /> : i + 1}</span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium leading-snug">{exName(lookup(e.exerciseId), locale, e.exerciseId)}</span>
                        {details && <span className="block text-xs text-muted">{details}</span>}
                      </span>
                      <span className="text-right text-[15px] font-semibold tabular-nums">{e.sets} × {e.seconds ? `${e.seconds} s` : `${e.repMin}–${e.repMax}`}</span>
                    </li>
                  );
                })}
              </ol>
              {mainEffort && <p className="mt-2 border-t border-border pt-2 text-xs text-muted">{t(`effort.${mainEffort}`)}</p>}
            </section>
          );
        })}
      </div>

      <details className="group rounded-[var(--radius-card)] border border-border bg-surface p-4 print:hidden sm:p-5">
        <summary className="cursor-pointer list-none font-semibold">{t("plan.detailsToggle")}</summary>
        <div className="mt-4 space-y-5">
          <div>
            <h3 className="font-semibold">{t("plan.weekly")}</h3>
            <p className="mb-3 text-xs text-muted">{t("plan.weeklyHint")}</p>
            <ul className="space-y-1.5">
              {BALANCED.map((m) => {
                const v = plan.weeklySets[m] ?? 0;
                const pr = profile?.priorities[m];
                return (
                  <li key={m} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                    <span className="truncate">{t(`muscles.${m}`)}{pr && pr !== "normal" ? <span className="ml-1 text-xs text-muted">· {t(`onb.priorityLevel.${pr}`)}</span> : null}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent" style={{ width: `${(v / maxSets) * 100}%` }} /></span>
                    <span className="text-right tabular-nums text-muted">{fmt(locale, v, 1)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          {(plan.tradeoffs.length > 0 || plan.notes.length > 0) && (
            <div>
              <h3 className="mb-2 font-semibold">{t("plan.why")}</h3>
              <ul className="space-y-2 text-sm leading-relaxed">
                {plan.notes.map((n, i) => <li key={`n${i}`}>{msg(n)}</li>)}
                {plan.tradeoffs.map((n, i) => <li key={`t${i}`} className="text-muted">{msg(n)}</li>)}
              </ul>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
