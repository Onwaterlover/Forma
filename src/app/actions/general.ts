"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocale } from "@/i18n";
import { createInvite, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { isIsoDate } from "@/lib/ctx";
import { addWeight, changePassword, deleteInvite, deleteUser, listInvites, deleteWeight, passwordHash, saveMeasurement, saveSettings, setLocale, type Settings } from "@/lib/data";
import { MEASUREMENT_MAX_CM, MEASUREMENT_MIN_CM, MEASUREMENT_SITES, type MeasurementSite } from "@/lib/measurements";
import { parseDecimal } from "@/nutrition/calc";

export async function chooseStart(path: "plan" | "have" | "food") {
  const user = await requireUser();
  if (path === "food") await saveSettings(user.id, { onboarded: true, modules: { training: false, nutrition: true } });
  else await saveSettings(user.id, { modules: { training: true, nutrition: true } });
  revalidatePath("/", "layout");
  redirect(path === "plan" ? "/training/setup" : path === "have" ? "/training/import" : "/nutrition");
}

const settingsSchema = z
  .object({
    theme: z.enum(["system", "light", "dark"]),
    modules: z.object({ training: z.boolean(), nutrition: z.boolean() }),
    logMode: z.enum(["simple", "detailed"]),
    restTimer: z.boolean(),
    autoTimer: z.boolean(),
    showEffort: z.boolean(),
    showFiber: z.boolean(),
    weightGoal: z.enum(["maintain", "lose", "gain", "recomp"]).nullable(),
    ai: z.boolean(),
    logWorkouts: z.boolean(),
  })
  .partial();

export async function updateSettings(patch: Partial<Settings>) {
  const user = await requireUser();
  const p = settingsSchema.safeParse(patch);
  if (!p.success) return;
  await saveSettings(user.id, p.data);
  revalidatePath("/", "layout");
}

export async function updateLocale(locale: string) {
  const user = await requireUser();
  if (isLocale(locale)) await setLocale(user.id, locale);
  revalidatePath("/", "layout");
}

export async function logWeight(date: string, kgRaw: string | number) {
  const user = await requireUser();
  const kg = parseDecimal(kgRaw);
  if (!isIsoDate(date) || kg === null || kg <= 20 || kg >= 400) return { error: "invalid" };
  await addWeight(user.id, date, Math.round(kg * 10) / 10);
  revalidatePath("/progress");
  revalidatePath("/");
  return {};
}

export async function removeWeight(date: string) {
  const user = await requireUser();
  if (isIsoDate(date)) await deleteWeight(user.id, date);
  revalidatePath("/progress");
}

const cm = z.number().gt(MEASUREMENT_MIN_CM).lt(MEASUREMENT_MAX_CM).nullable().transform((v) => (v === null ? null : Math.round(v * 10) / 10));
const measurementSchema = z.object(Object.fromEntries(MEASUREMENT_SITES.map((s) => [s, cm])) as Record<MeasurementSite, typeof cm>);

/** Saves the given day's circumferences as entered; clearing every field removes that day. */
export async function logMeasurements(date: string, values: Record<MeasurementSite, number | null>): Promise<{ error?: string; deleted?: boolean }> {
  const user = await requireUser();
  const p = measurementSchema.safeParse(values);
  if (!isIsoDate(date) || !p.success) return { error: "invalid" };
  const r = await saveMeasurement(user.id, { date, ...p.data });
  revalidatePath("/progress");
  return r === "deleted" ? { deleted: true } : {};
}

// No revalidatePath here: re-rendering the settings page would wipe the code, which is shown only once.
// The fresh invite list is returned instead.
export async function makeInvite(note: string): Promise<{ code?: string; invites?: Awaited<ReturnType<typeof listInvites>> }> {
  const user = await requireUser();
  if (!user.is_admin) return {};
  const code = await createInvite(user.id, note.trim().slice(0, 60) || null);
  return { code, invites: await listInvites() };
}

export async function removeInvite(createdAt: string) {
  const user = await requireUser();
  if (!user.is_admin || typeof createdAt !== "string" || createdAt.length > 40) return;
  await deleteInvite(createdAt);
  return listInvites();
}

export async function updatePassword(current: string, next: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const hash = await passwordHash(user.id);
  if (!hash || !verifyPassword(current, hash)) return { error: "wrong" };
  if (next.length < 10 || next.length > 200) return { error: "short" };
  await changePassword(user.id, hashPassword(next));
  await destroySession();
  redirect("/login");
}

export async function deleteAccount(confirmWord: string, expected: string) {
  const user = await requireUser();
  if (confirmWord.trim() !== expected) return { error: "confirm" };
  await deleteUser(user.id);
  await destroySession();
  redirect("/register");
}
