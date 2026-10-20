"use client";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/** Goes back in history when the user came from inside the app; otherwise to the parent page. */
export function BackButton({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        const fromApp = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin);
        if (fromApp && window.history.length > 1) router.back();
        else router.push(href);
      }}
      className="-ml-2 mb-2 inline-flex h-9 items-center gap-1 rounded-lg pl-1 pr-2.5 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text"
    >
      <ChevronLeft size={18} aria-hidden />
      {label}
    </button>
  );
}
