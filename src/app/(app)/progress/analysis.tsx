"use client";
import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { analyzeProgressAction } from "@/app/actions/assistant";
import { Button } from "@/components/ui";
import { useI18n } from "@/i18n/client";

/** "Analyse (AI)": a short read of the last weeks' weight, food and workouts, on request only. */
export function ProgressAnalysis() {
  const { t } = useI18n();
  const [result, setResult] = useState<{ text?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const err = (code: string) => {
    const s = t(`assistant.errors.${code}`);
    return s.startsWith("assistant.") ? t("assistant.errors.generic") : s;
  };
  return (
    <div className="space-y-2">
      {result?.text && <p className="whitespace-pre-wrap rounded-xl bg-surface-2 px-3.5 py-3 text-sm leading-relaxed">{result.text}</p>}
      {result?.error && <p className="text-sm text-danger">{err(result.error)}</p>}
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => setResult(await analyzeProgressAction().catch(() => ({ error: "generic" }))))}>
        <Sparkles size={16} aria-hidden />{pending ? t("progress.analyzing") : result?.text ? t("progress.analyzeAgain") : t("progress.analyze")}
      </Button>
    </div>
  );
}
