"use client";
import { ThumbsDown, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deletePlanAction, regenerateWithFeedback, type PlanFeedback } from "@/app/actions/training";
import { Chips, Sheet, useToast } from "@/components/client";
import { Button, Notice } from "@/components/ui";
import { useI18n } from "@/i18n/client";

const REASONS: PlanFeedback["reasons"] = ["too_long", "too_short", "fewer_days", "more_days", "more_upper", "more_lower", "too_hard", "more_machines", "more_free", "more_bodyweight"];

/** "I don't like it" (feedback → new plan) and "Delete plan" with confirmation. */
export function PlanActions({ planId, exercises, feedback = true }: { planId: string; exercises: { id: string; name: string }[]; feedback?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [sheet, setSheet] = useState<"feedback" | "delete" | null>(null);
  const [reasons, setReasons] = useState<PlanFeedback["reasons"]>([]);
  const [dislike, setDislike] = useState<string[]>([]);
  const [pending, start] = useTransition();

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {feedback && <Button variant="secondary" size="sm" onClick={() => setSheet("feedback")}><ThumbsDown size={16} aria-hidden />{t("plan.dislike")}</Button>}
        <Button variant="ghost" size="sm" className="text-danger" onClick={() => setSheet("delete")}><Trash2 size={16} aria-hidden />{t("plan.delete")}</Button>
      </div>

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

      <Sheet open={sheet === "delete"} onClose={() => setSheet(null)} title={t("plan.delete")}>
        <p className="mb-4 text-sm">{t("plan.deleteConfirm")}</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setSheet(null)}>{t("common.cancel")}</Button>
          <Button full variant="danger" disabled={pending} onClick={() => start(() => deletePlanAction(planId))}>{t("plan.delete")}</Button>
        </div>
      </Sheet>
    </>
  );
}
