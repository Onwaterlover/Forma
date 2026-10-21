"use client";
import { ArrowDown, ArrowUp, Minus, Plus, Repeat, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { analyzePlan, optimizePlan, planAction, savePlanEdit } from "@/app/actions/training";
import { Sheet, useToast } from "@/components/client";
import { FilterRow } from "@/components/filter-row";
import { Button, Card, cx, Input, Notice, Select } from "@/components/ui";
import { moveSession } from "@/engine/adapt";
import { estimateMinutes } from "@/engine/duration";
import { isPossible } from "@/engine/equipment";
import { EXERCISES } from "@/engine/exercises";
import { prescribe } from "@/engine/prescribe";
import { defaultProfile } from "@/engine/profile";
import { matchesQuery, REGIONS, regionsOf, type Region } from "@/engine/regions";
import { substitutes } from "@/engine/select";
import type { Exercise, ExercisePref, Grip, Plan, PlannedExercise, PlannedSession, TrainingProfile, Weekday } from "@/engine/types";
import { validatePlan } from "@/engine/validate";
import { DICTS, exName, fmtRest, renderMessage } from "@/i18n";
import { useI18n } from "@/i18n/client";

const REST_OPTIONS = [45, 60, 75, 90, 120, 150, 180, 240];

export function PlanEditor({
  planId, name, initial, profile, prefs, custom, source, then, lastKg = {},
}: {
  planId: string;
  name: string;
  initial: Plan;
  profile: TrainingProfile | null;
  prefs: Record<string, ExercisePref>;
  custom: Exercise[];
  source: "generated" | "manual" | "imported";
  then: "analyze" | "optimize" | null;
  lastKg?: Record<string, { kg: number; at: string }>;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const library = useMemo(() => [...EXERCISES, ...custom], [custom]);
  const lookup = (id: string) => library.find((e) => e.id === id);
  const [plan, setPlan] = useState<Plan>(initial);
  const [title, setTitle] = useState(name);
  const [dirty, setDirty] = useState(false);
  // A change saved elsewhere (e.g. the assistant on this page) arrives as new props: show it unless there are unsaved edits.
  useEffect(() => {
    if (!dirty) { setPlan(initial); setTitle(name); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, name]);
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState<{ mode: "swap" | "add"; session: string; index?: number } | null>(null);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<Region | null>(null);
  const days = DICTS[locale].days.long;
  const effProfile = profile ?? defaultProfile();
  const ctx = { profile: effProfile, prefs, library };

  useEffect(() => {
    setPlan(initial);
    setDirty(false);
  }, [initial]);

  // Imports offer "analyse" and "optimise" right after saving.
  useEffect(() => {
    if (then === "optimize" && profile) start(async () => { await optimizePlan(planId); router.replace(`/training/plan/${planId}`); router.refresh(); });
    if (then === "analyze") document.getElementById("plan-issues")?.scrollIntoView({ behavior: "smooth" });
  }, [then, planId, profile, router]);

  const issues = useMemo(() => (profile ? validatePlan({ plan, profile, prefs, library }) : []), [plan, profile, prefs, library]);
  const locName = (id: string) => profile?.locations.find((l) => l.id === id)?.name ?? id;

  const update = (key: string, fn: (s: PlannedSession) => PlannedSession) => {
    setPlan((p) => ({
      ...p,
      sessions: p.sessions.map((s) => {
        if (s.key !== key) return s;
        const next = fn(s);
        return { ...next, estimatedMinutes: estimateMinutes(next.exercises, lookup) };
      }),
    }));
    setDirty(true);
  };
  // Weight shown in the plan: one typed here after the last session, otherwise the last one actually lifted.
  const shownKg = (e: PlannedExercise) => {
    const last = lastKg[e.exerciseId];
    return e.startKg && (!last || (e.startKgAt ?? "") > last.at) ? e.startKg : last?.kg;
  };
  const editEx = (key: string, i: number, patch: Partial<PlannedExercise>) =>
    update(key, (s) => ({ ...s, exercises: s.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));

  const save = () =>
    start(async () => {
      if (title.trim() && title !== name) await planAction(planId, "rename", title);
      const r = await savePlanEdit(planId, plan, t("plan.edited"));
      toast({ text: r.error ? t("common.error") : t("common.saved") });
      if (!r.error) {
        setDirty(false);
        router.refresh();
      }
    });

  const sheetSession = sheet ? plan.sessions.find((s) => s.key === sheet.session) : null;
  const sheetEquipment = profile?.locations.find((l) => l.id === sheetSession?.locationId)?.equipment ?? null;
  const used = new Set(sheetSession?.exercises.map((e) => e.exerciseId) ?? []);
  const sheetOriginal = sheet?.mode === "swap" && sheetSession ? lookup(sheetSession.exercises[sheet.index!]!.exerciseId) : undefined;
  const options = useMemo(() => {
    if (!sheet || !sheetSession) return [];
    if (sheet.mode === "swap" && sheetOriginal) {
      return substitutes(sheetOriginal, { ...ctx, equipment: sheetEquipment ?? [], excludeIds: used }).slice(0, 15).map((e) => ({ e, ok: true }));
    }
    // Whole library, narrowed by body part and/or search; no cap, so nothing late in the alphabet goes missing.
    return library
      .filter((e) => !used.has(e.id) && (!region || regionsOf(e).includes(region)) && matchesQuery(e, query))
      .map((e) => ({ e, ok: sheetEquipment ? isPossible(e, sheetEquipment, effProfile.excludedKinds) : true }))
      .sort((a, b) => Number(b.ok) - Number(a.ok) || exName(a.e, locale).localeCompare(exName(b.e, locale)));
  }, [sheet, query, region, plan]);

  const pick = (ex: Exercise) => {
    if (!sheet) return;
    if (sheet.mode === "swap") {
      update(sheet.session, (s) => ({
        ...s,
        exercises: s.exercises.map((e, j) => (j === sheet.index ? { ...prescribe(effProfile, ex, e.priority), sets: e.sets, superset: e.superset } : e)),
      }));
    } else {
      update(sheet.session, (s) => ({ ...s, exercises: [...s.exercises, prescribe(effProfile, ex, 2)] }));
    }
    setSheet(null);
    setQuery("");
  };

  const msg = (code: string, params: Record<string, string | number> = {}) => renderMessage({ code, params }, t, locale, lookup, locName);

  return (
    <div className="space-y-4">
      <Input aria-label={t("plan.rename")} value={title} maxLength={60} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="text-lg font-semibold" />

      <div id="plan-issues">
        {!profile && source !== "generated" && <Notice tone="neutral">{t("import.noProfile")}</Notice>}
        {issues.length > 0 && (
          <Notice tone={issues.some((i) => i.severity === "error") ? "danger" : "warning"}>
            <p className="mb-1 font-medium">{t("plan.issues")}</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {issues.slice(0, 12).map((i, k) => (
                <li key={k}>{msg(i.code, { ...i.params, ...(i.session ? { session: i.session } : {}), ...(i.exerciseId ? { exercise: i.exerciseId } : {}) })}</li>
              ))}
            </ul>
          </Notice>
        )}
      </div>

      {source !== "generated" && profile && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => start(async () => { const r = await analyzePlan(planId); toast({ text: r.issues ? `${t("import.analysisTitle")}: ${r.issues.length}` : t("import.noProfile") }); })}>{t("import.analyze")}</Button>
          <Button variant="secondary" size="sm" disabled={pending || dirty} onClick={() => start(async () => { await optimizePlan(planId); router.refresh(); toast({ text: t("common.saved") }); })}>{t("import.optimize")}</Button>
        </div>
      )}

      {plan.sessions.map((s) => (
        <Card key={s.key} className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <Input aria-label={t("plan.sessionName")} className="min-w-40 flex-1 font-medium" value={s.name ?? t(`template.${s.template}`)} maxLength={60}
              onChange={(e) => update(s.key, (x) => ({ ...x, name: e.target.value }))} />
            <Select aria-label={t("plan.moveDay")} className="w-40" value={s.day ?? ""}
              onChange={(e) => {
                const v = e.target.value === "" ? null : (Number(e.target.value) as Weekday);
                if (v === null || !profile) return update(s.key, (x) => ({ ...x, day: v }));
                const r = moveSession(s, v, ctx);
                if (r.changes[0]?.code === "day_unavailable") return toast({ text: msg("day_unavailable", { session: s.key }) });
                update(s.key, () => r.session);
                r.changes.forEach((c) => toast({ text: msg(c.code, c.params) }));
              }}>
              <option value="">{t("plan.noDay")}</option>
              {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </Select>
            {profile && (
              <Select aria-label={t("plan.location")} className="w-40" value={s.locationId}
                onChange={(e) => update(s.key, (x) => ({ ...x, locationId: e.target.value }))}>
                {profile.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            )}
          </div>
          <p className="text-sm text-muted">{t("plan.estimated", { n: s.estimatedMinutes })}</p>

          <ul className="divide-y divide-border">
            {s.exercises.map((e, i) => {
              const ex = lookup(e.exerciseId);
              return (
                <li key={`${e.exerciseId}-${i}`} className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{exName(ex, locale, e.exerciseId)}</p>
                    <div className="flex shrink-0">
                      <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30" disabled={i === 0} aria-label="↑"
                        onClick={() => update(s.key, (x) => { const xs = [...x.exercises]; [xs[i - 1], xs[i]] = [xs[i]!, xs[i - 1]!]; return { ...x, exercises: xs }; })}><ArrowUp size={16} /></button>
                      <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30" disabled={i === s.exercises.length - 1} aria-label="↓"
                        onClick={() => update(s.key, (x) => { const xs = [...x.exercises]; [xs[i + 1], xs[i]] = [xs[i]!, xs[i + 1]!]; return { ...x, exercises: xs }; })}><ArrowDown size={16} /></button>
                      <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label={t("plan.swap")} onClick={() => setSheet({ mode: "swap", session: s.key, index: i })}><Repeat size={16} /></button>
                      <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-danger hover:bg-danger-soft" aria-label={t("plan.remove")}
                        onClick={() => update(s.key, (x) => ({ ...x, exercises: x.exercises.filter((_, j) => j !== i).map((y) => (y.superset === e.superset ? { ...y, superset: undefined } : y)) }))}><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    <span className="inline-flex items-center gap-1">
                      <button type="button" className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2" aria-label={`${t("plan.sets")} −`} onClick={() => editEx(s.key, i, { sets: Math.max(1, e.sets - 1) })}><Minus size={14} /></button>
                      <span className="w-14 text-center tabular-nums">{e.sets} {t("plan.sets")}</span>
                      <button type="button" className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2" aria-label={`${t("plan.sets")} +`} onClick={() => editEx(s.key, i, { sets: Math.min(10, e.sets + 1) })}><Plus size={14} /></button>
                    </span>
                    {e.seconds ? (
                      <label className="inline-flex items-center gap-1.5">
                        <Input type="number" inputMode="numeric" className="h-9 w-20 text-center" value={e.seconds} min={5} max={3600} onChange={(ev) => editEx(s.key, i, { seconds: Math.max(5, Number(ev.target.value) || 5) })} />
                        {t("plan.seconds")}
                      </label>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Input type="number" inputMode="numeric" aria-label="min" className="h-9 w-16 text-center" value={e.repMin} min={1} max={50} onChange={(ev) => editEx(s.key, i, { repMin: Math.max(1, Number(ev.target.value) || 1) })} />
                        –
                        <Input type="number" inputMode="numeric" aria-label="max" className="h-9 w-16 text-center" value={e.repMax} min={1} max={50} onChange={(ev) => editEx(s.key, i, { repMax: Math.max(1, Number(ev.target.value) || 1) })} />
                        {t("plan.reps")}
                      </span>
                    )}
                    {!e.seconds && ex && ex.loading !== "bodyweight" && ex.loading !== "time" && (
                      <label className="inline-flex items-center gap-1.5">
                        <Input type="number" inputMode="decimal" step={0.25} min={0} max={500} aria-label={t("plan.weight")} placeholder="—" className="h-9 w-20 text-center"
                          value={shownKg(e) ?? ""}
                          onChange={(ev) => {
                            const v = Number(ev.target.value.replace(",", "."));
                            editEx(s.key, i, ev.target.value && v > 0 ? { startKg: Math.min(500, v), startKgAt: new Date().toISOString() } : { startKg: undefined, startKgAt: undefined });
                          }} />
                        kg
                      </label>
                    )}
                    {ex?.grips && (
                      <Select aria-label={t("plan.grip")} className="h-9 w-32" value={e.grip ?? ex.grips[0]} onChange={(ev) => editEx(s.key, i, { grip: ev.target.value as Grip })}>
                        {ex.grips.map((g) => <option key={g} value={g}>{t("plan.grip")}: {t(`plan.grips.${g}`)}</option>)}
                      </Select>
                    )}
                    <Select aria-label={t("plan.rest")} className="h-9 w-28" value={e.restSec} onChange={(ev) => editEx(s.key, i, { restSec: Number(ev.target.value) })}>
                      {[...new Set([...REST_OPTIONS, e.restSec])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{t("plan.rest")} {fmtRest(r)}</option>)}
                    </Select>
                  </div>
                </li>
              );
            })}
          </ul>
          <Button variant="secondary" size="sm" onClick={() => setSheet({ mode: "add", session: s.key })}><Plus size={16} aria-hidden />{t("plan.addExercise")}</Button>
        </Card>
      ))}

      {plan.sessions.length < 7 && (
        <Button variant="ghost" onClick={() => {
          const key = String.fromCharCode(65 + plan.sessions.length);
          setPlan((p) => ({ ...p, sessions: [...p.sessions, { key, template: "IMPORTED", name: `${t("template.IMPORTED")} ${key}`, day: null, locationId: profile?.locations[0]?.id ?? "", exercises: [], estimatedMinutes: 0 }] }));
          setDirty(true);
        }}><Plus size={16} aria-hidden />{t("plan.addSession")}</Button>
      )}

      <div className={cx("sticky bottom-[calc(5rem_+_env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3 shadow-lg md:bottom-4", !dirty && "hidden")}>
        <span className="text-sm text-muted">{t("plan.unsaved")}</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setPlan(initial); setTitle(name); setDirty(false); }}>{t("plan.discard")}</Button>
          <Button size="sm" onClick={save} disabled={pending}>{t("plan.saveVersion")}</Button>
        </div>
      </div>

      <Sheet open={!!sheet} onClose={() => { setSheet(null); setQuery(""); setRegion(null); }} title={sheet?.mode === "swap" ? t("plan.alternatives") : t("plan.addExercise")}>
        {sheet?.mode === "add" && (
          <div className="mb-3 space-y-2">
            <Input type="search" placeholder={t("library.search")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("library.search")} />
            <FilterRow label={t("library.regionFilter")} value={region} onChange={setRegion} options={REGIONS.map((r) => ({ value: r, label: t(`library.region.${r}`) }))} allLabel={t("library.all")} />
          </div>
        )}
        {sheet?.mode === "swap" && sheetOriginal && prefs[sheetOriginal.id] === "pain" && <Notice tone="warning" className="mb-3">{t("plan.painCaution")}</Notice>}
        {options.length === 0 ? (
          <p className="text-sm text-muted">{t("plan.noAlternatives")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {options.map(({ e, ok }) => (
              <li key={e.id}>
                <button type="button" onClick={() => pick(e)} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-surface-2">
                  <span>
                    <span className="block font-medium">{exName(e, locale)}</span>
                    <span className="block text-xs text-muted">{e.primary.map((m) => t(`muscles.${m}`)).join(", ") || t(`patterns.${e.pattern}`)}</span>
                  </span>
                  {!ok && <span className="text-xs text-warning">{t("msg.equipment_unavailable", { exercise: "" }).replace(/^:\s*/, "")}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
