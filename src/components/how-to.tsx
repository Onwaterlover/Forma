"use client";
import { ChevronLeft, ChevronRight, CircleHelp, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { Exercise, Grip } from "@/engine/types";
import { exName } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { Sheet } from "./client";
import { cx, Input, Notice } from "./ui";

/** Cues, safety, muscles, grip choice and a technique-video search for one exercise. */
function HowToBody({ exercise, grip, onGripChange }: { exercise: Exercise; grip?: Grip; onGripChange?: (g: Grip) => void }) {
  const { t, locale } = useI18n();
  const cue = exercise.cue[locale] ?? exercise.cue.en ?? exercise.cue.pl;
  const safety = exercise.safety?.[locale] ?? exercise.safety?.en ?? exercise.safety?.pl;
  const video = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name.en} proper form`)}`;
  return (
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
  );
}

/** "How do I do it?" for a single exercise (used in the exercise library). */
export function HowTo({ exercise, grip, onGripChange, compact }: { exercise: Exercise; grip?: Grip; onGripChange?: (g: Grip) => void; compact?: boolean }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={cx("inline-flex items-center gap-1 rounded-lg text-sm font-medium text-accent hover:underline", compact ? "h-8" : "h-9")}>
        <CircleHelp size={16} aria-hidden />{t("plan.howTo")}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={exName(exercise, locale)}>
        <HowToBody exercise={exercise} grip={grip} onGripChange={onGripChange} />
      </Sheet>
    </>
  );
}

/**
 * One "How to do an exercise?" entry instead of a link under every exercise: lists the exercises
 * of the current workout or plan first, with a search over the whole library.
 * Pass `open`/`onClose` to control it from a menu; otherwise it renders its own button.
 */
export function HowToPicker({ ids, library, open: controlled, onClose }: { ids: string[]; library: Exercise[]; open?: boolean; onClose?: () => void }) {
  const { t, locale } = useI18n();
  const [own, setOwn] = useState(false);
  const [picked, setPicked] = useState<Exercise | null>(null);
  const [q, setQ] = useState("");
  const open = controlled ?? own;
  const close = () => { setPicked(null); setQ(""); if (onClose) onClose(); else setOwn(false); };
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
  const inContext = [...new Set(ids)].map((id) => library.find((e) => e.id === id)).filter((e): e is Exercise => !!e);
  const found = q.trim().length < 2 ? [] : library.filter((e) => [e.name[locale], e.name.en, ...(e.aliases ?? [])].some((n) => n && norm(n).includes(norm(q.trim())))).slice(0, 8);
  const row = (e: Exercise) => (
    <li key={e.id}>
      <button type="button" onClick={() => setPicked(e)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[15px] hover:bg-surface-2">
        {exName(e, locale)}<ChevronRight size={16} className="text-muted" aria-hidden />
      </button>
    </li>
  );
  return (
    <>
      {controlled === undefined && (
        <button type="button" onClick={() => setOwn(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-accent hover:bg-surface-2">
          <CircleHelp size={16} aria-hidden />{t("plan.howToAny")}
        </button>
      )}
      <Sheet open={open} onClose={close} title={picked ? exName(picked, locale) : t("plan.howToAny")}>
        {picked ? (
          <div className="space-y-4">
            <button type="button" onClick={() => setPicked(null)} className="-ml-1 inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ChevronLeft size={16} aria-hidden />{t("plan.back")}</button>
            <HowToBody exercise={picked} />
          </div>
        ) : (
          <div className="space-y-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("library.search")} aria-label={t("library.search")} />
            {q.trim().length >= 2 ? (
              <ul className="divide-y divide-border rounded-xl border border-border">{found.length ? found.map(row) : <li className="px-3 py-2.5 text-sm text-muted">{t("onb.excludeNone")}</li>}</ul>
            ) : inContext.length > 0 && (
              <ul className="divide-y divide-border rounded-xl border border-border">{inContext.map(row)}</ul>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
