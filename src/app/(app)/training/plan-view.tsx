import { Clock, Link2, MapPin } from "lucide-react";
import { startWorkout } from "@/app/actions/training";
import { HowTo } from "@/components/how-to";
import { Badge, Card, Notice } from "@/components/ui";
import { BALANCED } from "@/engine/volume";
import type { Exercise, Issue, Plan, TrainingProfile } from "@/engine/types";
import { exName, fmt, fmtRest, renderMessage, type Locale, type T } from "@/i18n";
import { DICTS } from "@/i18n";

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

  return (
    <div className="space-y-4">
      {(errors.length > 0 || warnings.length > 0) && (
        <Notice tone={errors.length ? "danger" : "warning"}>
          <p className="mb-1 font-medium">{t("plan.issues")}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {[...errors, ...warnings].slice(0, 8).map((i, k) => <li key={k}>{msg({ code: i.code, params: { ...i.params, ...(i.session ? { session: i.session } : {}), ...(i.exerciseId ? { exercise: i.exerciseId } : {}) } })}</li>)}
          </ul>
        </Notice>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {plan.sessions.map((s) => (
          <Card key={s.key} className="flex flex-col">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{s.day !== null ? days[s.day] : t("plan.flexibleDay")}</p>
                <h3 className="text-lg font-semibold">{s.name ?? t(`template.${s.template}`)}</h3>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <span className="inline-flex items-center gap-1"><Clock size={14} aria-hidden />{t("plan.estimated", { n: s.estimatedMinutes })}</span>
                  {locName(s.locationId) && <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden />{locName(s.locationId)}</span>}
                </p>
              </div>
              {startable && (
                <form action={startWorkout.bind(null, planId, s.key, undefined, undefined)}>
                  <button type="submit" className="h-9 rounded-xl bg-accent px-3 text-sm font-medium text-accent-contrast hover:bg-accent-hover">{t("plan.start")}</button>
                </form>
              )}
            </div>
            <ol className="space-y-2.5">
              {s.exercises.map((e, i) => {
                const ex = lookup(e.exerciseId);
                const prevSame = i > 0 && e.superset !== undefined && s.exercises[i - 1]!.superset === e.superset;
                return (
                  <li key={e.exerciseId} className="flex gap-3">
                    <span className="mt-0.5 w-5 shrink-0 text-right text-sm tabular-nums text-muted">{prevSame ? <Link2 size={14} className="ml-auto" aria-label={t("plan.superset")} /> : i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium leading-snug">{exName(ex, locale, e.exerciseId)}</p>
                      <p className="text-sm text-muted">
                        <span className="tabular-nums">{e.sets} × {e.seconds ? `${e.seconds} s` : `${e.repMin}–${e.repMax}`}</span>
                        {e.restSec > 0 && <> · {t("plan.rest")} {fmtRest(e.restSec)}</>}
                        {e.grip && <> · {t("plan.grip")} {t(`plan.grips.${e.grip}`)}</>}
                        {e.superset !== undefined && !prevSame && <> · <Badge tone="accent">{t("plan.superset")}</Badge></>}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{t(`effort.${e.effort}`)}</p>
                      {ex && <HowTo exercise={ex} grip={e.grip} compact />}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        ))}
      </div>

      <Card>
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
      </Card>

      {(plan.tradeoffs.length > 0 || plan.notes.length > 0) && (
        <Card>
          <h3 className="mb-2 font-semibold">{t("plan.why")}</h3>
          <ul className="space-y-2 text-sm leading-relaxed">
            {plan.notes.map((n, i) => <li key={`n${i}`}>{msg(n)}</li>)}
            {plan.tradeoffs.map((n, i) => <li key={`t${i}`} className="text-muted">{msg(n)}</li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}
