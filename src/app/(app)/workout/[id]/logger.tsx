"use client";
import { ArrowDown, ArrowUp, Check, CircleHelp, CloudOff, MapPin, Minus, MoreHorizontal, NotebookPen, Pencil, Plus, Repeat, SkipForward, Timer, Trash2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applyWorkoutToPlan } from "@/app/actions/training";
import { BackButton } from "@/components/back-button";
import { HowToPicker } from "@/components/how-to";
import { DecimalInput, Sheet, useToast } from "@/components/client";
import { Badge, Button, Card, cx, Notice } from "@/components/ui";
import { shortenSession } from "@/engine/adapt";
import { isPossible } from "@/engine/equipment";
import { EXERCISES } from "@/engine/exercises";
import type { Suggestion } from "@/engine/progression";
import { substitutes } from "@/engine/select";
import type { Exercise, ExercisePref, PlannedExercise, TrainingProfile } from "@/engine/types";
import { exName, fmt, fmtRest } from "@/i18n";
import { useI18n } from "@/i18n/client";
import type { WorkoutExercise, WorkoutPayload, WorkoutSet } from "@/lib/data";

export type ExerciseInfo = {
  last: { date: string; sets: { w: number | null; r: number | null; d: number | null }[] } | null;
  suggestion: Suggestion | null;
};

type Settings = { restTimer: boolean; autoTimer: boolean; showEffort: boolean; logMode: "simple" | "detailed" };

