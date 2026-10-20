"use client";
import { SkipForward, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { postponeSession, skipSession, startWorkout } from "@/app/actions/training";
import { Sheet, useToast } from "@/components/client";
import { Button } from "@/components/ui";
import { INTL } from "@/i18n";
import { useI18n } from "@/i18n/client";

/** Today's date and a live clock with seconds (rendered after mount to avoid a server/client time mismatch). */
export function LiveClock() {
  const { locale } = useI18n();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  if (!now) return <p className="h-10" aria-hidden />;
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 text-muted">
      <span className="inline-block first-letter:uppercase">{new Intl.DateTimeFormat(INTL[locale], { weekday: "long", day: "numeric", month: "long" }).format(now)}</span>
      <span className="text-2xl font-semibold tabular-nums text-text" role="timer" aria-live="off">
        {new Intl.DateTimeFormat(INTL[locale], { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now)}
      </span>
    </p>
  );
}

type Step = null | "menu" | "time" | "place" | "placeTime";

/**
 * "Shorter" and "Skip" for the next workout. Skip doesn't just skip: it asks what's going on and offers a
 * shorter version, the same workout rebuilt for another place / no equipment, postponing, or skipping.
 */
export function TodayWorkoutActions({ planId, sessionKey, places, currentPlace }: {
  planId: string;
  sessionKey: string;
  places: { id: string; name: string }[];
  currentPlace: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [step, setStep] = useState<Step>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = () => { setStep(null); setPlace(null); };
  const minutes = [15, 20, 30, 45];
  const option = (title: string, hint: string, onClick: () => void, danger?: boolean) => (
    <button type="button" onClick={onClick} disabled={pending}
      className={"w-full rounded-xl border border-border px-4 py-3 text-left hover:bg-surface-2 " + (danger ? "text-danger" : "")}>
      <span className="block font-medium">{title}</span>
      <span className="block text-sm text-muted">{hint}</span>
    </button>
  );
  return (
    <>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setStep("time")}><Zap size={16} aria-hidden />{t("today.shorter")}</Button>
        <Button variant="ghost" size="sm" onClick={() => setStep("menu")}><SkipForward size={16} aria-hidden />{t("today.skipToday")}</Button>
      </div>
      <Sheet open={step !== null} onClose={close}
        title={step === "time" ? t("today.shorterTitle") : step === "place" ? t("today.wherePlace") : step === "placeTime" ? t("today.howLong") : t("today.skipTitle")}>
        {step === "menu" && (
          <div className="space-y-2">
            {option(t("today.optShorter"), t("today.optShorterHint"), () => setStep("time"))}
            {option(t("today.optPlace"), t("today.optPlaceHint"), () => setStep("place"))}
            {option(t("today.optPostpone"), t("today.optPostponeHint"), () => start(async () => { await postponeSession(planId, sessionKey); toast({ text: t("today.postponed") }); close(); router.refresh(); }))}
            {option(t("today.optSkip"), t("today.optSkipHint"), () => start(async () => { await skipSession(planId, sessionKey); toast({ text: t("today.skipped") }); close(); router.refresh(); }))}
          </div>
        )}
        {step === "time" && (
          <div className="grid grid-cols-2 gap-2">
            {minutes.map((m) => <Button key={m} variant="secondary" disabled={pending} onClick={() => start(() => startWorkout(planId, sessionKey, m))}>{m} {t("common.min")}</Button>)}
          </div>
        )}
        {step === "place" && (
          <div className="space-y-2">
            {[...places.filter((p) => p.id !== currentPlace), { id: "__none", name: t("today.noEquipmentPlace") }].map((p) => (
              <Button key={p.id} full variant="secondary" onClick={() => { setPlace(p.id); setStep("placeTime"); }}>{p.name}</Button>
            ))}
          </div>
        )}
        {step === "placeTime" && place && (
          <div className="grid grid-cols-2 gap-2">
            <Button className="col-span-2" disabled={pending} onClick={() => start(() => startWorkout(planId, sessionKey, undefined, place))}>{t("today.fullTime")}</Button>
            {[20, 30, 45].map((m) => <Button key={m} variant="secondary" disabled={pending} onClick={() => start(() => startWorkout(planId, sessionKey, m, place))}>{m} {t("common.min")}</Button>)}
          </div>
        )}
      </Sheet>
    </>
  );
}
