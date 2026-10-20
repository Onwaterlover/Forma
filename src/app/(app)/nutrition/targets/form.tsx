"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveTarget } from "@/app/actions/nutrition";
import { Choices, DecimalInput, useToast } from "@/components/client";
import { Button, Card, Field, Notice, Select } from "@/components/ui";
import { fmt } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { initialEstimate, KCAL_PER_KG, type AdaptiveResult, type Sex, type TargetSuggestion, type WeightGoal } from "@/nutrition/energy";

const GOALS: WeightGoal[] = ["maintain", "lose", "gain", "recomp"];
const ACTIVITY = ["1.2", "1.375", "1.55", "1.725"] as const;

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
  const [est, setEst] = useState<{ sex: Sex; age: number | null; height: number | null; weight: number | null; activity: (typeof ACTIVITY)[number] }>({ sex: "unspecified", age: null, height: null, weight: lastKg, activity: "1.375" });
  const [goal, setGoal] = useState<WeightGoal>(target?.goal ?? "maintain");
  const [kcal, setKcal] = useState<number | null>(target?.kcal ?? null);
  const [protein, setProtein] = useState<number | null>(target?.protein ?? null);
  const [dismissed, setDismissed] = useState(false);

  const result = est.age && est.height && est.weight && est.age >= 14 && est.age <= 100 && est.height > 100 && est.height < 250 && est.weight > 30 && est.weight < 300
    ? initialEstimate({ sex: est.sex, age: est.age, heightCm: est.height, weightKg: est.weight, activity: Number(est.activity) as 1.2 })
    : null;
  const suggestedFromEstimate = result
    ? Math.round((goal === "lose" ? result.tdee - Math.min(500, ((est.weight ?? 70) * 0.005 * KCAL_PER_KG) / 7) : goal === "gain" ? result.tdee + 200 : result.tdee) / 50) * 50
    : null;

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
              <Field label={t("targets.sex")} htmlFor="sex">
                <Select id="sex" value={est.sex} onChange={(e) => setEst({ ...est, sex: e.target.value as Sex })}>
                  {(["female", "male", "unspecified"] as const).map((s) => <option key={s} value={s}>{t(`targets.sexOpt.${s}`)}</option>)}
                </Select>
              </Field>
              <Field label={t("targets.age")} htmlFor="age"><DecimalInput id="age" value={est.age} onChange={(v) => setEst({ ...est, age: v })} /></Field>
              <Field label={t("targets.height")} htmlFor="height"><DecimalInput id="height" value={est.height} onChange={(v) => setEst({ ...est, height: v })} /></Field>
              <Field label={t("targets.weight")} htmlFor="weight"><DecimalInput id="weight" value={est.weight} onChange={(v) => setEst({ ...est, weight: v })} /></Field>
            </div>
            <Field label={t("targets.activity")} htmlFor="act">
              <Select id="act" value={est.activity} onChange={(e) => setEst({ ...est, activity: e.target.value as (typeof ACTIVITY)[number] })}>
                {ACTIVITY.map((a) => <option key={a} value={a}>{t(`targets.activityOpt.${a}`)}</option>)}
              </Select>
            </Field>
            <div>
              <p className="mb-2 text-sm font-medium">{t("targets.goal")}</p>
              <Choices name={t("targets.goal")} columns={2} value={goal} onChange={setGoal} options={GOALS.map((g) => ({ value: g, label: t(`targets.goalOpt.${g}`) }))} />
            </div>
            {result && (
              <Notice tone="accent">
                <p className="font-medium">{t("targets.result", { tdee: fmt(locale, result.tdee), low: fmt(locale, result.low), high: fmt(locale, result.high) })}</p>
                {suggestedFromEstimate && <p className="mt-1">{t("targets.suggested", { kcal: fmt(locale, suggestedFromEstimate) })}</p>}
                <p className="mt-2 text-xs text-muted">{t("targets.disclaimer")}</p>
                {suggestedFromEstimate && <Button size="sm" className="mt-3" disabled={pending} onClick={() => { setKcal(suggestedFromEstimate); save(suggestedFromEstimate, protein, "estimate"); }}>{t("common.apply")}</Button>}
              </Notice>
            )}
          </Card>

          <Card className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("targets.kcal")} htmlFor="kcal"><DecimalInput id="kcal" value={kcal} onChange={setKcal} /></Field>
              <Field label={t("targets.protein")} htmlFor="protein" hint={t("targets.proteinHint")}><DecimalInput id="protein" value={protein} onChange={setProtein} /></Field>
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
                <Button size="sm" disabled={pending} onClick={() => save(suggestion.kcal, target?.protein ?? null, "suggestion")}>{t("common.accept")}</Button>
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
