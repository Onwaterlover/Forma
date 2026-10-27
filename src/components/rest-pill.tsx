"use client";
import { Timer } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";

/** A running rest between sets, kept in the browser so switching tabs doesn't stop or reset it. */
export const REST_KEY = "forma.rest";
export type StoredRest = { workoutId: string; endsAt: number; total: number };

export function readRest(): StoredRest | null {
  try {
    const r = JSON.parse(localStorage.getItem(REST_KEY) ?? "null") as StoredRest | null;
    return r && typeof r.workoutId === "string" && typeof r.endsAt === "number" ? r : null;
  } catch {
    return null;
  }
}

/** On other pages: the rest still counting down, with a tap back to the workout; it vibrates once at the end. */
export function RestPill() {
  const { t } = useI18n();
  const path = usePathname();
  const [now, setNow] = useState<number | null>(null);
  const [rest, setRest] = useState<StoredRest | null>(null);
  useEffect(() => {
    const read = () => { setRest(readRest()); setNow(Date.now()); };
    read();
    const iv = setInterval(read, 1000);
    return () => clearInterval(iv);
  }, []);
  const here = !!rest && path === `/workout/${rest.workoutId}`;
  const left = rest && now !== null ? Math.ceil((rest.endsAt - now) / 1000) : 0;
  useEffect(() => {
    if (!rest || here || left > 0) return;
    try { localStorage.removeItem(REST_KEY); } catch {}
    // Just finished (not a leftover from long ago): the same buzz as in the workout.
    if (left > -3) try { navigator.vibrate?.([200, 100, 200]); } catch {}
    setRest(null);
  }, [rest, here, left]);
  if (!rest || here || left <= 0) return null;
  return (
    <Link href={`/workout/${rest.workoutId}`} className="fixed bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] right-4 z-40 flex h-11 items-center gap-2 rounded-full bg-text px-4 font-medium text-bg shadow-lg md:bottom-6 print:hidden">
      <Timer size={16} aria-hidden />{t("workout.restTimer")} · <span className="tabular-nums">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
    </Link>
  );
}
