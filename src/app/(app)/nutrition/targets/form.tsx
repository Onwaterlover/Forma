"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveTarget } from "@/app/actions/nutrition";
import { Choices, DecimalInput, useToast } from "@/components/client";
import { Button, Card, Field, Notice, Select } from "@/components/ui";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { initialEstimate, KCAL_PER_KG, proteinTarget, type AdaptiveResult, type Sex, type TargetSuggestion, type WeightGoal } from "@/nutrition/energy";

const GOALS: WeightGoal[] = ["maintain", "lose", "gain", "recomp"];
const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 } as const;
type Activity = keyof typeof ACTIVITY;

export function TargetsForm({
  target, lastKg, adaptive, suggestion,
}: {
  target: { kcal: number | null; protein: number | null; goal: WeightGoal | null } | null;
  lastKg: number | null;
  adaptive: AdaptiveResult;
  suggestion: TargetSuggestion | null;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"track" | "estimate">(target?.kcal ? "estimate" : "track");
  const [est, setEst] = useState<{ sex: Sex | null; age: number | null; height: number | null; weight: number | null; activity: Activity | null }>({ sex: null, age: null, height: null, weight: lastKg, activity: null });
  const [goal, setGoal] = useState<WeightGoal>(target?.goal ?? "maintain");
  const [kcal, setKcal] = useState<number | null>(target?.kcal ?? null);
  const [protein, setProtein] = useState<number | null>(target?.protein ?? null);
  const [dismissed, setDismissed] = useState(false);

  const result = est.sex && est.activity && est.age && est.height && est.weight && est.age >= 14 && est.age <= 100 && est.height > 100 && est.height < 250 && est.weight > 30 && est.weight < 300
    ? initialEstimate({ sex: est.sex, age: est.age, heightCm: est.height, weightKg: est.weight, activity: ACTIVITY[est.activity!] })
    : null;
  const suggestedFromEstimate = result
    ? Math.round((goal === "lose" ? result.tdee - Math.min(500, ((est.weight ?? 70) * 0.005 * KCAL_PER_KG) / 7) : goal === "gain" ? result.tdee + 200 : result.tdee) / 50) * 50
    : null;
  const proteinSuggestion = est.weight && est.weight > 30 && est.weight < 300 ? proteinTarget(est.weight, goal) : lastKg ? proteinTarget(lastKg, goal) : null;

  const save = (k: number | null, p: number | null, source: "manual" | "estimate" | "suggestion") =>
    start(async () => {
      const r = await saveTarget({ kcal: k, protein: p, goal: k ? goal : null, source });
      toast({ text: r.error ? t("common.error") : t("common.saved") });
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <Choices name={t("targets.title")} value={mode} onChange={setMode}
          options={[{ value: "track", label: t("targets.justTrack"), hint: t("targets.justTrackHint") }, { value: "estimate", label: t("targets.estimate") }]} />
        {mode === "track" && target?.kcal ? <Button variant="secondary" onClick={() => save(null, null, "manual")} disabled={pending}>{t("targets.none")}</Button> : null}
      </Card>

      {mode === "estimate" && (
        <>
          <Card className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <p className="text-sm font-medium">{t("targets.sex")}</p>
                <Choices<Sex> name={t("targets.sex")} columns={2} value={est.sex} onChange={(sex) => setEst({ ...est, sex })}
                  options={(["female", "male"] as const).map((x) => ({ value: x, label: t(`targets.sexOpt.${x}`) }))} />
              </div>
              <Field label={t("targets.age")} htmlFor="age"><DecimalInput id="age" value={est.age} onChange={(v) => setEst({ ...est, age: v })} /></Field>
              <Field label={t("targets.height")} htmlFor="height"><DecimalInput id="height" value={est.height} onChange={(v) => setEst({ ...est, height: v })} /></Field>
              <Field label={t("targets.weight")} htmlFor="weight"><DecimalInput id="weight" value={est.weight} onChange={(v) => setEst({ ...est, weight: v })} /></Field>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t("targets.activity")}</p>
              <Choices<Activity> name={t("targets.activity")} value={est.activity} onChange={(activity) => setEst({ ...est, activity })}
                options={(Object.keys(ACTIVITY) as Activity[]).map((k) => ({ value: k, label: t(`targets.activityOpt.${k}`), hint: t(`targets.activityHint.${k}`) }))} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{t("targets.goal")}</p>
              <Choices name={t("targets.goal")} columns={2} value={goal} onChange={setGoal} options={GOALS.map((g) => ({ value: g, label: t(`targets.goalOpt.${g}`) }))} />
            </div>
            {result && (
              <Notice tone="accent">
                <p className="font-medium">{t("targets.result", { tdee: fmt(locale, result.tdee), low: fmt(locale, result.low), high: fmt(locale, result.high) })}</p>
                {suggestedFromEstimate && <p className="mt-1">{t("targets.suggested", { kcal: fmt(locale, suggestedFromEstimate) })}</p>}
                {proteinSuggestion && <p className="mt-1">{t("targets.proteinSuggested", { g: proteinSuggestion, perKg: fmt(locale, goal === "lose" || goal === "recomp" ? 1.8 : 1.6, 1) })}</p>}
                <p className="mt-2 text-xs text-muted">{t("targets.disclaimer")}</p>
                {suggestedFromEstimate && <Button size="sm" className="mt-3" disabled={pending} onClick={() => { setKcal(suggestedFromEstimate); setProtein(proteinSuggestion); save(suggestedFromEstimate, proteinSuggestion ?? protein, "estimate"); }}>{t("common.apply")}</Button>}
              </Notice>
            )}
          </Card>

          <Card className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("targets.kcal")} htmlFor="kcal"><DecimalInput id="kcal" value={kcal} onChange={setKcal} /></Field>
              <Field label={t("targets.protein")} htmlFor="protein" hint={proteinSuggestion ? t("targets.proteinSuggested", { g: proteinSuggestion, perKg: fmt(locale, goal === "lose" || goal === "recomp" ? 1.8 : 1.6, 1) }) : t("targets.proteinHint")}><DecimalInput id="protein" value={protein} onChange={setProtein} /></Field>
            </div>
            <Button disabled={pending || !kcal || kcal < 800} onClick={() => save(kcal, protein, "manual")}>{t("common.save")}</Button>
            <p className="text-xs text-muted">{t("targets.exerciseNote")}</p>
          </Card>
        </>
      )}

      <Card className="space-y-2">
        <h2 className="font-semibold">{t("targets.adaptive")}</h2>
        {adaptive.status === "insufficient" ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{adaptive.reasons.map((r) => <li key={r}>{t(`targets.reason.${r}`)}</li>)}</ul>
        ) : (
          <>
            <p className="text-sm">
              {adaptive.status === "ok"
                ? t("targets.adaptiveResult", { tdee: fmt(locale, adaptive.tdee), low: fmt(locale, adaptive.low), high: fmt(locale, adaptive.high) })
                : t("targets.adaptiveUncertain", { tdee: fmt(locale, adaptive.tdee), low: fmt(locale, adaptive.low), high: fmt(locale, adaptive.high) })}
            </p>
            <p className="text-xs text-muted">{t("targets.adaptiveBasis", { days: adaptive.loggedDays, weighIns: adaptive.weighIns, kg: fmt(locale, adaptive.kgPerWeek, 2) })}</p>
          </>
        )}
        {suggestion && !dismissed && (
          suggestion.kind === "change" ? (
            <Notice tone="accent" className="mt-2">
              <p>{t(`targets.reason.${suggestion.reason}`)} {t("targets.suggested", { kcal: fmt(locale, suggestion.kcal) })}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" disabled={pending} onClick={() => save(suggestion.kcal, target?.protein ?? proteinSuggestion, "suggestion")}>{t("common.accept")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>{t("common.reject")}</Button>
              </div>
            </Notice>
          ) : (
            <p className="text-sm text-muted">{t(`targets.reason.${suggestion.reason}`)}</p>
          )
        )}
      </Card>
    </div>
  );
}
