import type { Exercise, Plan, PlannedExercise, PlannedSession, TrainingProfile } from "./types";
import { prescribe } from "./prescribe";

// Direct edits of an existing plan (used by the assistant). Unlike regenerating, this keeps the user's own
// exercises, so it also works for imported plans without a training profile.

export const EDIT_OPS = [
  "duplicate_session", "remove_session", "rename_session", "move_session", "set_day",
  "add_exercise", "remove_exercise", "set_exercise", "set_all_exercises",
] as const;
export type EditOp = {
  op: (typeof EDIT_OPS)[number];
  session_key: string;
  exercise_id?: string | null;
  name?: string | null;
  /** 0 = Monday … 6 = Sunday; null = any day. */
  day?: number | null;
  /** 1-based position for duplicate/move/add; null = at the end. */
  position?: number | null;
  sets?: number | null;
  rep_min?: number | null;
  rep_max?: number | null;
  kg?: number | null;
  rest_sec?: number | null;
};

/** One human-readable change, described with names the caller formats. */
export type EditLine =
  | { kind: "duplicate"; session: string; copy: string }
  | { kind: "remove_session" | "rename" | "move"; session: string; to?: string | number }
  | { kind: "day"; session: string; day: number | null }
  | { kind: "add" | "remove"; session: string; exerciseId: string }
  | { kind: "set"; session: string; exerciseId: string; sets?: number; reps?: [number, number]; kg?: number; rest?: number }
  | { kind: "set_all"; session: string | null; sets?: number; reps?: [number, number]; rest?: number };

const KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const label = (s: PlannedSession) => s.name ?? s.key;

