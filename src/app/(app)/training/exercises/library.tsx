"use client";
import { ChevronDown, Plus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { createCustomExercise, setExercisePref } from "@/app/actions/training";
import { Sheet, useToast } from "@/components/client";
import { Badge, Button, Card, cx, Field, Input, Notice, Select } from "@/components/ui";
import { EXERCISES } from "@/engine/exercises";
import { PATTERNS, type Exercise, type ExercisePref, type Loading, type Pattern } from "@/engine/types";
import { exName } from "@/i18n";
import { useI18n } from "@/i18n/client";

const PREFS: ExercisePref[] = ["favorite", "like", "neutral", "dislike", "exclude", "pain"];
const LOADINGS: Loading[] = ["total", "per_dumbbell", "per_side", "bodyweight", "bodyweight_plus", "assisted", "time"];

export function Library({ prefs: initialPrefs, custom }: { prefs: Record<string, ExercisePref>; custom: Exercise[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [prefs, setPrefs] = useState(initialPrefs);
  const [q, setQ] = useState("");
  const [pattern, setPattern] = useState<Pattern | "">("");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ name: string; pattern: Pattern; loading: Loading }>({ name: "", pattern: "h_push", loading: "total" });
  const [pending, start] = useTransition();
  const all = useMemo(() => [...custom, ...EXERCISES], [custom]);

  const list = all.filter((e) => {
    if (pattern && e.pattern !== pattern) return false;
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return [e.name.pl, e.name.en, e.name.de, ...(e.aliases ?? [])].some((n) => n.toLowerCase().includes(s));
  });

  const setPref = (id: string, pref: ExercisePref) => {
    setPrefs((p) => ({ ...p, [id]: pref }));
    start(() => setExercisePref(id, pref));
  };

  const cap = (c: string) => (c === "dumbbells" ? t("kinds.dumbbell") : t(`equipment.${c}`));
  const equipmentLabel = (e: Exercise) => [...e.equipment.map(cap), ...(e.equipmentAnyOf ? [e.equipmentAnyOf.map(cap).join(" / ")] : [])].join(", ");
  const tone = (p?: ExercisePref) => (p === "favorite" || p === "like" ? "accent" : p === "exclude" || p === "pain" ? "danger" : p === "dislike" ? "warning" : "neutral");

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input type="search" placeholder={t("library.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("library.search")} />
        <Select value={pattern} onChange={(e) => setPattern(e.target.value as Pattern | "")} aria-label={t("library.pattern")} className="sm:w-60">
          <option value="">{t("library.all")}</option>
          {PATTERNS.map((p) => <option key={p} value={p}>{t(`patterns.${p}`)}</option>)}
        </Select>
        <Button variant="secondary" onClick={() => setCreating(true)} className="shrink-0"><Plus size={16} aria-hidden />{t("library.createCustom")}</Button>
      </div>

      <Card className="p-0 sm:p-0">
        <ul className="divide-y divide-border">
          {list.map((e) => {
            const isOpen = open === e.id;
            const pref = prefs[e.id];
            return (
              <li key={e.id}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{exName(e, locale)}</span>
                    <span className="block truncate text-xs text-muted">{e.primary.map((m) => t(`muscles.${m}`)).join(", ") || t(`patterns.${e.pattern}`)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {e.custom && <Badge>{t("library.custom")}</Badge>}
                    {pref && pref !== "neutral" && <Badge tone={tone(pref)}>{t(`library.pref.${pref}`)}</Badge>}
                    <ChevronDown size={16} className={cx("text-muted transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-3 px-4 pb-4 text-sm">
                    {(e.cue[locale] ?? e.cue.en ?? e.cue.pl) && <p>{e.cue[locale] ?? e.cue.en ?? e.cue.pl}</p>}
                    {e.safety && <Notice tone="warning">{t("library.safety")}: {e.safety[locale] ?? e.safety.en ?? e.safety.pl}</Notice>}
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted">
                      <dt>{t("library.equipment")}</dt>
                      <dd className="text-text">{equipmentLabel(e) || t("library.noEquipment")}</dd>
                      {e.secondary.length > 0 && <><dt>{t("library.secondary")}</dt><dd className="text-text">{e.secondary.map((m) => t(`muscles.${m}`)).join(", ")}</dd></>}
                      <dt>{t("library.difficulty")}</dt><dd className="text-text">{t(`library.difficultyLevel.${e.skill}`)}</dd>
                      <dt>{t("library.loading")}</dt><dd className="text-text">{t(`library.loadingKind.${e.loading}`)}</dd>
                    </dl>
                    <div role="radiogroup" aria-label={t("library.prefHint")} className="flex flex-wrap gap-1.5">
                      {PREFS.map((p) => {
                        const on = (pref ?? "neutral") === p;
                        return (
                          <button key={p} type="button" role="radio" aria-checked={on} disabled={pending} onClick={() => setPref(e.id, p)}
                            className={cx("min-h-9 rounded-full border px-3 text-sm", on ? "border-accent bg-accent text-accent-contrast" : "border-border hover:bg-surface-2")}>
                            {t(`library.pref.${p}`)}
                          </button>
                        );
                      })}
                    </div>
                    {pref === "pain" && <p className="text-xs text-muted">{t("plan.painCaution")}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Sheet open={creating} onClose={() => setCreating(false)} title={t("library.createCustom")}>
        <form
          className="space-y-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            start(async () => {
              const r = await createCustomExercise(draft);
              toast({ text: r.error ? t("common.error") : t("common.saved") });
              if (!r.error) {
                setCreating(false);
                setDraft({ name: "", pattern: "h_push", loading: "total" });
              }
            });
          }}
        >
          <Field label={t("nutrition.name")} htmlFor="cx-name"><Input id="cx-name" required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
          <Field label={t("library.pattern")} htmlFor="cx-pat">
            <Select id="cx-pat" value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value as Pattern })}>
              {PATTERNS.map((p) => <option key={p} value={p}>{t(`patterns.${p}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("library.loading")} htmlFor="cx-load">
            <Select id="cx-load" value={draft.loading} onChange={(e) => setDraft({ ...draft, loading: e.target.value as Loading })}>
              {LOADINGS.map((l) => <option key={l} value={l}>{t(`library.loadingKind.${l}`)}</option>)}
            </Select>
          </Field>
          <Button type="submit" full disabled={pending || !draft.name.trim()}>{t("common.save")}</Button>
        </form>
      </Sheet>
    </div>
  );
}
