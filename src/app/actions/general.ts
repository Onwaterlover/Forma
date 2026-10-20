"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocale } from "@/i18n";
import { createInvite, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { isIsoDate } from "@/lib/ctx";
import { addWeight, changePassword, deleteUser, deleteWeight, passwordHash, saveSettings, setLocale, type Settings } from "@/lib/data";
import { parseDecimal } from "@/nutrition/calc";

export async function chooseStart(path: "plan" | "have" | "food") {
  const user = await requireUser();
  if (path === "food") saveSettings(user.id, { onboarded: true, modules: { training: false, nutrition: true } });
  else saveSettings(user.id, { modules: { training: true, nutrition: true } });
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
  })
  .partial();

export async function updateSettings(patch: Partial<Settings>) {
  const user = await requireUser();
  const p = settingsSchema.safeParse(patch);
  if (!p.success) return;
  saveSettings(user.id, p.data);
  revalidatePath("/", "layout");
}

export async function updateLocale(locale: string) {
  const user = await requireUser();
  if (isLocale(locale)) setLocale(user.id, locale);
  revalidatePath("/", "layout");
}

export async function logWeight(date: string, kgRaw: string | number) {
  const user = await requireUser();
  const kg = parseDecimal(kgRaw);
  if (!isIsoDate(date) || kg === null || kg <= 20 || kg >= 400) return { error: "invalid" };
  addWeight(user.id, date, Math.round(kg * 10) / 10);
  revalidatePath("/progress");
  revalidatePath("/");
  return {};
}

export async function removeWeight(date: string) {
  const user = await requireUser();
  if (isIsoDate(date)) deleteWeight(user.id, date);
  revalidatePath("/progress");
}

export async function makeInvite(note: string): Promise<{ code?: string }> {
  const user = await requireUser();
  if (!user.is_admin) return {};
  const code = createInvite(user.id, note.trim().slice(0, 60) || null);
  revalidatePath("/settings");
  return { code };
}

export async function updatePassword(current: string, next: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const hash = passwordHash(user.id);
  if (!hash || !verifyPassword(current, hash)) return { error: "wrong" };
  if (next.length < 10 || next.length > 200) return { error: "short" };
  changePassword(user.id, hashPassword(next));
  await destroySession();
  redirect("/login");
}

export async function deleteAccount(confirmWord: string, expected: string) {
  const user = await requireUser();
  if (confirmWord.trim() !== expected) return { error: "confirm" };
  deleteUser(user.id);
  await destroySession();
  redirect("/register");
}
