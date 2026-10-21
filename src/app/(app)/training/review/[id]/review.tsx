"use client";
import { Check, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { applyReview } from "@/app/actions/training";
import { useToast } from "@/components/client";
import { Badge, Button, Card, cx } from "@/components/ui";
import type { Trait } from "@/engine/traits";
import { useI18n } from "@/i18n/client";

type Option = { id: string; name: string; traits: Trait[] };
export type ReviewDay = { key: string; day: string; title: string; slots: { index: number; options: Option[] }[] };

/**
 * One training day per step. Each exercise is one line (the recommended one is preselected); "other
 * options" opens the alternatives. A choice applies to that exercise in every day of the plan.
 */
export function PlanReview({ planId, days }: { planId: string; days: ReviewDay[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<Record<string, string>>({}); // recommended id → chosen id
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const summary = step === days.length;

  const chosen = (slot: ReviewDay["slots"][number]) => {
    const rec = slot.options[0]!;
    const pick = choice[rec.id];
    return slot.options.find((o) => o.id === pick) ?? rec;
  };
  const why = (o: Option) => o.traits.map((tr) => t(`review.trait.${tr}`)).join(" · ");

  const confirm = () =>
    start(async () => {
      const swaps = days.flatMap((d) => d.slots.flatMap((s) => {
        const c = chosen(s);
        return c.id === s.options[0]!.id ? [] : [{ sessionKey: d.key, index: s.index, from: s.options[0]!.id, to: c.id }];
      }));
      const r = await applyReview(planId, swaps);
      if (r?.error) toast({ text: t("common.error") });
    });

  const day = days[step];

  return (
    <div className="space-y-4 pb-[calc(9rem_+_env(safe-area-inset-bottom))] md:pb-24">
      <div className="flex gap-1" aria-hidden>
        {[...days, null].map((_, i) => <span key={i} className={cx("h-1 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-surface-2")} />)}
      </div>

      {!summary && day ? (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">{t("review.dayOf", { n: step + 1, total: days.length })} · {day.day}</p>
            <h2 className="text-xl font-semibold">{day.title}</h2>
          </div>
          <ul className="space-y-2">
            {day.slots.map((s) => {
              const c = chosen(s);
              const rec = s.options[0]!;
              const id = `${day.key}:${s.index}`;
              const expanded = open === id;
              return (
                <li key={id}>
                  <Card className="p-0 sm:p-0">
                    <button type="button" onClick={() => setOpen(expanded ? null : id)} disabled={s.options.length < 2} aria-expanded={expanded}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left">
                      <span className="w-5 shrink-0 pt-0.5 text-sm tabular-nums text-muted">{s.index + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 font-medium">{c.name}{c.id === rec.id && <Badge tone="accent">{t("review.recommended")}</Badge>}</span>
                        <span className="block text-xs text-muted">{why(c)}</span>
                      </span>
                      {s.options.length > 1 && <ChevronDown size={18} className={cx("mt-0.5 shrink-0 text-muted transition-transform", expanded && "rotate-180")} aria-hidden />}
                    </button>
                    {expanded && (
                      <ul className="border-t border-border px-2 py-1" role="radiogroup" aria-label={rec.name}>
                        {s.options.map((o) => (
                          <li key={o.id}>
                            <button type="button" role="radio" aria-checked={o.id === c.id}
                              onClick={() => { setChoice({ ...choice, [rec.id]: o.id }); setOpen(null); }}
                              className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2">
                              <span className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border", o.id === c.id ? "border-accent bg-accent text-accent-contrast" : "border-border")}>
                                {o.id === c.id && <Check size={12} aria-hidden />}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[15px]">{o.name}{o.id === rec.id && <span className="ml-1.5 text-xs text-accent">{t("review.recommended")}</span>}</span>
                                <span className="block text-xs text-muted">{why(o)}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">{t("review.everywhere")}</p>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold">{t("review.summary")}</h2>
          {days.map((d) => (
            <Card key={d.key} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">{d.day}</p>
              <p className="font-semibold">{d.title}</p>
              <ol className="text-sm">
                {d.slots.map((s) => {
                  const c = chosen(s);
                  return <li key={s.index} className={cx("py-0.5", c.id !== s.options[0]!.id && "font-medium text-accent")}>{s.index + 1}. {c.name}</li>;
                })}
              </ol>
            </Card>
          ))}
        </>
      )}

      <div className="fixed inset-x-0 bottom-[calc(4rem_+_env(safe-area-inset-bottom))] z-30 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-3xl gap-2">
          {step > 0 && <Button variant="ghost" className="px-3" onClick={() => setStep(step - 1)}>{t("common.back")}</Button>}
          {summary ? (
            <Button full disabled={pending} onClick={confirm}>{t("review.confirm")}</Button>
          ) : (
            <>
              <Button variant="secondary" className="whitespace-nowrap" disabled={pending} onClick={Object.keys(choice).length ? confirm : () => router.push("/training")}>{t("review.acceptAll")}</Button>
              <Button full onClick={() => { setStep(step + 1); setOpen(null); window.scrollTo({ top: 0 }); }}>{t("common.next")}</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
