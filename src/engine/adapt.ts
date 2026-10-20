import { estimateMinutes } from "./duration";
import { isPossible } from "./equipment";
import { fitToTime } from "./fit";
import { prescribe } from "./prescribe";
import { substitutes } from "./select";
import type { Exercise, ExercisePref, Message, PlannedSession, TrainingProfile, Weekday } from "./types";

interface Ctx {
  profile: TrainingProfile;
  prefs: Record<string, ExercisePref>;
  library: Exercise[];
}

/** Re-targets a session to another location, swapping only what can't be done there. */
export function adaptToLocation(session: PlannedSession, locationId: string, ctx: Ctx): { session: PlannedSession; changes: Message[] } {
  const loc = ctx.profile.locations.find((l) => l.id === locationId);
  if (!loc) return { session, changes: [{ code: "unknown_location" }] };
  const byId = new Map(ctx.library.map((e) => [e.id, e]));
  const changes: Message[] = [];
  const used = new Set(session.exercises.map((e) => e.exerciseId));
  const exercises = [];
  for (const pe of session.exercises) {
    const ex = byId.get(pe.exerciseId);
    if (ex && isPossible(ex, loc.equipment, ctx.profile.excludedKinds)) {
      exercises.push(pe);
      continue;
    }
    const alt = ex && substitutes(ex, { ...ctx, equipment: loc.equipment, excludeIds: used })[0];
    if (alt) {
      used.add(alt.id);
      const next = prescribe(ctx.profile, alt, pe.priority);
      exercises.push({ ...next, sets: pe.sets, superset: undefined });
      changes.push({ code: "swapped", params: { from: pe.exerciseId, to: alt.id } });
    } else {
      changes.push({ code: "dropped_no_equipment", params: { exercise: pe.exerciseId } });
    }
  }
  exercises.forEach((e) => delete e.superset);
  const out = { ...session, locationId, exercises };
  out.estimatedMinutes = estimateMinutes(exercises, (id) => byId.get(id));
  return { session: out, changes };
}

/** Moves a session to another weekday; adapts location if the old one isn't available that day. */
export function moveSession(session: PlannedSession, day: Weekday, ctx: Ctx): { session: PlannedSession; changes: Message[] } {
  const avail = ctx.profile.week[day];
  if (!avail || avail.rest || avail.locations.length === 0) return { session, changes: [{ code: "day_unavailable", params: { day } }] };
  if (avail.locations.includes(session.locationId)) return { session: { ...session, day }, changes: [] };
  // Choose the location that keeps the most exercises unchanged.
  const byId = new Map(ctx.library.map((e) => [e.id, e]));
  let bestLoc = avail.locations[0]!;
  let bestKept = -1;
  for (const lid of avail.locations) {
    const loc = ctx.profile.locations.find((l) => l.id === lid);
    if (!loc) continue;
    const kept = session.exercises.filter((pe) => {
      const ex = byId.get(pe.exerciseId);
      return ex && isPossible(ex, loc.equipment, ctx.profile.excludedKinds);
    }).length;
    if (kept > bestKept) {
      bestKept = kept;
      bestLoc = lid;
    }
  }
  const r = adaptToLocation({ ...session, day }, bestLoc, ctx);
  return { session: r.session, changes: [{ code: "location_changed", params: { location: bestLoc } }, ...r.changes] };
}

/**
 * Which session to offer today. A session scheduled for today wins; otherwise the one after the
 * last completed session, so a missed workout is offered next instead of being silently skipped.
 */
export function nextSession(sessions: PlannedSession[], today: Weekday, lastCompletedKey: string | null): PlannedSession | null {
  if (sessions.length === 0) return null;
  const scheduled = sessions.find((s) => s.day === today);
  if (scheduled && scheduled.key !== lastCompletedKey) return scheduled;
  const idx = sessions.findIndex((s) => s.key === lastCompletedKey);
  return sessions[(idx + 1) % sessions.length] ?? sessions[0]!;
}

/** "I only have N minutes today": keeps the most important work, never edits the stored plan. */
export function shortenSession(session: PlannedSession, minutes: number, ctx: Ctx): { session: PlannedSession; changes: Message[] } {
  const byId = new Map(ctx.library.map((e) => [e.id, e]));
  const r = fitToTime(session.exercises, minutes, ctx.profile, (id) => byId.get(id));
  return {
    session: { ...session, exercises: r.exercises, estimatedMinutes: estimateMinutes(r.exercises, (id) => byId.get(id)) },
    changes: r.tradeoffs,
  };
}
