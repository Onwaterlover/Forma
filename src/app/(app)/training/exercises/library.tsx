"use client";
import { ChevronDown, Plus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { createCustomExercise, setExercisePref } from "@/app/actions/training";
import { Sheet, useToast } from "@/components/client";
import { HowTo } from "@/components/how-to";
import { Badge, Button, Card, cx, Field, Input, Notice, Select } from "@/components/ui";
import { EXERCISES } from "@/engine/exercises";
import { PATTERN_MUSCLES } from "@/engine/templates";
import { PATTERNS, type Exercise, type ExercisePref, type Loading, type Muscle, type Pattern } from "@/engine/types";
import { exName } from "@/i18n";
import { useI18n } from "@/i18n/client";

const PREFS: ExercisePref[] = ["favorite", "like", "neutral", "dislike", "exclude", "pain"];
const LOADINGS: Loading[] = ["total", "per_dumbbell", "per_side", "bodyweight", "bodyweight_plus", "assisted", "time"];

const EQUIP_GROUPS = ["machines", "cables", "free", "bodyweight", "bands", "cardio"] as const;
type EquipGroup = (typeof EQUIP_GROUPS)[number];
const equipGroupOf = (e: Exercise): EquipGroup =>
  e.kind === "machine" || e.kind === "smith" ? "machines"
  : e.kind === "cable" ? "cables"
  : e.kind === "bodyweight" ? "bodyweight"
  : e.kind === "band" ? "bands"
  : e.kind === "cardio" ? "cardio"
  : "free";

const REGIONS = ["chest", "back", "shoulders", "arms", "legs", "glutes", "core", "conditioning"] as const;
type Region = (typeof REGIONS)[number];
const REGION_MUSCLES: Record<Exclude<Region, "conditioning">, Muscle[]> = {
  chest: ["chest"], back: ["lats", "upper_back", "lower_back"], shoulders: ["front_delts", "side_delts", "rear_delts"],
  arms: ["biceps", "triceps", "forearms"], legs: ["quads", "hamstrings", "calves"], glutes: ["glutes"], core: ["abs"],
};
const regionsOf = (e: Exercise): Region[] =>
  e.pattern === "conditioning"
    ? ["conditioning"]
    : (Object.keys(REGION_MUSCLES) as Exclude<Region, "conditioning">[]).filter((r) => e.primary.some((m) => REGION_MUSCLES[r].includes(m)));

// Upper body push -> pull -> arms, then lower body, then core and conditioning.
const PATTERN_ORDER: Pattern[] = [
  "h_push", "chest_fly", "v_push", "lateral_raise", "rear_delt", "h_pull", "v_pull", "elbow_flex", "elbow_ext",
  "squat", "single_leg", "knee_ext", "hinge", "knee_flex", "hip_ext", "calf", "core", "conditioning",
];

function FilterRow<V extends string>({ label, value, onChange, options, allLabel }: {
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

export function Library({ prefs: initialPrefs, custom }: { prefs: Record<string, ExercisePref>; custom: Exercise[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [prefs, setPrefs] = useState(initialPrefs);
  const [q, setQ] = useState("");
  const [equip, setEquip] = useState<EquipGroup | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ name: string; pattern: Pattern; loading: Loading }>({ name: "", pattern: "h_push", loading: "total" });
  const [pending, start] = useTransition();
  const all = useMemo(() => [...custom, ...EXERCISES], [custom]);

  const list = all.filter((e) => {
    if (equip && equipGroupOf(e) !== equip) return false;
    if (region && !regionsOf(e).includes(region)) return false;
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return [e.name.pl, e.name.en, e.name.de, ...(e.aliases ?? [])].some((n) => n.toLowerCase().includes(s));
  });

  // Equipment group -> movement (with its main muscles) -> exercises, in a fixed, logical order.
  const tree = EQUIP_GROUPS.map((g) => ({
    g,
    patterns: PATTERN_ORDER.map((pt) => ({ pt, items: list.filter((e) => equipGroupOf(e) === g && e.pattern === pt) })).filter((x) => x.items.length),
  })).filter((x) => x.patterns.length);
  // Searching or filtering shows everything matching; browsing starts collapsed.
  const filtering = !!q.trim() || !!equip || !!region;
  const isGroupOpen = (k: string) => filtering || openGroups.has(k);
  const toggleGroup = (k: string) =>
    setOpenGroups((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const groupLabel = (pt: Pattern) => {
    const m = PATTERN_MUSCLES[pt].map((x) => t(`muscles.${x}`)).join(", ");
    return m ? `${t(`library.group.${pt}`)} · ${m}` : t(`library.group.${pt}`);
  };

  const setPref = (id: string, pref: ExercisePref) => {
    setPrefs((p) => ({ ...p, [id]: pref }));
    start(() => setExercisePref(id, pref));
  };

  const cap = (c: string) => (c === "dumbbells" ? t("kinds.dumbbell") : t(`equipment.${c}`));
  const equipmentLabel = (e: Exercise) => [...e.equipment.map(cap), ...(e.equipmentAnyOf ? [e.equipmentAnyOf.map(cap).join(" / ")] : [])].join(", ");
  const tone = (p?: ExercisePref) => (p === "favorite" || p === "like" ? "accent" : p === "exclude" || p === "pain" ? "danger" : p === "dislike" ? "warning" : "neutral");

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input type="search" placeholder={t("library.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("library.search")} />
        <Button variant="secondary" onClick={() => setCreating(true)} className="shrink-0" aria-label={t("library.createCustom")}><Plus size={16} aria-hidden /><span className="hidden sm:inline">{t("library.createCustom")}</span></Button>
      </div>
      <FilterRow label={t("library.equipFilter")} value={equip} onChange={setEquip} options={EQUIP_GROUPS.map((g) => ({ value: g, label: t(`library.equip.${g}`) }))} allLabel={t("library.all")} />
      <FilterRow label={t("library.regionFilter")} value={region} onChange={setRegion} options={REGIONS.map((r) => ({ value: r, label: t(`library.region.${r}`) }))} allLabel={t("library.all")} />

      {!filtering && (
        <div className="flex justify-end">
          <button type="button" className="text-sm font-medium text-accent" onClick={() => setOpenGroups(openGroups.size ? new Set() : new Set(EQUIP_GROUPS))}>
            {openGroups.size ? t("library.collapseAll") : t("library.expandAll")}
          </button>
        </div>
      )}

      {tree.length === 0 && <p className="py-6 text-center text-sm text-muted">{t("nutrition.noResults")}</p>}
      {tree.map(({ g, patterns }) => {
        const gOpen = isGroupOpen(g);
        const count = patterns.reduce((acc, x) => acc + x.items.length, 0);
        return (
          <Card key={g} className="overflow-hidden !p-0">
            <button type="button" aria-expanded={gOpen} onClick={() => toggleGroup(g)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
              <span className="text-base font-semibold">{t(`library.equip.${g}`)}</span>
              <span className="flex items-center gap-2 text-sm text-muted">{t("library.count", { n: count })}<ChevronDown size={18} className={cx("transition-transform", gOpen && "rotate-180")} aria-hidden /></span>
            </button>
            {gOpen && patterns.map(({ pt, items }) => (
              <section key={pt} className="border-t border-border">
                <h3 className="bg-surface-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{groupLabel(pt)}</h3>
                <ul className="divide-y divide-border">
                  {items.map((e) => {
                    const isOpen = open === e.id;
                    const pref = prefs[e.id];
                    return (
                      <li key={e.id}>
                        <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2">
                          <span className="min-w-0">
                            <span className="block font-medium">{exName(e, locale)}</span>
                            <span className="block truncate text-xs text-muted">{equipmentLabel(e) || t("library.noEquipment")} · {t(`library.difficultyLevel.${e.skill}`)}</span>
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
                              <dt>{t("library.primary")}</dt><dd className="text-text">{e.primary.map((m) => t(`muscles.${m}`)).join(", ") || "—"}</dd>
                              {e.secondary.length > 0 && <><dt>{t("library.secondary")}</dt><dd className="text-text">{e.secondary.map((m) => t(`muscles.${m}`)).join(", ")}</dd></>}
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
                            <HowTo exercise={e} compact />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </Card>
        );
      })}

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
