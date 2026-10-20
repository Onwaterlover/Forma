"use client";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { saveProfileAndGenerate, saveProfileOnly } from "@/app/actions/training";
import { Chips, Choices, Switch, useToast } from "@/components/client";
import { Button, Card, cx, Input, Notice, Select, Textarea } from "@/components/ui";
import { availableKinds, LOCATION_PRESETS } from "@/engine/equipment";
import { EXERCISES } from "@/engine/exercises";
import { BALANCED } from "@/engine/volume";
import {
  EQUIPMENT, KINDS, type Equipment, type Goal, type Kind, type Location, type Muscle, type MusclePriority, type Sport, type StylePref, type TrainingProfile, type Weekday,
} from "@/engine/types";
import { DICTS, exName } from "@/i18n";
import { useI18n } from "@/i18n/client";

const GOALS: Goal[] = ["muscle", "strength", "health", "conditioning", "sport", "start", "unsure"];
const PRESETS = Object.keys(LOCATION_PRESETS) as (keyof typeof LOCATION_PRESETS)[];
const UPPER_PRIORITY: Partial<Record<Muscle, MusclePriority>> = { chest: "high", lats: "high", upper_back: "high", side_delts: "high", quads: "low", hamstrings: "low", glutes: "low", calves: "low" };
const LOWER_PRIORITY: Partial<Record<Muscle, MusclePriority>> = { quads: "high", hamstrings: "high", glutes: "high" };
type PriorityPreset = "balanced" | "upper" | "lower" | "custom";

function presetOf(p: TrainingProfile["priorities"]): PriorityPreset {
  const eq = (a: object, b: object) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  if (Object.keys(p).length === 0) return "balanced";
  if (eq(p, UPPER_PRIORITY)) return "upper";
  if (eq(p, LOWER_PRIORITY)) return "lower";
  return "custom";
}

