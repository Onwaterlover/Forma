export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Forma";

/** Compact symbol: an almost-closed ring (steady rhythm) with a dot marking the next step. */
export function LogoMark({ size = 28, mono = false, className }: { size?: number; mono?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="16" fill={mono ? "currentColor" : "var(--accent)"} />
      <circle cx="32" cy="32" r="15" fill="none" stroke={mono ? "var(--bg)" : "var(--accent-contrast)"} strokeWidth="6" strokeLinecap="round" strokeDasharray="75 19.25" transform="rotate(-50 32 32)" />
      <circle cx="32.8" cy="17" r="3.5" fill={mono ? "var(--bg)" : "var(--accent-contrast)"} />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight lowercase">{APP_NAME}</span>
    </span>
  );
}
