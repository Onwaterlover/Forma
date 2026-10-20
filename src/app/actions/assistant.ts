"use server";
import { z } from "zod";
import { prescribe } from "@/engine/prescribe";
import { isLocale } from "@/i18n";
import { aiConfigured, foodPayload, planChangePayload, prefPayload, quickPayload, runAssistant, swapPayload, type Proposal } from "@/lib/assistant";
import { requireUser, throttle } from "@/lib/auth";
import { isIsoDate } from "@/lib/ctx";
import { getPlan, getProfile, getSettings, libraryFor, pendingSuggestion, resolveSuggestion } from "@/lib/data";
import { addProductEntry, addQuickEntry } from "./nutrition";
import { regenerateWithFeedback, savePlanEdit, setExercisePref } from "./training";

const askSchema = z.object({
  scope: z.enum(["training", "nutrition"]),
  date: z.string().refine(isIsoDate),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(4000) })).min(1).max(20),
  // A resized JPEG (base64) of a meal, only on the newest message in the food section.
  image: z.string().regex(/^[A-Za-z0-9+/=]+$/).max(900_000).optional(),
});

// Keeps a runaway client (or a stuck finger) from running up the API bill.
const DAILY_LIMIT = 40;

export async function askAssistant(raw: unknown): Promise<{ reply: string; proposals: Proposal[] } | { error: string }> {
  const user = await requireUser();
  if (!aiConfigured()) return { error: "not_configured" };
  if (!(await getSettings(user.id)).ai) return { error: "disabled" };
  const p = askSchema.safeParse(raw);
  if (!p.success) return { error: "invalid" };
  if (!(await throttle(`ai:${user.id}`, DAILY_LIMIT, 86_400_000))) return { error: "limit" };
  return runAssistant({ userId: user.id, locale: isLocale(user.locale) ? user.locale : "pl", ...p.data });
}

export async function rejectSuggestion(id: string) {
  const user = await requireUser();
  await resolveSuggestion(user.id, id, "rejected");
}

/** Applies a stored proposal through the same actions the normal UI uses, so all their checks still run. */
export async function applySuggestion(id: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const s = await pendingSuggestion(user.id, id);
  // Marking it first means a double tap cannot apply the same proposal twice.
  if (!s || !(await resolveSuggestion(user.id, id, "accepted"))) return { error: "expired" };

  if (s.kind === "swap") {
    const p = swapPayload.parse(s.payload);
    const [plan, profile, library] = await Promise.all([getPlan(user.id, p.planId), getProfile(user.id), libraryFor(user.id)]);
    const session = plan?.data.sessions.find((x) => x.key === p.sessionKey);
    const i = session?.exercises.findIndex((e) => e.exerciseId === p.from) ?? -1;
    const to = library.find((e) => e.id === p.to);
    if (!plan || !session || i < 0 || !to || !profile) return { error: "stale" };
    const old = session.exercises[i]!;
    session.exercises[i] = { ...prescribe(profile, to, old.priority), sets: old.sets, superset: old.superset };
    const r = await savePlanEdit(plan.id, plan.data, `AI: ${p.from} → ${p.to}`);
    return r.error ? { error: r.error } : {};
  }
  if (s.kind === "plan_change") return regenerateWithFeedback(planChangePayload.parse(s.payload));
  if (s.kind === "pref") {
    const p = prefPayload.parse(s.payload);
    await setExercisePref(p.exerciseId, p.pref);
    return {};
  }
  if (s.kind === "food") {
    const p = foodPayload.parse(s.payload);
    for (const it of p.items) {
      const r = await addProductEntry({ productId: it.productId, amount: it.grams, date: p.date, meal: p.meal });
      if (r.error) return { error: r.error };
    }
    return {};
  }
  if (s.kind === "quick") {
    const { date, meal, ...q } = quickPayload.parse(s.payload);
    return addQuickEntry({ ...q, date, meal });
  }
  return { error: "unknown" };
}