function blank(name: string): TrainingProfile {
  return {
    goal: "unsure", experience: "beginner", sessionsPerWeek: 3, sessionMinutes: 45, scheduleMode: "fixed",
    week: Array.from({ length: 7 }, () => ({ locations: [] })),
    locations: [{ id: "gym", name, kind: "gym", equipment: [...LOCATION_PRESETS.commercial_gym!.equipment] }],
    styles: [], excludedKinds: [], priorities: {}, sports: [], supersets: "allow",
  };
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function SetupWizard({ initial, initialExclude = [] }: { initial: TrainingProfile | null; initialExclude?: string[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const days = DICTS[locale].days;
  const [p, setP] = useState<TrainingProfile>(() => {
    if (initial) return initial;
    const b = blank(t("onb.preset.commercial_gym"));
    [0, 2, 4].forEach((d) => (b.week[d] = { locations: ["gym"] }));
    return b;
  });
  const [step, setStep] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const [preset, setPreset] = useState<PriorityPreset>(presetOf(p.priorities));
  const [openLoc, setOpenLoc] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [exclude, setExclude] = useState<string[]>(initialExclude);
  const [exQuery, setExQuery] = useState("");
  const up = (patch: Partial<TrainingProfile>) => setP((x) => ({ ...x, ...patch }));

  const steps = ["goal", "experience", "time", "places", "schedule", "more"] as const;
  const total = steps.length;
  const availableDays = p.week.filter((d) => !d.rest && d.locations.length > 0).length;
  // Only offer choices the user's equipment actually supports (no "machines" without machines, etc.).
  const kinds = useMemo(() => availableKinds(p.locations, EXERCISES), [p.locations]);
  const styleOptions = (["machines", "free", "bodyweight"] as const).filter((st) =>
    st === "machines" ? ["machine", "cable", "smith"].some((k) => kinds.has(k as Kind)) : st === "free" ? ["barbell", "dumbbell", "kettlebell"].some((k) => kinds.has(k as Kind)) : true,
  );
  const kindOptions = KINDS.filter((k) => k !== "cardio" && k !== "bodyweight" && kinds.has(k));
  const anyDay = p.locations.length > 0 && p.week.every((d) => !d.rest && p.locations.every((l) => d.locations.includes(l.id)));
  const setAnyDay = (on: boolean) =>
    up({
      week: on
        ? p.week.map(() => ({ locations: p.locations.map((l) => l.id) }))
        : p.week.map((_, i) => ({ locations: [0, 2, 4].includes(i) && p.locations[0] ? [p.locations[0].id] : [] })),
    });
  // Keep stored choices consistent with what is available.
  const clean = (x: TrainingProfile): TrainingProfile => ({
    ...x,
    styles: x.styles.filter((st) => styleOptions.includes(st)),
    excludedKinds: x.excludedKinds.filter((k) => kindOptions.includes(k)),
  });
  const canNext = step !== 3 || p.locations.length > 0;

  const addPreset = (key: keyof typeof LOCATION_PRESETS) => {
    const preset = LOCATION_PRESETS[key]!;
    const id = `${key}_${uid()}`;
    up({ locations: [...p.locations, { id, name: t(`onb.preset.${key}`), kind: preset.kind, equipment: [...preset.equipment] }] });
    setOpenLoc(id);
  };
  const setLoc = (id: string, patch: Partial<Location>) => up({ locations: p.locations.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const removeLoc = (id: string) =>
    up({ locations: p.locations.filter((l) => l.id !== id), week: p.week.map((d) => ({ ...d, locations: d.locations.filter((x) => x !== id) })) });
  const toggleDayLoc = (d: number, id: string) =>
    up({ week: p.week.map((w, i) => (i !== d ? w : { ...w, rest: false, locations: w.locations.includes(id) ? w.locations.filter((x) => x !== id) : [...w.locations, id] })) });
  const toggleRest = (d: number) => up({ week: p.week.map((w, i) => (i !== d ? w : { locations: [], rest: !w.rest })) });

  const submit = (generate: boolean) =>
    start(async () => {
      const r = generate ? await saveProfileAndGenerate(clean(p), exclude) : await saveProfileOnly(clean(p), exclude);
      if (r?.error) toast({ text: t("common.error") });
      else if (!generate) toast({ text: t("common.saved") });
    });

  const sportNames = DICTS[locale].sports;
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
  const exMatches = exQuery.trim().length < 2 ? [] : EXERCISES.filter((e) => !exclude.includes(e.id) && [e.name[locale], e.name.en, ...(e.aliases ?? [])].some((n) => n && norm(n).includes(norm(exQuery.trim())))).slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5" aria-hidden>
          {steps.map((s, i) => <span key={s} className={cx("h-1.5 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-border")} />)}
        </div>
        <span className="text-xs text-muted">{t("onb.step", { n: step + 1, total })}</span>
      </div>

      {step === 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">{t("onb.goalQ")}</h2>
          <Choices name={t("onb.goalQ")} value={p.goal} onChange={(goal) => up({ goal })} options={GOALS.map((g) => ({ value: g, label: t(`onb.goal.${g}`), hint: t(`onb.goalHint.${g}`) }))} />
        </Card>
      )}

      {step === 1 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">{t("onb.experienceQ")}</h2>
          <Choices
            name={t("onb.experienceQ")}
            value={p.experience}
            onChange={(experience) => up({ experience })}
            options={(["beginner", "intermediate", "advanced"] as const).map((e) => ({ value: e, label: t(`onb.exp.${e}`), hint: t(`onb.expHint.${e}`) }))}
          />
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-6">
          <div>
            <h2 className="mb-1 text-lg font-semibold">{t("onb.sessionsQ")}</h2>
            <p className="mb-3 text-sm text-muted">{t("onb.sessionsHint")}</p>
            <Choices name={t("onb.sessionsQ")} columns={3} value={p.sessionsPerWeek} onChange={(sessionsPerWeek) => up({ sessionsPerWeek })} options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n}×` }))} />
          </div>
          <div>
            <h2 className="mb-3 text-lg font-semibold">{t("onb.minutesQ")}</h2>
            <Choices name={t("onb.minutesQ")} columns={3} value={p.sessionMinutes} onChange={(sessionMinutes) => up({ sessionMinutes })} options={[20, 30, 45, 60, 75, 90].map((n) => ({ value: n, label: `${n} ${t("common.min")}` }))} />
            <label className="mt-3 flex items-center gap-3 text-sm">
              <span className="text-muted">{t("onb.custom")}</span>
              <Input type="number" min={10} max={180} inputMode="numeric" className="w-24" value={p.sessionMinutes} onChange={(e) => up({ sessionMinutes: Math.max(10, Math.min(180, Number(e.target.value) || 10)) })} aria-label={t("onb.minutesQ")} />
              <span className="text-muted">{t("common.min")}</span>
            </label>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-4">
          <div>
            <h2 className="mb-1 text-lg font-semibold">{t("onb.whereQ")}</h2>
            <p className="text-sm text-muted">{t("onb.whereHint")}</p>
          </div>
          <ul className="space-y-2">
            {p.locations.map((l) => (
              <li key={l.id} className="rounded-xl border border-border">
                <div className="flex items-center gap-2 p-2 pl-3">
                  <Input aria-label={t("onb.locationName")} value={l.name} maxLength={60} onChange={(e) => setLoc(l.id, { name: e.target.value })} className="h-10 flex-1 border-transparent bg-transparent px-1 font-medium" />
                  <Button variant="ghost" size="sm" aria-expanded={openLoc === l.id} onClick={() => setOpenLoc(openLoc === l.id ? null : l.id)}>
                    {l.equipment.length} <ChevronDown size={16} className={cx("transition-transform", openLoc === l.id && "rotate-180")} aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={t("common.delete")} onClick={() => removeLoc(l.id)}><Trash2 size={16} aria-hidden /></Button>
                </div>
                {openLoc === l.id && (
                  <div className="border-t border-border p-3">
                    <p className="mb-3 text-xs text-muted">{t("onb.equipmentHint")}</p>
                    <Chips<Equipment>
                      label={t("onb.equipmentFor", { name: l.name })}
                      values={l.equipment}
                      onChange={(equipment) => setLoc(l.id, { equipment })}
                      options={EQUIPMENT.map((e) => ({ value: e, label: t(`equipment.${e}`) }))}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div>
            <p className="mb-2 text-sm font-medium">{t("onb.addLocation")}</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((k) => (
                <Button key={k} variant="secondary" size="sm" onClick={() => addPreset(k)}><Plus size={16} aria-hidden />{t(`onb.preset.${k}`)}</Button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="space-y-4">
          <div>
            <h2 className="mb-1 text-lg font-semibold">{t("onb.scheduleQ")}</h2>
            <p className="text-sm text-muted">{t("onb.scheduleHint")}</p>
          </div>
          <Switch checked={anyDay} onChange={setAnyDay} label={t("onb.anyDay")} hint={t("onb.anyDayHint")} />
          <ul className={cx("divide-y divide-border", anyDay && "hidden")}>
            {p.week.map((w, d) => (
              <li key={d} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="w-24 shrink-0 text-sm font-medium">{days.long[d]}</span>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {p.locations.map((l) => {
                    const on = w.locations.includes(l.id);
                    return (
                      <button key={l.id} type="button" aria-pressed={on} onClick={() => toggleDayLoc(d, l.id)}
                        className={cx("min-h-9 rounded-full border px-3 text-sm", on ? "border-accent bg-accent text-accent-contrast" : "border-border hover:bg-surface-2")}>
                        {l.name}
                      </button>
                    );
                  })}
                  <button type="button" aria-pressed={!!w.rest} onClick={() => toggleRest(d)}
                    className={cx("min-h-9 rounded-full border px-3 text-sm", w.rest ? "border-text bg-surface-2" : "border-dashed border-border text-muted hover:bg-surface-2")}>
                    {t("onb.restDay")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {availableDays < p.sessionsPerWeek && (
            <Notice tone="warning">{t("msg.fewer_days_than_requested", { requested: p.sessionsPerWeek, available: availableDays })}</Notice>
          )}
          <div>
            <p className="mb-2 text-sm font-medium">{t("onb.flexibleQ")}</p>
            <Choices name={t("onb.flexibleQ")} value={p.scheduleMode} onChange={(scheduleMode) => up({ scheduleMode })} options={[{ value: "fixed", label: t("onb.fixed") }, { value: "flexible", label: t("onb.flexible") }]} />
          </div>
        </Card>
      )}

      {step === 5 && (
        <>
          <Card className="space-y-4">
            <h2 className="text-lg font-semibold">{t("onb.styleQ")}</h2>
            <p className="text-sm text-muted">{t("onb.styleHint")}</p>
            <Chips<StylePref> label={t("onb.styleQ")} values={p.styles.filter((st) => styleOptions.includes(st))} onChange={(styles) => up({ styles })} options={styleOptions.map((st) => ({ value: st, label: t(`onb.style.${st}`) }))} />
          </Card>

          <button type="button" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced} className="flex w-full items-center justify-between rounded-xl px-1 py-2 text-sm font-medium text-accent">
            {t("onb.advanced")} <ChevronDown size={18} className={cx("transition-transform", advanced && "rotate-180")} aria-hidden />
          </button>

          {advanced && (
            <div className="space-y-4">
              <Card className="space-y-4">
                <h2 className="text-lg font-semibold">{t("onb.priorityQ")}</h2>
                <Choices<PriorityPreset>
                  name={t("onb.priorityQ")}
                  columns={2}
                  value={preset}
                  onChange={(v) => {
                    setPreset(v);
                    if (v === "balanced") up({ priorities: {} });
                    if (v === "upper") up({ priorities: { ...UPPER_PRIORITY } });
                    if (v === "lower") up({ priorities: { ...LOWER_PRIORITY } });
                  }}
                  options={(["balanced", "upper", "lower", "custom"] as const).map((k) => ({ value: k, label: t(`onb.priorityPreset.${k}`) }))}
                />
                {preset === "custom" && (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {BALANCED.map((m) => (
                      <li key={m} className="flex items-center justify-between gap-2">
                        <span className="text-sm">{t(`muscles.${m}`)}</span>
                        <Select className="h-10 w-40" value={p.priorities[m] ?? "normal"} aria-label={t(`muscles.${m}`)}
                          onChange={(e) => {
                            const v = e.target.value as MusclePriority;
                            const next = { ...p.priorities };
                            if (v === "normal") delete next[m];
                            else next[m] = v;
                            up({ priorities: next });
                          }}>
                          {(["high", "normal", "low", "maintain"] as const).map((v) => <option key={v} value={v}>{t(`onb.priorityLevel.${v}`)}</option>)}
                        </Select>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="space-y-3">
                <h2 className="text-lg font-semibold">{t("onb.excludeQ")}</h2>
                <p className="text-sm text-muted">{t("onb.excludeHint")}</p>
                <p className="text-sm font-medium">{t("onb.excludeKinds")}</p>
                <Chips<Kind> label={t("onb.excludeKinds")} values={p.excludedKinds.filter((k) => kindOptions.includes(k))} onChange={(excludedKinds) => up({ excludedKinds })} options={kindOptions.map((k) => ({ value: k, label: t(`kinds.${k}`) }))} />
                <p className="pt-2 text-sm font-medium">{t("onb.excludeExercises")}</p>
                {exclude.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {exclude.map((id) => (
                      <li key={id}>
                        <button type="button" onClick={() => setExclude(exclude.filter((x) => x !== id))} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm">
                          {exName(EXERCISES.find((e) => e.id === id), locale, id)}<X size={14} aria-label={t("common.delete")} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <Input value={exQuery} onChange={(e) => setExQuery(e.target.value)} placeholder={t("onb.excludeSearch")} aria-label={t("onb.excludeExercises")} />
                {exQuery.trim().length >= 2 && (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {exMatches.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">{t("onb.excludeNone")}</li>}
                    {exMatches.map((e) => (
                      <li key={e.id}>
                        <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-2" onClick={() => { setExclude([...exclude, e.id]); setExQuery(""); }}>
                          {exName(e, locale, e.id)}<Plus size={16} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="pt-2 text-sm font-medium">{t("onb.notesQ")}</p>
                <Textarea rows={3} maxLength={500} value={p.notes ?? ""} onChange={(e) => up({ notes: e.target.value || undefined })} placeholder={t("onb.notesPlaceholder")} aria-label={t("onb.notesQ")} />
                <p className="text-xs text-muted">{t("onb.notesHint")}</p>
              </Card>

              <Card className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">{t("onb.sportsQ")}</h2>
                  <p className="text-sm text-muted">{t("onb.sportsHint")}</p>
                </div>
                {p.sports.map((s, i) => {
                  const setSport = (patch: Partial<Sport>) => up({ sports: p.sports.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={s.id} className="space-y-3 rounded-xl border border-border p-3">
                      <div className="flex gap-2">
                        <Select value={s.type} aria-label={t("onb.addSport")} onChange={(e) => setSport({ type: e.target.value as Sport["type"] })}>
                          {Object.entries(sportNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </Select>
                        <Button variant="ghost" aria-label={t("common.delete")} onClick={() => up({ sports: p.sports.filter((_, j) => j !== i) })}><Trash2 size={16} aria-hidden /></Button>
                      </div>
                      {s.type === "other" && (
                        <Chips label="demands" values={s.demands ?? []} onChange={(demands) => setSport({ demands })} options={(["legs", "pull", "push", "grip", "full"] as const).map((r) => ({ value: r, label: t(`regions.${r}`) }))} />
                      )}
                      <div className="space-y-2">
                        <p className="text-sm">{t("onb.sportHow")}</p>
                        <Choices<"times" | "days"> name={`sport-mode-${s.id}`} columns={2} value={s.days.length ? "days" : "times"}
                          onChange={(m) => setSport(m === "times" ? { days: [] } : { days: [5] as Weekday[], perWeek: 1 })}
                          options={[{ value: "times", label: t("onb.sportTimesMode") }, { value: "days", label: t("onb.sportDaysMode") }]} />
                        {s.days.length ? (
                          <Chips<number> label={t("onb.sportDays")} values={s.days} onChange={(d) => setSport({ days: d as Weekday[], perWeek: Math.max(1, d.length) })} options={days.short.map((n, d) => ({ value: d, label: n }))} />
                        ) : (
                          <Chips<number> label={t("onb.sportHow")} values={[s.perWeek]} onChange={(v) => setSport({ perWeek: v.filter((x) => x !== s.perWeek)[0] ?? s.perWeek })} options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: t("onb.timesPerWeek", { n }) }))} />
                        )}
                      </div>
                      <Choices name={`intensity-${s.id}`} columns={3} value={s.intensity ?? "moderate"} onChange={(intensity) => setSport({ intensity })} options={(["easy", "moderate", "hard"] as const).map((k) => ({ value: k, label: t(`onb.intensity.${k}`) }))} />
                    </div>
                  );
                })}
                <Button variant="secondary" size="sm" onClick={() => up({ sports: [...p.sports, { id: uid(), type: "climbing", days: [], perWeek: 1, intensity: "moderate" }] })}>
                  <Plus size={16} aria-hidden />{t("onb.addSport")}
                </Button>
              </Card>

              <Card className="space-y-2">
                <Switch checked={p.supersets === "allow"} onChange={(v) => up({ supersets: v ? "allow" : "avoid" })} label={t("onb.supersetsQ")} />
                <Switch checked={!!p.conditioning} onChange={(v) => up({ conditioning: v })} label={t("onb.conditioning")} />
              </Card>
            </div>
          )}
        </>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>{t("common.back")}</Button>
        {step < total - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>{t("common.next")}</Button>
        ) : (
          <div className="flex gap-2">
            {initial && <Button variant="secondary" onClick={() => submit(false)} disabled={pending}>{t("onb.saveOnly")}</Button>}
            <Button onClick={() => submit(true)} disabled={pending || p.locations.length === 0}>{pending ? t("onb.generating") : t("onb.generate")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