export function applyPlanEdits(
  plan: Plan, ops: EditOp[], library: Exercise[], profile: TrainingProfile, now = new Date().toISOString(),
): { plan: Plan; lines: EditLine[] } | { error: string } {
  const p: Plan = structuredClone(plan);
  const lines: EditLine[] = [];
  const find = (key: string) => p.sessions.find((s) => s.key === key);
  const at = (pos: number | null | undefined, len: number) => (pos && pos >= 1 ? Math.min(pos - 1, len) : len);

  for (const o of ops) {
    // "Every rest 2 minutes": one change for all exercises of a session, or of the whole plan with session_key "*".
    if (o.op === "set_all_exercises") {
      if (o.kg != null) return { error: "kg differs per exercise; use set_exercise." };
      const targets = o.session_key === "*" ? p.sessions : p.sessions.filter((x) => x.key === o.session_key);
      if (!targets.length) return { error: `Unknown session_key "${o.session_key}". Use a key or "*" for the whole plan.` };
      for (const t of targets) for (let i = 0; i < t.exercises.length; i++) {
        const pe = setNumbers(t.exercises[i]!, o, now);
        if ("error" in pe) return pe;
        t.exercises[i] = pe;
      }
      lines.push({
        kind: "set_all", session: o.session_key === "*" ? null : label(targets[0]!),
        ...(o.sets ? { sets: o.sets } : {}), ...(o.rep_min || o.rep_max ? { reps: [o.rep_min ?? o.rep_max!, o.rep_max ?? o.rep_min!] as [number, number] } : {}),
        ...(o.rest_sec != null ? { rest: o.rest_sec } : {}),
      });
      continue;
    }
    const s = find(o.session_key);
    if (!s) return { error: `Unknown session_key "${o.session_key}". Valid: ${p.sessions.map((x) => x.key).join(", ")}` };
    switch (o.op) {
      case "duplicate_session": {
        if (p.sessions.length >= 7) return { error: "A plan can have at most 7 sessions." };
        const key = [...KEYS].find((k) => !p.sessions.some((x) => x.key === k))!;
        const copy: PlannedSession = { ...structuredClone(s), key, day: null, name: o.name?.trim() || s.name };
        p.sessions.splice(at(o.position, p.sessions.length), 0, copy);
        lines.push({ kind: "duplicate", session: label(s), copy: label(copy) });
        break;
      }
      case "remove_session": {
        if (p.sessions.length <= 1) return { error: "Cannot remove the only session." };
        p.sessions = p.sessions.filter((x) => x !== s);
        lines.push({ kind: "remove_session", session: label(s) });
        break;
      }
      case "rename_session": {
        const name = o.name?.trim().slice(0, 60);
        if (!name) return { error: "rename_session needs name." };
        lines.push({ kind: "rename", session: label(s), to: name });
        s.name = name;
        break;
      }
      case "move_session": {
        if (!o.position) return { error: "move_session needs position (1-based)." };
        p.sessions = p.sessions.filter((x) => x !== s);
        p.sessions.splice(at(o.position, p.sessions.length), 0, s);
        lines.push({ kind: "move", session: label(s), to: o.position });
        break;
      }
      case "set_day": {
        if (o.day !== null && o.day !== undefined && !(Number.isInteger(o.day) && o.day >= 0 && o.day <= 6)) return { error: "day must be 0 (Monday) to 6 (Sunday) or null." };
        s.day = (o.day ?? null) as PlannedSession["day"];
        lines.push({ kind: "day", session: label(s), day: s.day });
        break;
      }
      case "add_exercise": {
        const ex = library.find((e) => e.id === o.exercise_id);
        if (!ex) return { error: `Unknown exercise_id "${o.exercise_id}". Use ids from the exercise list.` };
        if (s.exercises.some((e) => e.exerciseId === ex.id)) return { error: `${ex.id} is already in session ${s.key}.` };
        if (s.exercises.length >= 20) return { error: "A session can have at most 20 exercises." };
        const pe = setNumbers(prescribe(profile, ex, 2), o, now);
        if ("error" in pe) return pe;
        s.exercises.splice(at(o.position, s.exercises.length), 0, pe);
        lines.push({ kind: "add", session: label(s), exerciseId: ex.id });
        break;
      }
      case "remove_exercise": {
        const i = s.exercises.findIndex((e) => e.exerciseId === o.exercise_id);
        if (i < 0) return { error: `${o.exercise_id} is not in session ${s.key}.` };
        s.exercises.splice(i, 1);
        lines.push({ kind: "remove", session: label(s), exerciseId: o.exercise_id! });
        break;
      }
      case "set_exercise": {
        const i = s.exercises.findIndex((e) => e.exerciseId === o.exercise_id);
        if (i < 0) return { error: `${o.exercise_id} is not in session ${s.key}.` };
        const pe = setNumbers(s.exercises[i]!, o, now);
        if ("error" in pe) return pe;
        s.exercises[i] = pe;
        lines.push({
          kind: "set", session: label(s), exerciseId: pe.exerciseId,
          ...(o.sets ? { sets: pe.sets } : {}), ...(o.rep_min || o.rep_max ? { reps: [pe.repMin, pe.repMax] as [number, number] } : {}),
          ...(o.kg ? { kg: pe.startKg } : {}), ...(o.rest_sec ? { rest: pe.restSec } : {}),
        });
        break;
      }
    }
  }
  // Checked after all changes, so "remove X, add Y" works in a one-exercise session.
  const empty = p.sessions.find((x) => !x.exercises.length);
  if (empty) return { error: `Session ${empty.key} would have no exercises; remove the session instead.` };
  return { plan: p, lines };
}

function setNumbers(pe: PlannedExercise, o: EditOp, now: string): PlannedExercise | { error: string } {
  const out = { ...pe };
  if (o.sets != null) {
    if (!Number.isInteger(o.sets) || o.sets < 1 || o.sets > 10) return { error: "sets must be 1–10." };
    out.sets = o.sets;
  }
  if (o.rep_min != null || o.rep_max != null) {
    const a = o.rep_min ?? o.rep_max!, b = o.rep_max ?? o.rep_min!;
    if (!(a >= 1 && b <= 100 && a <= b)) return { error: "rep_min/rep_max must be 1–100 with rep_min ≤ rep_max." };
    out.repMin = Math.round(a);
    out.repMax = Math.round(b);
  }
  if (o.kg != null) {
    if (!(o.kg > 0 && o.kg <= 500)) return { error: "kg must be between 0 and 500." };
    out.startKg = Math.round(o.kg * 4) / 4;
    out.startKgAt = now;
  }
  if (o.rest_sec != null) {
    if (!(o.rest_sec >= 0 && o.rest_sec <= 900)) return { error: "rest_sec must be 0–900." };
    out.restSec = Math.round(o.rest_sec);
  }
  return out;
}
