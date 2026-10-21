import { CircleCheck, CirclePause } from "lucide-react";
import { Badge, Card, LinkButton } from "@/components/ui";
import type { BestSet, Change, WorkoutSummary } from "@/engine/summary";
import { fmt, type Locale, type T } from "@/i18n";

/** Short, calm recap shown at the top of a finished workout: what was done and what improved. */
export function SummaryCard({ s, status, week, t, locale }: {
  s: WorkoutSummary;
  status: "completed" | "abandoned";
  week: { done: number; planned: number | null };
  t: T;
  locale: Locale;
}) {
  const bestText = (b: BestSet) =>
    b.weightKg ? `${fmt(locale, b.weightKg, 2)} kg × ${b.reps ?? 0}` : b.durationS ? `${b.durationS} s` : `${b.reps ?? 0} ${t("summary.reps")}`;
  const change = (c: Change) =>
    c.kind === "weight" ? <span className="font-medium text-accent">+{fmt(locale, c.delta, 2)} kg</span>
      : c.kind === "reps" ? <span className="font-medium text-accent">+{c.delta} {t("summary.reps")}</span>
      : c.kind === "time" ? <span className="font-medium text-accent">+{c.delta} s</span>
      : <span className="text-muted">{t(`summary.${c.kind}`)}</span>;
  const Icon = status === "completed" ? CircleCheck : CirclePause;

  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-2.5">
        <Icon size={24} className={status === "completed" ? "text-accent" : "text-muted"} aria-hidden />
        <h2 className="text-lg font-semibold">{t(status === "completed" ? "summary.done" : "summary.abandoned")}</h2>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        {([["time", `${s.minutes} min`], ["sets", s.sets], ["exercises", s.exercises.length]] as const).map(([k, v]) => (
          <div key={k} className="flex flex-col-reverse rounded-xl bg-surface-2 px-2 py-3">
            <dt className="text-xs text-muted">{t(`summary.${k}`)}</dt>
            <dd className="text-xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {s.exercises.length === 0 ? <p className="text-sm text-muted">{t("summary.empty")}</p> : (
        <>
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("summary.progress")}</h3>
            <ul className="divide-y divide-border">
              {s.exercises.map((e) => (
                <li key={e.exerciseId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="tabular-nums text-muted">{bestText(e.best)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    {e.record && <Badge tone="accent">{t("summary.record")}</Badge>}
                    {change(e.change)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("summary.muscles")}</h3>
            <ul className="flex flex-wrap gap-1.5">
              {s.muscles.map((m) => (
                <li key={m.muscle} className="rounded-full bg-surface-2 px-2.5 py-1 text-sm">
                  {t(`muscles.${m.muscle}`)} <span className="tabular-nums text-muted">{m.sets}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <p className="text-sm text-muted">
        {week.planned ? t("summary.week", { n: week.done, planned: week.planned }) : t("summary.weekNoPlan", { n: week.done })}
      </p>
      <LinkButton href="/" full>{t("summary.close")}</LinkButton>
    </Card>
  );
}
