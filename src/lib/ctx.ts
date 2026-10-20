import "server-only";
import { cookies } from "next/headers";
import { isLocale, translator, type Locale } from "@/i18n";
import { currentUser, requireUser } from "./auth";
import { getSettings } from "./data";

export async function guestLocale(): Promise<Locale> {
  const c = (await cookies()).get("forma_locale")?.value;
  return isLocale(c) ? c : "pl";
}

/** Everything a signed-in page needs: user, settings, locale and translator. */
export async function pageCtx() {
  const user = await requireUser();
  const locale: Locale = isLocale(user.locale) ? user.locale : "pl";
  return { user, locale, t: translator(locale), settings: getSettings(user.id) };
}

export async function maybeUserLocale(): Promise<{ locale: Locale; theme: string }> {
  const u = await currentUser();
  if (!u) return { locale: await guestLocale(), theme: "system" };
  return { locale: isLocale(u.locale) ? u.locale : "pl", theme: getSettings(u.id).theme };
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const shiftDate = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Monday = 0 to match the engine. */
export const weekdayOf = (iso: string) => (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;

export const isIsoDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
