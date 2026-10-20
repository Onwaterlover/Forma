"use client";
import { useRouter } from "next/navigation";
import { LOCALES } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { cx } from "@/components/ui";

export function LocaleSwitch() {
  const { locale } = useI18n();
  const router = useRouter();
  return (
    <div className="flex gap-1 text-sm" role="group" aria-label="Language">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={l === locale}
          onClick={() => {
            document.cookie = `forma_locale=${l}; path=/; max-age=31536000; samesite=lax`;
            router.refresh();
          }}
          className={cx("h-9 rounded-lg px-2.5 uppercase", l === locale ? "bg-surface-2 font-semibold" : "text-muted hover:bg-surface-2")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
