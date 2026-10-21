"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";

// ── Choice cards (radio group with large touch targets) ─────────────────
export function Choices<V extends string | number>({
  value, onChange, options, columns = 1, name,
}: {
  value: V | null;
  onChange: (v: V) => void;
  options: { value: V; label: ReactNode; hint?: ReactNode }[];
  columns?: 1 | 2 | 3 | 4;
  name?: string;
}) {
  const id = useId();
  const grid = { 1: "", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  return (
    <div role="radiogroup" aria-label={name} className={cx("grid gap-2", grid)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <label
            key={String(o.value)}
            className={cx(
              "flex cursor-pointer flex-col justify-center rounded-xl border px-3.5 py-3 transition-colors min-h-12",
              on ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-2",
            )}
          >
            <input type="radio" name={name ?? id} className="sr-only" checked={on} onChange={() => onChange(o.value)} />
            <span className="text-[15px] font-medium">{o.label}</span>
            {o.hint && <span className="mt-0.5 text-xs text-muted">{o.hint}</span>}
          </label>
        );
      })}
    </div>
  );
}

// ── Multi-select chips ───────────────────────────────────────────────────
export function Chips<V extends string | number>({ values, onChange, options, label }: { values: V[]; onChange: (v: V[]) => void; options: { value: V; label: ReactNode }[]; label?: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
            className={cx(
              "min-h-10 rounded-full border px-3.5 text-sm transition-colors",
              on ? "border-accent bg-accent text-accent-contrast" : "border-border bg-surface hover:bg-surface-2",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Switch ───────────────────────────────────────────────────────────────
export function Switch({ checked, onChange, label, hint, name }: { checked: boolean; onChange?: (v: boolean) => void; label: ReactNode; hint?: ReactNode; name?: string }) {
  const [on, setOn] = useState(checked);
  useEffect(() => setOn(checked), [checked]);
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        name={name}
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          onChange?.(e.target.checked);
        }}
        className="peer sr-only"
      />
      <span aria-hidden className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent", on ? "bg-accent" : "bg-border")}>
        <span className={cx("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform", on ? "translate-x-5.5" : "translate-x-0.5")} />
      </span>
    </label>
  );
}

// ── Native dialog as a bottom sheet on mobile, centered on desktop ──────
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (!open) return;
    // Keep the page behind still while a sheet is open (iOS otherwise scrolls it under the finger).
    const root = document.documentElement;
    root.style.overflow = "hidden";
    return () => { root.style.overflow = ""; };
  }, [open]);
  return (
    <dialog
      ref={ref}
      // Only user gestures (Escape, backdrop, close button) call onClose; programmatic closes must not,
      // otherwise switching from one sheet to another would immediately dismiss the new one.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={cx(
        "m-0 mt-auto w-full max-w-none rounded-t-3xl border border-border bg-surface p-0 text-text sm:m-auto sm:rounded-3xl",
        wide ? "sm:max-w-2xl" : "sm:max-w-lg",
      )}
    >
      <div className="flex max-h-[88dvh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="-mr-2 grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-surface-2" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {/* Closed sheets render nothing, so cameras, timers and forms inside them really stop. */}
        <div className="safe-bottom overflow-y-auto overscroll-contain px-5 py-4">{open ? children : null}</div>
      </div>
    </dialog>
  );
}

// ── Toasts with optional undo ────────────────────────────────────────────
type Toast = { id: number; text: string; action?: { label: string; run: () => void } };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.action ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-text px-4 py-3 text-sm text-bg shadow-lg">
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => {
                  t.action!.run();
                  setItems((xs) => xs.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Locale-friendly decimal input: accepts "12,5"; emits numbers or null. */
export function DecimalInput({
  value, onChange, className, ...rest
}: Omit<React.ComponentProps<"input">, "value" | "onChange"> & { value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : String(value).replace(".", ","));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(value === null ? "" : String(value).replace(".", ","));
      last.current = value;
    }
  }, [value]);
  return (
    <input
      {...rest}
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.,]/g, "");
        setText(raw);
        const n = raw === "" ? null : Number(raw.replace(",", "."));
        const v = n === null || Number.isFinite(n) ? n : null;
        last.current = v;
        onChange(v);
      }}
      onFocus={(e) => e.target.select()}
      className={cx(
        "h-11 w-full rounded-xl border border-border bg-surface px-3 text-center text-[15px] tabular-nums focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
        className,
      )}
    />
  );
}
