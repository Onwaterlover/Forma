"use client";
import { Printer } from "lucide-react";
import { useI18n } from "@/i18n/client";

/** The browser's print dialog also offers "Save as PDF". The page has print styles for a clean result. */
export function PrintButton() {
  const { t } = useI18n();
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-accent hover:bg-surface-2">
      <Printer size={16} aria-hidden />{t("plan.print")}
    </button>
  );
}
