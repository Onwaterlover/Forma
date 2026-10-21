import { cx } from "./ui";

/** One row of single-choice chips with an "All" chip; scrolls sideways on narrow screens. */
export function FilterRow<V extends string>({ label, value, onChange, options, allLabel }: {
  label: string; value: V | null; onChange: (v: V | null) => void; options: { value: V; label: string }[]; allLabel: string;
}) {
  const chip = (on: boolean) => cx("h-9 shrink-0 rounded-full border px-3.5 text-sm", on ? "border-accent bg-accent text-accent-contrast" : "border-border bg-surface hover:bg-surface-2");
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <div className="no-scrollbar -mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1">
        <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} className={chip(value === null)}>{allLabel}</button>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(value === o.value ? null : o.value)} className={chip(value === o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}
