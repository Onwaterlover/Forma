"use client";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Notice } from "./ui";

/** A notice the user can hide; remembered per device by `id`, so a changed message shows up again. */
export function DismissibleNotice({ id, dismissible = true, closeLabel, tone, className, children }: {
  id: string; dismissible?: boolean; closeLabel: string; tone?: "neutral" | "accent" | "warning" | "danger"; className?: string; children: ReactNode;
}) {
  const key = `forma.dismissed:${id}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem(key) === "1"); } catch {} }, [key]);
  if (hidden) return null;
  return (
    <Notice tone={tone} className={className}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {dismissible && (
          <button type="button" aria-label={closeLabel} title={closeLabel} className="-mr-1.5 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-black/5"
            onClick={() => { setHidden(true); try { localStorage.setItem(key, "1"); } catch {} }}>
            <X size={16} aria-hidden />
          </button>
        )}
      </div>
    </Notice>
  );
}
