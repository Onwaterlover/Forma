"use client";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Assistant } from "@/components/assistant";
import { Notice } from "@/components/ui";
import { useI18n } from "@/i18n/client";

/** "Your plan is ready – want a short AI review?" shown once per plan; later it lives in the assistant's suggestions. */
export function ReviewOffer({ planId, date, enabled, provider }: { planId: string; date: string; enabled: boolean; provider: "gemini" | "anthropic" }) {
  const { t } = useI18n();
  const key = `forma.reviewOffer:${planId}`;
  const [show, setShow] = useState(false);
  useEffect(() => { try { setShow(localStorage.getItem(key) !== "1"); } catch { setShow(true); } }, [key]);
  const done = () => { setShow(false); try { localStorage.setItem(key, "1"); } catch {} };
  if (!show) return null;
  return (
    <Notice tone="accent" className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <span className="min-w-0 flex-1">{t("assistant.reviewOffer")}</span>
      <span className="flex items-center gap-1">
        <Assistant scope="training" date={date} enabled={enabled} provider={provider} review onClose={done} />
        <button type="button" aria-label={t("plan.hideIssues")} onClick={done} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-black/5"><X size={16} aria-hidden /></button>
      </span>
    </Notice>
  );
}
