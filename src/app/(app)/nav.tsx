"use client";
import { Apple, Dumbbell, House, Settings, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { useNavPending } from "./nav-pending";

const ICONS = { today: House, training: Dumbbell, nutrition: Apple, progress: TrendingUp, settings: Settings };

export function Nav({ items, variant }: { items: { href: string; label: string; icon: keyof typeof ICONS }[]; variant: "side" | "bottom" }) {
  const current = usePathname();
  const { pending, go } = useNavPending();
  // Highlight the tapped tab immediately, before the new page has arrived.
  const path = pending ?? current;
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/training" && path.startsWith("/workout")));
  const tap = (href: string) => (e: React.MouseEvent) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) go(href); };
  if (variant === "bottom") {
    return (
      <ul className="mx-auto flex max-w-lg justify-around">
        {items.map((it) => {
          const Icon = ICONS[it.icon];
          const on = active(it.href);
          return (
            <li key={it.href} className="flex-1">
              <Link href={it.href} onClick={tap(it.href)} aria-current={on ? "page" : undefined} className={cx("flex h-16 flex-col items-center justify-center gap-1 text-[11px]", on ? "text-accent" : "text-muted")}>
                <Icon size={22} strokeWidth={on ? 2.2 : 1.8} aria-hidden />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <ul className="space-y-1">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const on = active(it.href);
        return (
          <li key={it.href}>
            <Link href={it.href} onClick={tap(it.href)} aria-current={on ? "page" : undefined} className={cx("flex h-11 items-center gap-3 rounded-xl px-3 text-[15px]", on ? "bg-accent-soft font-medium text-accent" : "text-text hover:bg-surface-2")}>
              <Icon size={20} strokeWidth={1.9} aria-hidden />
              {it.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