const STORE = (id: string) => `forma.workout.${id}`;
const now = () => new Date().toISOString();
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, "0")}`;
/** 75 → "1:15", 3725 → "1:02:05" */
const clock = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : mmss(s));

function newSet(w: WorkoutPayload, ei: number, j: number, weightKg: number | null): WorkoutSet {
  return { id: `${w.id}:${ei}:${j}:${Math.random().toString(36).slice(2, 6)}`, type: "working", reps: null, weightKg, rir: null, rpe: null, durationS: null, completed: false };
}

export function WorkoutLogger({
  initial, info, profile, prefs, custom, settings, originalIds, summary,
}: {
  initial: WorkoutPayload;
  info: Record<string, ExerciseInfo>;
  profile: TrainingProfile | null;
  prefs: Record<string, ExercisePref>;
  custom: Exercise[];
  settings: Settings;
  originalIds: string[] | null;
  /** Recap card rendered by the server once the workout is finished. */
  summary?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const library = useMemo(() => [...EXERCISES, ...custom], [custom]);
  const lookup = useCallback((id: string) => library.find((e) => e.id === id), [library]);

  const [w, setW] = useState<WorkoutPayload>(initial);
  const [sync, setSync] = useState<"saved" | "saving" | "offline">("saved");
  const [sheet, setSheet] = useState<null | { kind: "swap"; index: number } | { kind: "shorten" } | { kind: "location" } | { kind: "finish" } | { kind: "apply" } | { kind: "delete" } | { kind: "abandon" } | { kind: "more" } | { kind: "howto" } | { kind: "exercise"; index: number }>(null);
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const [tick, setTick] = useState(Date.now());
  const [notesOpen, setNotesOpen] = useState<number | null>(null);
  // Rest suggested by the last completed set (the timer is started manually unless auto-start is on).
  const [lastRest, setLastRest] = useState(90);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(w);
  const finished = w.status !== "in_progress";
  // A finished workout can be corrected afterwards; edits sync the same way as during the workout.
  const [editing, setEditing] = useState(false);
  const readOnly = finished && !editing;

  // ── Persistence: local first, then server; newer data always wins ──────
  const discarded = useRef(false);
  const push = useCallback(async () => {
    if (discarded.current) return false;
    const body = latest.current;
    setSync("saving");
    try {
      const res = await fetch(`/api/workouts/${body.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(String(res.status));
      if (latest.current.clientUpdatedAt === body.clientUpdatedAt) {
        try { localStorage.removeItem(STORE(body.id)); } catch {}
      }
      setSync("saved");
      return true;
    } catch {
      setSync("offline");
      return false;
    }
  }, []);

  const mutate = useCallback((fn: (x: WorkoutPayload) => WorkoutPayload) => {
    // Derive from the ref (always current) so rapid edits and finish() never use a stale copy.
    const next = { ...fn(latest.current), clientUpdatedAt: now() };
    latest.current = next;
    setW(next);
    try { localStorage.setItem(STORE(next.id), JSON.stringify(next)); } catch {}
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(push, 700);
  }, [push]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE(initial.id));
      const local = raw ? (JSON.parse(raw) as WorkoutPayload) : null;
      if (local && local.clientUpdatedAt > initial.clientUpdatedAt) {
        setW(local);
        latest.current = local;
        push();
      }
    } catch {}
    const online = () => latest.current && push();
    window.addEventListener("online", online);
    const iv = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      window.removeEventListener("online", online);
      clearInterval(iv);
    };
  }, [initial.id, initial.clientUpdatedAt, push]);

  // Rest timer end: vibrate once.
  const restLeft = rest ? Math.ceil((rest.endsAt - tick) / 1000) : 0;
  const buzzed = useRef(false);
  useEffect(() => {
    if (rest && restLeft <= 0 && !buzzed.current) {
      buzzed.current = true;
      try { navigator.vibrate?.([200, 100, 200]); } catch {}
      setTimeout(() => setRest(null), 4000);
    }
  }, [rest, restLeft]);
  const startRest = (sec: number) => {
    buzzed.current = false;
    setRest({ endsAt: Date.now() + sec * 1000, total: sec });
  };

  const elapsed = Math.max(0, Math.floor(((w.endedAt ? Date.parse(w.endedAt) : tick) - Date.parse(w.startedAt)) / 1000));
  const location = profile?.locations.find((l) => l.id === w.locationId) ?? null;

  const editEx = (i: number, fn: (e: WorkoutExercise) => WorkoutExercise) => mutate((x) => ({ ...x, exercises: x.exercises.map((e, j) => (j === i ? fn(e) : e)) }));
  const editSet = (i: number, j: number, patch: Partial<WorkoutSet>) => editEx(i, (e) => ({ ...e, sets: e.sets.map((s, k) => (k === j ? { ...s, ...patch } : s)) }));
  const started = (e: WorkoutExercise) => e.completed || e.sets.some((s) => s.completed);

  const toPlanned = (e: WorkoutExercise): PlannedExercise | null => {
    const ex = lookup(e.exerciseId);
    if (!ex) return null;
    const tg = e.target;
    return {
      exerciseId: e.exerciseId, sets: Math.max(1, e.sets.filter((s) => !s.completed).length || tg?.sets || 1), repMin: tg?.repMin ?? 8, repMax: tg?.repMax ?? 12,
      ...(tg?.seconds ? { seconds: tg.seconds } : {}), restSec: tg?.restSec ?? 90, effort: (tg?.effort as PlannedExercise["effort"]) ?? "leave_1_3",
      progression: "double", pattern: ex.pattern, priority: ((tg?.priority as 1 | 2 | 3) ?? 2),
    };
  };

  const swapTo = (i: number, ex: Exercise) =>
    editEx(i, (e) => ({ ...e, exerciseId: ex.id, name: exName(ex, locale), loading: ex.loading, completed: false, sets: e.sets.map((s) => ({ ...s, weightKg: null, reps: null, completed: false })) }));

  const changeLocation = (locId: string) => {
    const loc = profile?.locations.find((l) => l.id === locId);
    if (!loc || !profile) return;
    let swapped = 0;
    mutate((x) => {
      const used = new Set(x.exercises.map((e) => e.exerciseId));
      const exercises = x.exercises.flatMap((e) => {
        const ex = lookup(e.exerciseId);
        if (!ex || started(e) || isPossible(ex, loc.equipment, profile.excludedKinds)) return [e];
        const alt = substitutes(ex, { profile, prefs, library, equipment: loc.equipment, excludeIds: used })[0];
        if (!alt) return [];
        used.add(alt.id);
        swapped++;
        return [{ ...e, exerciseId: alt.id, name: exName(alt, locale), loading: alt.loading, sets: e.sets.map((s) => ({ ...s, weightKg: null })) }];
      });
      return { ...x, locationId: locId, exercises };
    });
    toast({ text: t("msg.location_changed", { location: loc.name }) + (swapped ? ` (${swapped} ↺)` : "") });
  };

  const shorten = (minutes: number) => {
    if (!profile) return;
    const remaining = w.exercises.map((e, i) => ({ e, i })).filter(({ e }) => !started(e) && !e.skipped);
    const planned = remaining.map(({ e }) => toPlanned(e)).filter((p): p is PlannedExercise => !!p);
    const r = shortenSession({ key: "x", template: "x", day: null, locationId: w.locationId ?? "", exercises: planned, estimatedMinutes: 0 }, minutes, { profile, prefs, library });
    const keep = new Map(r.session.exercises.map((p) => [p.exerciseId, p.sets]));
    mutate((x) => ({
      ...x,
      exercises: x.exercises
        .filter((e) => started(e) || e.skipped || keep.has(e.exerciseId))
        .map((e) => (started(e) || !keep.has(e.exerciseId) ? e : { ...e, sets: e.sets.slice(0, keep.get(e.exerciseId)!) })),
    }));
    toast({ text: t("workout.shortenTo", { n: minutes }) });
  };

  const changed = useMemo(() => {
    if (!originalIds) return false;
    const now = w.exercises.filter((e) => !e.skipped).map((e) => e.exerciseId);
    return now.length !== originalIds.length || now.some((id, i) => id !== originalIds[i]);
  }, [w.exercises, originalIds]);

  const anyDone = w.exercises.some((e) => e.completed || e.sets.some((s) => s.completed));
  // Started by mistake: remove the workout completely, as if it never happened.
  const discard = async () => {
    discarded.current = true;
    if (timer.current) clearTimeout(timer.current);
    setSheet(null);
    setRest(null);
    await fetch(`/api/workouts/${w.id}`, { method: "DELETE" });
    try { localStorage.removeItem(STORE(w.id)); } catch {}
    router.push("/");
    router.refresh();
  };

  const finish = async (status: "completed" | "abandoned") => {
    mutate((x) => ({ ...x, status, endedAt: now() }));
    setSheet(null);
    setRest(null);
    if (timer.current) clearTimeout(timer.current);
    const ok = await push();
    toast({ text: ok ? t("workout.completed") : t("workout.offline") });
    window.scrollTo({ top: 0 });
    router.refresh();
    if (status === "completed" && changed && ok) setSheet({ kind: "apply" });
  };

  const suggestionText = (s: Suggestion | null) => {
    if (!s) return null;
    switch (s.kind) {
      case "insufficient_data": return t("workout.suggestion.insufficient_data");
      case "increase_load": return t("workout.suggestion.increase_load", { weight: fmt(locale, s.weightKg, 2), reps: s.reps });
      case "add_reps": return s.weightKg === null ? t("workout.suggestion.add_reps_bw", { reps: s.reps }) : t("workout.suggestion.add_reps", { weight: fmt(locale, s.weightKg, 2), reps: s.reps });
      case "harder_variant": return t("workout.suggestion.harder_variant");
      case "add_weight": return t("workout.suggestion.add_weight", { weight: fmt(locale, s.weightKg, 2) });
      case "reduce_assistance": return t("workout.suggestion.reduce_assistance", { weight: fmt(locale, s.weightKg, 2) });
      case "longer_hold": return t("workout.suggestion.longer_hold", { seconds: s.seconds });
      case "consider_reduce": return t("workout.suggestion.consider_reduce", { weight: fmt(locale, s.weightKg, 2) });
      default: return null;
    }
  };

  const unit = (loading: string) =>
    loading === "per_dumbbell" ? t("workout.perDumbbell") : loading === "per_side" ? t("workout.perSide") : loading === "assisted" ? t("workout.assistance") : loading === "bodyweight_plus" ? t("workout.plusWeight") : "";

  const swapOptions = useMemo(() => {
    if (sheet?.kind !== "swap") return [];
    const e = w.exercises[sheet.index];
    const ex = e && lookup(e.exerciseId);
    if (!ex || !profile) return ex ? library.filter((x) => x.pattern === ex.pattern && x.id !== ex.id).slice(0, 12) : [];
    return substitutes(ex, { profile, prefs, library, equipment: location?.equipment ?? [], excludeIds: new Set(w.exercises.map((x) => x.exerciseId)) }).slice(0, 12);
  }, [sheet, w.exercises, lookup, profile, prefs, library, location]);

  return (
    <div className="space-y-4 pb-36">
      <div className="sticky top-0 z-30 -mx-4 border-b border-border bg-bg/95 px-4 pb-3 pt-2 backdrop-blur sm:-mx-6 sm:px-6">
        <BackButton href="/training" label={t("workout.backToTraining")} />
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight">{w.name}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
              {location && <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden />{location.name}</span>}
              {sync === "offline" && <span className="inline-flex items-center gap-1 text-warning"><CloudOff size={12} aria-hidden />{t("workout.offline")}</span>}
              {sync === "saving" && <span>{t("workout.syncing")}</span>}
              {readOnly && <Badge>{w.status === "completed" ? t("common.done") : t("workout.abandon")}</Badge>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* The running clock differs by a few seconds between server and phone; that is expected, not a mismatch. */}
            <p className="text-3xl font-semibold tabular-nums tracking-tight" role="timer" aria-label={t("workout.elapsed")} suppressHydrationWarning>{clock(elapsed)}</p>
            {!finished && <Button size="sm" onClick={() => setSheet({ kind: "finish" })}>{t("common.done")}</Button>}
          </div>
        </div>
        {!finished && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex rounded-xl bg-surface-2 p-0.5 text-sm" role="radiogroup" aria-label={t("settings.logging")}>
              {(["simple", "detailed"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={w.mode === m} onClick={() => mutate((x) => ({ ...x, mode: m }))}
                  className={cx("h-8 rounded-lg px-3", w.mode === m ? "bg-surface font-medium shadow-sm" : "text-muted")}>
                  {t(`workout.${m}`)}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="ml-auto whitespace-nowrap" aria-label={t("plan.howToShort")} onClick={() => setSheet({ kind: "howto" })}><CircleHelp size={16} aria-hidden /><span className="max-[370px]:hidden">{t("plan.howToShort")}</span></Button>
            <Button variant="ghost" size="sm" onClick={() => setSheet({ kind: "more" })} aria-label={t("common.more")}><MoreHorizontal size={18} aria-hidden /></Button>
          </div>
        )}
      </div>

      {readOnly && summary}

      {w.mode === "simple" && !finished && <Notice>{t("workout.simpleNote")}</Notice>}

      {w.exercises.map((e, i) => {
        const ex = lookup(e.exerciseId);
        const inf = info[e.exerciseId];
        const tg = e.target;
        const timeBased = e.loading === "time";
        const noWeight = e.loading === "bodyweight" || timeBased;
        const sug = inf?.suggestion ?? null;
        const placeholderReps = (j: number) =>
          sug && (sug.kind === "add_reps" || sug.kind === "increase_load") ? sug.reps : inf?.last?.sets[j]?.r ?? tg?.repMin ?? null;
        const doneSets = e.sets.filter((s) => s.completed).length;
        return (
          <Card key={`${e.id}-${e.exerciseId}`} className={cx("space-y-3", e.skipped && "opacity-60")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-snug">{e.name}</h2>
                {tg && (
                  <p className="text-sm text-muted">
                    {t("workout.target")}: <span className="tabular-nums">{tg.sets} × {tg.seconds ? `${tg.seconds} s` : `${tg.repMin}–${tg.repMax}`}</span>
                    {tg.restSec > 0 && ` · ${t("plan.rest")} ${fmtRest(tg.restSec)}`}
                  </p>
                )}
              </div>
              {e.skipped ? <Badge>{t("workout.skipped")}</Badge> : (e.completed || (doneSets > 0 && doneSets === e.sets.length)) && <Badge tone="accent">✓</Badge>}
            </div>

            {!finished && (
              <div className="space-y-1 text-sm">
                <p className="text-muted">
                  {t("workout.last")}:{" "}
                  {inf?.last ? (
                    <span className="tabular-nums text-text">
                      {inf.last.sets.map((s) => (s.d ? `${s.d}s` : s.w ? `${fmt(locale, s.w, 2)}×${s.r ?? "?"}` : `${s.r ?? "?"}`)).join(", ")}
                    </span>
                  ) : t("workout.nothingLogged")}
                </p>
                {sug && sug.kind !== "insufficient_data" && <p className="font-medium text-accent">{suggestionText(sug)}</p>}
                {tg && <p className="text-xs text-muted">{t(`effort.${tg.effort}`)}</p>}
                {tg?.grip && <p className="text-xs text-muted">{t("plan.grip")}: {t(`plan.grips.${tg.grip}`)}</p>}
              </div>
            )}

            {w.mode === "detailed" || finished ? (
              <div className="space-y-2">
                {e.sets.length > 0 && (
                  <div className={cx("grid items-center gap-2 text-xs text-muted", settings.showEffort ? "grid-cols-[2rem_1fr_1fr_3.5rem_3rem]" : "grid-cols-[2rem_1fr_1fr_3rem]")}>
                    <span>#</span>
                    <span>{noWeight ? "" : `${t("workout.weight")} ${unit(e.loading)}`}</span>
                    <span>{timeBased ? t("workout.sec") : t("workout.reps")}</span>
                    {settings.showEffort && <span>{t("workout.rir")}</span>}
                    <span />
                  </div>
                )}
                {e.sets.map((s, j) => (
                  <div key={s.id} className={cx("grid items-center gap-2", settings.showEffort ? "grid-cols-[2rem_1fr_1fr_3.5rem_3rem]" : "grid-cols-[2rem_1fr_1fr_3rem]")}>
                    <button type="button" disabled={readOnly} onClick={() => editSet(i, j, { type: s.type === "warmup" ? "working" : "warmup" })}
                      className={cx("h-11 rounded-lg text-sm tabular-nums", s.type === "warmup" ? "bg-warning-soft text-warning" : "text-muted")} aria-label={t(`workout.setType.${s.type}`)}>
                      {s.type === "warmup" ? "W" : j + 1 - e.sets.slice(0, j).filter((x) => x.type === "warmup").length}
                    </button>
                    {noWeight ? <span /> : (
                      <DecimalInput aria-label={`${t("workout.weight")} ${j + 1}`} value={s.weightKg} disabled={readOnly} placeholder="—"
                        onChange={(v) => editSet(i, j, { weightKg: v })} className={cx("h-12 text-lg", s.completed && "border-accent/40 bg-accent-soft")} />
                    )}
                    <input
                      aria-label={`${timeBased ? t("workout.sec") : t("workout.reps")} ${j + 1}`}
                      inputMode="numeric" disabled={readOnly}
                      value={(timeBased ? s.durationS : s.reps) ?? ""}
                      placeholder={String((timeBased ? tg?.seconds : placeholderReps(j)) ?? "")}
                      onChange={(ev) => {
                        const n = ev.target.value.replace(/\D/g, "");
                        const v = n === "" ? null : Math.min(Number(n), timeBased ? 36000 : 1000);
                        editSet(i, j, timeBased ? { durationS: v } : { reps: v });
                      }}
                      onFocus={(ev) => ev.target.select()}
                      className={cx("h-12 w-full rounded-xl border border-border bg-surface px-3 text-center text-lg tabular-nums placeholder:text-muted/60 focus:border-accent focus:outline-none", s.completed && "border-accent/40 bg-accent-soft")}
                    />
                    {settings.showEffort && (
                      <input aria-label={`${t("workout.rir")} ${j + 1}`} inputMode="numeric" disabled={readOnly} value={s.rir ?? ""}
                        onChange={(ev) => { const n = ev.target.value.replace(/\D/g, ""); editSet(i, j, { rir: n === "" ? null : Math.min(10, Number(n)) }); }}
                        className="h-11 w-full rounded-xl border border-border bg-surface text-center tabular-nums focus:border-accent focus:outline-none" />
                    )}
                    <button type="button" disabled={readOnly} aria-pressed={s.completed} aria-label={t("workout.setDone")}
                      onClick={() => {
                        const completing = !s.completed;
                        const patch: Partial<WorkoutSet> = { completed: completing };
                        if (completing && !timeBased && s.reps === null) patch.reps = placeholderReps(j);
                        if (completing && timeBased && s.durationS === null) patch.durationS = tg?.seconds ?? null;
                        editEx(i, (x) => ({
                          ...x,
                          sets: x.sets.map((y, k) => (k === j ? { ...y, ...patch } : k > j && !y.completed && y.weightKg === null && s.weightKg !== null ? { ...y, weightKg: s.weightKg } : y)),
                        }));
                        if (completing && tg?.restSec) setLastRest(tg.restSec);
                        if (completing && settings.restTimer && settings.autoTimer && tg?.restSec) startRest(tg.restSec);
                      }}
                      className={cx("grid h-12 w-full place-items-center rounded-xl border", s.completed ? "border-accent bg-accent text-accent-contrast" : "border-border text-muted hover:bg-surface-2")}>
                      <Check size={18} aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <Button full variant={e.completed ? "primary" : "secondary"} aria-pressed={e.completed} onClick={() => editEx(i, (x) => ({ ...x, completed: !x.completed, skipped: false }))}>
                <Check size={18} aria-hidden />{t("workout.markDone")}
              </Button>
            )}

            {notesOpen === i || e.notes ? (
              <textarea aria-label={t("workout.notes")} disabled={readOnly} maxLength={1000} value={e.notes ?? ""} placeholder={t("workout.notes")}
                onChange={(ev) => editEx(i, (x) => ({ ...x, notes: ev.target.value || null }))}
                className="min-h-16 w-full rounded-xl border border-border bg-surface px-3 py-2 text-base sm:text-sm focus:border-accent focus:outline-none" />
            ) : null}

            {!readOnly && (
              <div className="flex items-center gap-1 border-t border-border pt-2">
                {w.mode === "detailed" && (
                  <Button variant="ghost" size="sm" onClick={() => editEx(i, (x) => ({ ...x, sets: [...x.sets, newSet(w, i, x.sets.length, x.sets.at(-1)?.weightKg ?? null)] }))}><Plus size={15} aria-hidden />{t("workout.addSet").replace("+ ", "")}</Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setSheet({ kind: "swap", index: i })}><Repeat size={15} aria-hidden />{t("workout.swap")}</Button>
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSheet({ kind: "exercise", index: i })} aria-label={t("common.more")}><MoreHorizontal size={18} aria-hidden /></Button>
              </div>
            )}
          </Card>
        );
      })}

      {finished ? (
        editing ? (
          <Button full onClick={() => { setEditing(false); router.refresh(); }}><Check size={16} aria-hidden />{t("workout.editDone")}</Button>
        ) : (
          <div className="flex gap-2">
            <Button full variant="secondary" onClick={() => { setEditing(true); window.scrollTo({ top: 0 }); }}><Pencil size={16} aria-hidden />{t("workout.editWorkout")}</Button>
            <Button variant="ghost" className="text-danger" onClick={() => setSheet({ kind: "delete" })}><Trash2 size={16} aria-hidden />{t("common.delete")}</Button>
          </div>
        )
      ) : (
        <div className="flex gap-2">
          <Button full onClick={() => setSheet({ kind: "finish" })}>{t("workout.finish")}</Button>
          <Button variant="ghost" onClick={() => setSheet({ kind: "abandon" })}>{t("workout.abandon")}</Button>
        </div>
      )}

      {settings.restTimer && !finished && (
        <div className="fixed inset-x-4 bottom-[calc(5rem_+_env(safe-area-inset-bottom))] z-40 mx-auto max-w-md md:bottom-6">
          {rest ? (
            <div role="timer" aria-live="polite" className="overflow-hidden rounded-2xl bg-text text-bg shadow-xl">
              <div className="h-1 bg-bg/20"><div className="h-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${Math.max(0, Math.min(100, (restLeft / rest.total) * 100))}%` }} /></div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-wide opacity-70">{t("workout.restTimer")}</p>
                  <p className="text-4xl font-semibold tabular-nums">{restLeft > 0 ? clock(restLeft) : "0:00"}</p>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" className="h-11 rounded-xl bg-bg/10 px-3 text-sm font-medium" onClick={() => setRest((r) => r && { ...r, endsAt: Math.max(Date.now(), r.endsAt - 15000) })}>−15</button>
                  <button type="button" className="h-11 rounded-xl bg-bg/10 px-3 text-sm font-medium" onClick={() => setRest((r) => r && { ...r, endsAt: r.endsAt + 15000, total: r.total + 15 })}>+15</button>
                  <button type="button" className="h-11 rounded-xl bg-bg px-3 text-sm font-semibold text-text" onClick={() => setRest(null)}>{t("workout.restStop")}</button>
                </div>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => startRest(lastRest)}
              className="ml-auto flex h-12 items-center gap-2 rounded-full border border-border bg-surface px-5 font-medium shadow-lg hover:bg-surface-2">
              <Timer size={18} className="text-accent" aria-hidden />{t("workout.restTimer")} · <span className="tabular-nums">{clock(lastRest)}</span>
            </button>
          )}
        </div>
      )}

      <Sheet open={sheet?.kind === "swap"} onClose={() => setSheet(null)} title={t("plan.alternatives")}>
        {sheet?.kind === "swap" && prefs[w.exercises[sheet.index]?.exerciseId ?? ""] === "pain" && <Notice tone="warning" className="mb-3">{t("plan.painCaution")}</Notice>}
        {swapOptions.length === 0 ? <p className="text-sm text-muted">{t("plan.noAlternatives")}</p> : (
          <ul className="divide-y divide-border">
            {swapOptions.map((ex) => (
              <li key={ex.id}>
                <button type="button" className="w-full py-3 text-left hover:bg-surface-2" onClick={() => { if (sheet?.kind === "swap") swapTo(sheet.index, ex); setSheet(null); }}>
                  <span className="block font-medium">{exName(ex, locale)}</span>
                  <span className="block text-xs text-muted">{ex.primary.map((m) => t(`muscles.${m}`)).join(", ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <HowToPicker open={sheet?.kind === "howto"} onClose={() => setSheet(null)} ids={w.exercises.map((e) => e.exerciseId)} library={library} />

      <Sheet open={sheet?.kind === "more"} onClose={() => setSheet(null)} title={w.name}>
        <div className="space-y-2">
          {profile && <Button full variant="secondary" onClick={() => setSheet({ kind: "shorten" })}><Zap size={16} aria-hidden />{t("workout.shorten")}</Button>}
          {profile && profile.locations.length > 1 && <Button full variant="secondary" onClick={() => setSheet({ kind: "location" })}><MapPin size={16} aria-hidden />{t("workout.changeLocation")}</Button>}
          <Button full variant="ghost" className="text-danger" onClick={() => setSheet({ kind: "abandon" })}>{t("workout.abandon")}</Button>
        </div>
      </Sheet>

      <Sheet open={sheet?.kind === "exercise"} onClose={() => setSheet(null)} title={sheet?.kind === "exercise" ? w.exercises[sheet.index]?.name ?? "" : ""}>
        {sheet?.kind === "exercise" && (() => {
          const i = sheet.index;
          const e = w.exercises[i];
          if (!e) return null;
          const act = (fn: () => void) => () => { fn(); setSheet(null); };
          return (
            <div className="grid grid-cols-2 gap-2">
              {w.mode === "detailed" && <Button variant="secondary" disabled={e.sets.length === 0} onClick={act(() => editEx(i, (x) => ({ ...x, sets: x.sets.slice(0, -1) })))}><Minus size={16} aria-hidden />{t("workout.removeSet").replace("− ", "")}</Button>}
              <Button variant="secondary" onClick={act(() => editEx(i, (x) => ({ ...x, skipped: !x.skipped, completed: false })))}><SkipForward size={16} aria-hidden />{e.skipped ? t("common.undo") : t("workout.skip")}</Button>
              <Button variant="secondary" onClick={act(() => setNotesOpen(i))}><NotebookPen size={16} aria-hidden />{t("workout.notes")}</Button>
              <Button variant="secondary" disabled={i === 0} onClick={act(() => mutate((x) => { const xs = [...x.exercises]; [xs[i - 1], xs[i]] = [xs[i]!, xs[i - 1]!]; return { ...x, exercises: xs }; }))}><ArrowUp size={16} aria-hidden />↑</Button>
              <Button variant="secondary" disabled={i === w.exercises.length - 1} onClick={act(() => mutate((x) => { const xs = [...x.exercises]; [xs[i + 1], xs[i]] = [xs[i]!, xs[i + 1]!]; return { ...x, exercises: xs }; }))}><ArrowDown size={16} aria-hidden />↓</Button>
            </div>
          );
        })()}
      </Sheet>

      <Sheet open={sheet?.kind === "shorten"} onClose={() => setSheet(null)} title={t("workout.shorten")}>
        <div className="grid grid-cols-2 gap-2">
          {[15, 20, 30, 45].map((m) => <Button key={m} variant="secondary" onClick={() => { shorten(m); setSheet(null); }}>{t("workout.shortenTo", { n: m })}</Button>)}
        </div>
      </Sheet>

      <Sheet open={sheet?.kind === "location"} onClose={() => setSheet(null)} title={t("workout.changeLocation")}>
        <ul className="divide-y divide-border">
          {profile?.locations.map((l) => (
            <li key={l.id}>
              <button type="button" className="flex w-full items-center justify-between py-3 text-left hover:bg-surface-2" onClick={() => { changeLocation(l.id); setSheet(null); }}>
                <span className="font-medium">{l.name}</span>{l.id === w.locationId && <Check size={18} className="text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={sheet?.kind === "finish"} onClose={() => setSheet(null)} title={t("workout.confirmFinish")}>
        {w.mode === "simple" && <Notice className="mb-4">{t("workout.simpleNote")}</Notice>}
        <Button full onClick={() => finish("completed")}>{t("workout.finish")}</Button>
      </Sheet>

      <Sheet open={sheet?.kind === "abandon"} onClose={() => setSheet(null)} title={t("workout.stopTitle")}>
        {anyDone ? (
          <div className="flex flex-col gap-2">
            <Button full variant="danger" onClick={() => finish("abandoned")}>{t("workout.stopKeep")}</Button>
            <Button full variant="ghost" className="text-danger" onClick={discard}>{t("workout.discardWorkout")}</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">{t("workout.nothingSaved")}</p>
            <Button full variant="danger" onClick={discard}>{t("workout.cancelWorkout")}</Button>
          </div>
        )}
      </Sheet>

      <Sheet open={sheet?.kind === "apply"} onClose={() => setSheet(null)} title={t("workout.applyToPlan")}>
        <div className="flex flex-col gap-2">
          <Button full onClick={async () => { await applyWorkoutToPlan(w.id); toast({ text: t("common.saved") }); setSheet(null); }}>{t("workout.applyYes")}</Button>
          <Button full variant="secondary" onClick={() => setSheet(null)}>{t("workout.applyNo")}</Button>
        </div>
      </Sheet>

      <Sheet open={sheet?.kind === "delete"} onClose={() => setSheet(null)} title={t("workout.deleteWorkoutConfirm")}>
        <Button full variant="danger" onClick={async () => {
          await fetch(`/api/workouts/${w.id}`, { method: "DELETE" });
          try { localStorage.removeItem(STORE(w.id)); } catch {}
          router.push("/training/history");
          router.refresh();
        }}>{t("common.delete")}</Button>
      </Sheet>
    </div>
  );
}
