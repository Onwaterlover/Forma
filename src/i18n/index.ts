import type { Exercise, Lang, Message } from "@/engine/types";
import { de } from "./de";
import { en } from "./en";
import { pl, type Dict } from "./pl";

export const LOCALES = ["pl", "en", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DICTS: Record<Locale, Dict> = { pl, en, de };
export const INTL: Record<Locale, string> = { pl: "pl-PL", en: "en-GB", de: "de-DE" };

export type T = (key: string, params?: Record<string, string | number>) => string;

function lookup(dict: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), dict);
}

export function translator(locale: Locale): T {
  const d = DICTS[locale] ?? pl;
  return (key, params) => {
    const v = lookup(d, key) ?? lookup(pl, key);
    if (typeof v !== "string") return key;
    if (!params) return v;
    return v.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
  };
}

export const isLocale = (x: unknown): x is Locale => LOCALES.includes(x as Locale);

export function fmt(locale: Locale, n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(INTL[locale], { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function fmtDate(locale: Locale, iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat(INTL[locale], opts).format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso));
}

/** 75 → "1:15 min", 120 → "2 min", 45 → "45 s". */
export function fmtRest(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}:${String(s).padStart(2, "0")} min` : `${m} min`;
}

export const exName = (ex: Exercise | undefined, locale: Lang, fallback = "?") => (ex ? ex.name[locale] || ex.name.en || ex.name.pl : fallback);

/** Turn an engine message into text; ids inside params become readable names. */
export function renderMessage(
  m: Message,
  t: T,
  locale: Locale,
  lookupEx: (id: string) => Exercise | undefined,
  locationName: (id: string) => string = (id) => id,
): string {
  const p: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(m.params ?? {})) {
    if (k === "exercise" || k === "from" || k === "to") p[k] = exName(lookupEx(String(v)), locale, String(v));
    else if (k === "exercises") p[k] = String(v).split(",").filter(Boolean).map((id) => exName(lookupEx(id), locale, id)).join(", ");
    else if (k === "pattern") p[k] = t(`patterns.${v}`);
    else if (k === "muscle") p[k] = t(`muscles.${v}`);
    else if (k === "muscles") p[k] = String(v).split(",").map((x) => t(`muscles.${x}`)).join(", ");
    else if (k === "split") p[k] = t(`split.${v}`);
    else if (k === "sport") p[k] = t(`sports.${v}`);
    else if (k === "region") p[k] = t(`regions.${v}`);
    else if (k === "location") p[k] = locationName(String(v));
    else if (k === "day") p[k] = (DICTS[locale].days.long[Number(v)] ?? String(v));
    else p[k] = typeof v === "number" ? fmt(locale, v, 1) : v;
  }
  return t(`msg.${m.code}`, p);
}

/** "3 serie", "5 serii", "1 seria" (and en/de). */
export function setsText(locale: Locale, n: number): string {
  if (locale === "pl") return `${n} ${n === 1 ? "seria" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "serie" : "serii"}`;
  if (locale === "de") return `${n} ${n === 1 ? "Satz" : "Sätze"}`;
  return `${n} ${n === 1 ? "set" : "sets"}`;
}

/**
 * What an exercise asks for: "3 × 8–12" for beginners, just "3 serie" for people who already train (they pick
 * the weight themselves; the app still uses the range for its hints). Timed exercises always show the seconds.
 */
export function prescriptionText(locale: Locale, e: { sets: number; repMin: number; repMax: number; seconds?: number | null }, showRange: boolean): string {
  if (e.seconds) return `${e.sets} × ${e.seconds} s`;
  return showRange ? `${e.sets} × ${e.repMin}–${e.repMax}` : setsText(locale, e.sets);
}
