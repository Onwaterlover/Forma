"use client";
import { CircleHelp, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { Exercise, Grip } from "@/engine/types";
import { exName } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { Sheet } from "./client";
import { cx, Notice } from "./ui";

/** "How do I do it?" — cues, safety, muscles, grip choice and a technique-video search. */
export function HowTo({ exercise, grip, onGripChange, compact }: { exercise: Exercise; grip?: Grip; onGripChange?: (g: Grip) => void; compact?: boolean }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const cue = exercise.cue[locale] ?? exercise.cue.en ?? exercise.cue.pl;
  const safety = exercise.safety?.[locale] ?? exercise.safety?.en ?? exercise.safety?.pl;
  const video = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name.en} proper form`)}`;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={cx("inline-flex items-center gap-1 rounded-lg text-sm font-medium text-accent hover:underline", compact ? "h-8" : "h-9")}>
        <CircleHelp size={16} aria-hidden />{t("plan.howTo")}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={exName(exercise, locale)}>
        <div className="space-y-4 text-sm leading-relaxed">
          {cue && <p className="text-[15px]">{cue}</p>}
          {safety && <Notice tone="warning">{t("library.safety")}: {safety}</Notice>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted">
            <dt>{t("library.primary")}</dt><dd className="text-text">{exercise.primary.map((m) => t(`muscles.${m}`)).join(", ") || "—"}</dd>
            {exercise.secondary.length > 0 && <><dt>{t("library.secondary")}</dt><dd className="text-text">{exercise.secondary.map((m) => t(`muscles.${m}`)).join(", ")}</dd></>}
          </dl>
          {exercise.grips && (
            <div className="space-y-2">
              <p className="font-medium">{t("plan.grip")}</p>
              {exercise.grips.map((g) => (
                <button key={g} type="button" disabled={!onGripChange} aria-pressed={grip === g} onClick={() => onGripChange?.(g)}
                  className={cx("block w-full rounded-xl border px-3 py-2 text-left", grip === g ? "border-accent bg-accent-soft" : "border-border", onGripChange && "hover:bg-surface-2")}>
                  <span className="font-medium capitalize">{t(`plan.grips.${g}`)}</span>
                  <span className="block text-xs text-muted">{t(`plan.gripHint.${g}`)}</span>
                </button>
              ))}
            </div>
          )}
          <a href={video} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline">
            <ExternalLink size={16} aria-hidden />{t("plan.video")}
          </a>
        </div>
      </Sheet>
    </>
  );
}
