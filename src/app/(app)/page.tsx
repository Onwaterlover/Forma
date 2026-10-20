import { ChevronRight, Play } from "lucide-react";
import Link from "next/link";
import { startWorkout } from "@/app/actions/training";
import { Badge, Card, LinkButton, Meter, SectionTitle } from "@/components/ui";
import { nextSession } from "@/engine/adapt";
import { fmt } from "@/i18n";
import { pageCtx, todayIso, weekdayOf } from "@/lib/ctx";
import { currentTarget, diaryDay, getActivePlan, getProfile, inProgressWorkout, lastCompletedSessionKey, libraryFor, listWeights } from "@/lib/data";
import { exName } from "@/i18n";
import { StartChoices } from "./start-choices";
import { QuickWeight } from "./quick-weight";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { user, locale, t, settings } = await pageCtx();
  const today = todayIso();
  const plan = settings.modules.training ? getActivePlan(user.id) : null;
  const running = inProgressWorkout(user.id);
  const day = diaryDay(user.id, today);
  const target = currentTarget(user.id);
  const weights = listWeights(user.id, today);
  const library = libraryFor(user.id);
  const lookup = (id: string) => library.find((e) => e.id === id);

  const next = plan ? nextSession(plan.data.sessions, weekdayOf(today) as never, lastCompletedSessionKey(user.id, plan.id)) : null;
  const scheduledToday = plan?.data.sessions.some((s) => s.day === weekdayOf(today));
  const showStart = !settings.onboarded && !plan && day.entries.length === 0;
  const profile = getProfile(user.id);
  const locName = (id: string) => profile?.locations.find((l) => l.id === id)?.name ?? "";

  return (
    <>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">{t("today.greeting", { name: user.name })}</h1>
      {showStart && <StartChoices t={t} />}

      {settings.modules.training && (
        <>
          <SectionTitle>{t("today.nextWorkout")}</SectionTitle>
          {running ? (
            <Card className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{running.name}</p>
                <Badge tone="accent">{t("workout.inProgress")}</Badge>
              </div>
              <LinkButton href={`/workout/${running.id}`}><Play size={18} aria-hidden />{t("workout.resume")}</LinkButton>
            </Card>
          ) : next && plan ? (
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-medium">{next.name ?? t(`template.${next.template}`)}</p>
                  <p className="text-sm text-muted">
                    {t("plan.estimated", { n: next.estimatedMinutes })}
                    {locName(next.locationId) ? ` · ${locName(next.locationId)}` : ""}
                  </p>
                  {!scheduledToday && plan.data.sessions.some((s) => s.day !== null) && <p className="mt-1 text-sm text-muted">{t("today.restDay")}</p>}
                </div>
                <form action={startWorkout.bind(null, plan.id, next.key)}>
                  <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 font-medium text-accent-contrast hover:bg-accent-hover">
                    <Play size={18} aria-hidden />{t("plan.start")}
                  </button>
                </form>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {next.exercises.map((e) => (
                  <li key={e.exerciseId} className="flex justify-between gap-3">
                    <span className="truncate">{exName(lookup(e.exerciseId), locale, e.exerciseId)}</span>
                    <span className="shrink-0 tabular-nums text-muted">{e.sets} × {e.seconds ? `${e.seconds}s` : `${e.repMin}–${e.repMax}`}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted">{t("today.noPlan")}</p>
              <LinkButton href="/training/setup" size="sm">{t("plan.create")}</LinkButton>
            </Card>
          )}
        </>
      )}

      {settings.modules.nutrition && (
        <>
          <SectionTitle action={<Link href="/nutrition" className="text-sm font-medium text-accent">{t("today.logFood")}</Link>}>{t("today.food")}</SectionTitle>
          <Link href="/nutrition" className="block">
            <Card className="transition-colors hover:border-accent">
              <div className="flex items-baseline justify-between">
                <p className="text-3xl font-semibold tabular-nums">{fmt(locale, day.totals.kcal ?? 0)}<span className="ml-1 text-base font-normal text-muted">{t("common.kcal")}</span></p>
                <ChevronRight className="text-muted" size={20} aria-hidden />
              </div>
              {target?.kcal ? (
                <div className="mt-3 space-y-1.5">
                  <Meter value={day.totals.kcal ?? 0} max={target.kcal} label={t("nutrition.target")} />
                  <p className="text-sm text-muted">
                    {(day.totals.kcal ?? 0) <= target.kcal
                      ? t("nutrition.remaining", { n: fmt(locale, target.kcal - (day.totals.kcal ?? 0)) })
                      : t("nutrition.over", { n: fmt(locale, (day.totals.kcal ?? 0) - target.kcal) })}
                  </p>
                </div>
              ) : null}
              <p className="mt-2 text-sm text-muted">
                {t("nutrition.protein")} {fmt(locale, day.totals.protein ?? 0)} g{target?.protein_g ? ` / ${fmt(locale, target.protein_g)} g` : ""}
              </p>
            </Card>
          </Link>
        </>
      )}

      <SectionTitle>{t("today.weight")}</SectionTitle>
      <Card>
        <QuickWeight date={today} current={weights.find((w) => w.date === today)?.kg ?? null} />
      </Card>
    </>
  );
}
