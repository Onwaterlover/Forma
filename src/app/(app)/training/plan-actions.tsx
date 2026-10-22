"use client";
import { BookOpen, ChevronRight, CircleHelp, FileInput, History, MoreHorizontal, Plus, Printer, SlidersHorizontal, ThumbsDown, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { deletePlanAction, regenerateWithFeedback, type PlanFeedback } from "@/app/actions/training";
import { Chips, Sheet, useToast } from "@/components/client";
import { HowToPicker } from "@/components/how-to";
import { Button, cx, Notice } from "@/components/ui";
import type { Exercise } from "@/engine/types";
import { useI18n } from "@/i18n/client";

const REASONS: PlanFeedback["reasons"] = ["too_long", "too_short", "fewer_days", "more_days", "more_upper", "more_lower", "too_hard", "more_machines", "more_free", "more_bodyweight"];

/**
 * Everything around the plan behind one "⋯" button, kept to five entries: history, exercises, how-to,
 * print/PDF and "New plan…" (wizard, import, or adjusting the current plan). Deleting lives on the edit page.
 */
export function PlanMenu({ planId, exercises, library, feedback, logging, hasProfile }: {
  planId: string | null;
  exercises: { id: string; name: string }[];
  library: Exercise[];
  feedback: boolean;
  logging: boolean;
  hasProfile: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [sheet, setSheet] = useState<"menu" | "new" | "feedback" | "howto" | null>(null);
  const [reasons, setReasons] = useState<PlanFeedback["reasons"]>([]);
  const [dislike, setDislike] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const row = "flex w-full items-center gap-3 px-3 py-3 text-left text-[15px] hover:bg-surface-2";
  const item = (icon: ReactNode, label: string, opts: { href?: string; onClick?: () => void; danger?: boolean }) => (
    <li key={label}>
      {opts.href
        ? <Link href={opts.href} className={row} onClick={() => setSheet(null)}>{icon}<span className="flex-1">{label}</span><ChevronRight size={16} className="text-muted" aria-hidden /></Link>
        : <button type="button" className={cx(row, opts.danger && "text-danger")} onClick={opts.onClick}>{icon}<span className="flex-1">{label}</span></button>}
    </li>
  );

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setSheet("menu")} aria-label={t("common.more")}><MoreHorizontal size={18} aria-hidden /></Button>

      <Sheet open={sheet === "menu"} onClose={() => setSheet(null)} title={t("plan.title")}>
        <ul className="-mx-2 divide-y divide-border">
          {logging && item(<History size={18} aria-hidden />, t("workout.history"), { href: "/training/history" })}
          {item(<BookOpen size={18} aria-hidden />, t("library.title"), { href: "/training/exercises" })}
          {item(<CircleHelp size={18} aria-hidden />, t("plan.howToAny"), { onClick: () => setSheet("howto") })}
          {planId && item(<Printer size={18} aria-hidden />, t("plan.print"), { onClick: () => { setSheet(null); setTimeout(() => window.print(), 150); } })}
          {item(<Plus size={18} aria-hidden />, t("plan.newPlan"), { onClick: () => setSheet("new") })}
        </ul>
      </Sheet>

      <Sheet open={sheet === "new"} onClose={() => setSheet(null)} title={t("plan.newPlan")}>
        <ul className="-mx-2 divide-y divide-border">
          {item(<SlidersHorizontal size={18} aria-hidden />, hasProfile ? t("plan.profile") : t("plan.create"), { href: "/training/setup" })}
          {item(<FileInput size={18} aria-hidden />, t("plan.import"), { href: "/training/import" })}
          {planId && feedback && item(<ThumbsDown size={18} aria-hidden />, t("plan.dislike"), { onClick: () => setSheet("feedback") })}
        </ul>
      </Sheet>

      <HowToPicker open={sheet === "howto"} onClose={() => setSheet(null)} ids={exercises.map((e) => e.id)} library={library} />

      <Sheet open={sheet === "feedback"} onClose={() => setSheet(null)} title={t("plan.feedbackTitle")} wide>
        <div className="space-y-5">
          <p className="text-sm text-muted">{t("plan.feedbackHint")}</p>
          <Chips label={t("plan.feedbackTitle")} values={reasons} onChange={setReasons} options={REASONS.map((r) => ({ value: r, label: t(`plan.reasons.${r}`) }))} />
          {exercises.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("plan.dislikeExercises")}</p>
              <Chips label={t("plan.dislikeExercises")} values={dislike} onChange={setDislike} options={exercises.map((e) => ({ value: e.id, label: e.name }))} />
            </div>
          )}
          {!reasons.length && !dislike.length && <Notice>{t("plan.feedbackEmpty")}</Notice>}
          <Button full disabled={pending || (!reasons.length && !dislike.length)}
            onClick={() => start(async () => {
              const r = await regenerateWithFeedback({ reasons, dislike });
              if (r?.error) return toast({ text: t("plan.feedbackEmpty") });
              toast({ text: t("plan.feedbackDone") });
              setSheet(null);
              setReasons([]);
              setDislike([]);
            })}>
            {pending ? t("onb.generating") : t("plan.regenerateFeedback")}
          </Button>
        </div>
      </Sheet>

    </>
  );
}

/** "Delete plan" with confirmation (used on the plan edit page). */
/** `undoImport`: shown right after an import; removes the plan with the exercises the import added and goes back to the importer. */
export function DeletePlanButton({ planId, undoImport }: { planId: string; undoImport?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant={undoImport ? "secondary" : "danger"} size="sm" className={undoImport ? "shrink-0 whitespace-nowrap" : undefined} onClick={() => setOpen(true)}><Trash2 size={16} aria-hidden />{t(undoImport ? "import.undo" : "plan.delete")}</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t(undoImport ? "import.undo" : "plan.delete")}>
        <p className="mb-4 text-sm">{t(undoImport ? "import.undoConfirm" : "plan.deleteConfirm")}</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button full variant="danger" disabled={pending} onClick={() => start(() => deletePlanAction(planId, undoImport ? "import" : undefined))}>{t(undoImport ? "import.undo" : "plan.delete")}</Button>
        </div>
      </Sheet>
    </>
  );
}
