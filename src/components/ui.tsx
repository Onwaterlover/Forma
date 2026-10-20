import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-contrast hover:bg-accent-hover",
  secondary: "bg-surface-2 text-text hover:bg-border",
  ghost: "bg-transparent text-text hover:bg-surface-2",
  danger: "bg-danger-soft text-danger hover:brightness-95",
};
const SIZE = { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-[15px]", lg: "h-12 px-5 text-base" };

export function buttonClass(variant: Variant = "primary", size: keyof typeof SIZE = "md", full = false) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors select-none disabled:opacity-50 disabled:pointer-events-none",
    VARIANT[variant], SIZE[size], full && "w-full",
  );
}

export function Button({ variant, size, full, className, ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof SIZE; full?: boolean }) {
  return <button type="button" {...rest} className={cx(buttonClass(variant, size, full), className)} />;
}

export function LinkButton({ variant, size, full, className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof SIZE; full?: boolean }) {
  return <Link {...rest} className={cx(buttonClass(variant, size, full), className)} />;
}

export function Card({ className, ...rest }: ComponentProps<"div">) {
  return <div {...rest} className={cx("rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow)] sm:p-5", className)} />;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between gap-2 first:mt-0">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] text-text placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input {...rest} className={cx(inputClass, className)} />;
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select {...rest} className={cx(inputClass, "appearance-none bg-[length:16px] pr-8", className)} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea {...rest} className={cx(inputClass, "h-auto min-h-32 py-2.5 font-mono text-sm", className)} />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "accent" | "warning" | "danger"; children: ReactNode }) {
  const t = { neutral: "bg-surface-2 text-muted", accent: "bg-accent-soft text-accent", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger" }[tone];
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", t)}>{children}</span>;
}

export function Notice({ tone = "neutral", children, className }: { tone?: "neutral" | "accent" | "warning" | "danger"; children: ReactNode; className?: string }) {
  const t = { neutral: "bg-surface-2 text-text", accent: "bg-accent-soft text-text", warning: "bg-warning-soft text-text", danger: "bg-danger-soft text-text" }[tone];
  return <div className={cx("rounded-xl px-3.5 py-3 text-sm leading-relaxed", t, className)}>{children}</div>;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
      <p>{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-label={label}>
      <div className={cx("h-full rounded-full", value > max ? "bg-warning" : "bg-accent")} style={{ width: `${pct}%` }} />
    </div>
  );
}
