"use client";
import { SkipForward, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { skipSession, startWorkout } from "@/app/actions/training";
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

/** "Shorter" (start a shortened version) and "Skip" for the next workout. */
export function TodayWorkoutActions({ planId, sessionKey }: { planId: string; sessionKey: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><Zap size={16} aria-hidden />{t("today.shorter")}</Button>
        <Button variant="ghost" size="sm" disabled={pending}
          onClick={() => start(async () => { await skipSession(planId, sessionKey); toast({ text: t("today.skipped") }); router.refresh(); })}>
          <SkipForward size={16} aria-hidden />{t("today.skipToday")}
        </Button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("today.shorterTitle")}>
        <div className="grid grid-cols-2 gap-2">
          {[15, 20, 30, 45].map((m) => (
            <Button key={m} variant="secondary" disabled={pending} onClick={() => start(() => startWorkout(planId, sessionKey, m))}>{m} {t("common.min")}</Button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
