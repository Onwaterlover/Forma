import { Clock, Link2, MapPin } from "lucide-react";
import { startWorkout } from "@/app/actions/training";
import { DismissibleNotice } from "@/components/dismissible";
import { cx } from "@/components/ui";
import { weekOrder } from "@/engine/plan-edit";
import { BALANCED } from "@/engine/volume";
import type { Exercise, Issue, Plan, TrainingProfile } from "@/engine/types";
import { exName, fmt, renderMessage, type Locale, type T } from "@/i18n";
import { DICTS } from "@/i18n";

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
  // Messages name the session ("Góra"), not its internal letter.
  const sessionName = (key: string) => { const s = plan.sessions.find((x) => x.key === key); return s ? s.name ?? t(`template.${s.template}`) : key; };
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <div className="space-y-4">
      {(errors.length > 0 || warnings.length > 0) && (() => {
        const lines = [...errors, ...warnings].slice(0, 8).map((i) => msg({ code: i.code, params: { ...i.params, ...(i.session ? { session: sessionName(i.session) } : {}), ...(i.exerciseId ? { exercise: i.exerciseId } : {}) } }));
        // Warnings can be hidden ("I know, it's on purpose"); they come back only if the list changes. Errors stay.
        return (
          <DismissibleNotice tone={errors.length ? "danger" : "warning"} id={`issues:${planId}:${lines.join("|")}`} dismissible={!errors.length} closeLabel={t("plan.hideIssues")} className="print:hidden">
            <p className="font-medium">{t("plan.issues")}</p>
            {!errors.length && <p className="mb-1 text-xs text-muted">{t("plan.issuesHint")}</p>}
            <ul className="list-disc space-y-0.5 pl-5">{lines.map((l, k) => <li key={k}>{l}</li>)}</ul>
          </DismissibleNotice>
        );
      })()}

      {/* Printed: compact columns so a typical plan fits one A4 page. */}
      <div className={cx("grid gap-3 lg:grid-cols-2 print:gap-2", plan.sessions.length >= 5 ? "print:grid-cols-3" : "print:grid-cols-2")}>
        {weekOrder(plan.sessions).map((s) => {
          // Rest and effort cues are shown during the workout; the plan itself stays a clean list.
          return (
            <section key={s.key} className="break-inside-avoid rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5 print:rounded-lg print:p-2.5">
              <header className="mb-2 flex items-start justify-between gap-3 print:mb-1">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent print:text-[9px]">{s.day !== null ? days[s.day] : t("plan.flexibleDay")}</p>
                  <h3 className="text-lg font-semibold leading-snug print:text-[13px]">{s.name ?? t(`template.${s.template}`)}</h3>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted print:text-[9px]">
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
                  const inSuperset = e.superset !== undefined && s.exercises.some((x, j) => j !== i && x.superset === e.superset);
                  const prevSame = inSuperset && i > 0 && s.exercises[i - 1]!.superset === e.superset;
                  return (
                    <li key={e.exerciseId} className={cx(
                      "grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-2 py-2.5 print:grid-cols-[0.9rem_1fr_auto] print:gap-x-1.5 print:py-[3px] print:text-[10.5px]",
                      // Superset members share an accent bar on the left, so the pair is visible at a glance.
                      inSuperset && "-ml-2 border-l-2 border-l-accent pl-2",
                    )}>
                      <span className="text-sm tabular-nums text-muted">{prevSame ? <Link2 size={14} aria-label={t("plan.superset")} /> : i + 1}</span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium leading-snug print:text-[10.5px] print:leading-tight">{exName(lookup(e.exerciseId), locale, e.exerciseId)}</span>
                        {inSuperset && !prevSame && <span className="block text-xs font-medium text-accent print:text-[8.5px]">{t("plan.supersetWithNext")}</span>}
                        {e.grip && <span className="block text-xs text-muted print:text-[8.5px]">{t("plan.grip")} {t(`plan.grips.${e.grip}`)}</span>}
                      </span>
                      <span className="text-right text-[15px] font-semibold tabular-nums print:text-[10.5px]">{e.sets} × {e.seconds ? `${e.seconds} s` : `${e.repMin}–${e.repMax}`}</span>
                    </li>
                  );
                })}
              </ol>
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
                  // Name and number on one line, the bar below: nothing gets cut off on a phone.
                  <li key={m} className="space-y-1 text-sm">
                    <span className="flex items-baseline justify-between gap-2">
                      <span>{t(`muscles.${m}`)}{pr && pr !== "normal" ? <span className="ml-1 text-xs text-muted">· {t(`onb.priorityLevel.${pr}`)}</span> : null}</span>
                      <span className="tabular-nums text-muted">{fmt(locale, v, 1)}</span>
                    </span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent" style={{ width: `${(v / maxSets) * 100}%` }} /></span>
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
