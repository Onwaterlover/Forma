"use client";
import type { Verdict } from "@/engine/compare";
import { cx } from "@/components/ui";
import { useI18n } from "@/i18n/client";

/** A swap's verdict versus the recommended exercise, as one small coloured label. */
export function VerdictChip({ verdict }: { verdict?: Verdict }) {
  const { t } = useI18n();
  if (!verdict) return null;
  const tone = { same: "bg-accent-soft text-accent", slightly: "bg-warning-soft text-warning", much: "bg-danger-soft text-danger" }[verdict];
  return <span className={cx("inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium", tone)}>{t(`review.verdict.${verdict}`)}</span>;
}
