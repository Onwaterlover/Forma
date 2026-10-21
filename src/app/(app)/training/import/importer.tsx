"use client";
import { Check, CircleHelp, FileUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { saveImportedPlan } from "@/app/actions/training";
import { useToast } from "@/components/client";
import { Button, Card, Input, Notice, Select, Textarea } from "@/components/ui";
import { EXERCISES } from "@/engine/exercises";
import { PATTERNS, type Exercise, type Pattern } from "@/engine/types";
import { exName } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { parseImport, type ImportDraft } from "@/import/parse";

type Row = { name: string; exerciseId: string | null; pattern: Pattern; sets: number; repMin: number; repMax: number; seconds?: number; confidence: number | null; noSets?: boolean };

export function Importer({ custom }: { custom: Exercise[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const library = useMemo(() => [...EXERCISES, ...custom], [custom]);
  const sorted = useMemo(() => [...library].sort((a, b) => exName(a, locale).localeCompare(exName(b, locale))), [library, locale]);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<{ name: string; sessions: { name: string; rows: Row[] }[]; unparsed: string[] } | null>(null);
  const [pending, start] = useTransition();
  const result = useRef<HTMLHeadingElement>(null);

  const parse = (input = text) => {
    const d: ImportDraft = parseImport(input, library);
    setDraft({
      name: t("import.importedName"),
      unparsed: d.unparsed,
      sessions: d.sessions.map((s) => ({
        name: s.name,
        rows: s.exercises.map((e) => ({
          name: e.name, exerciseId: e.match?.exerciseId ?? null, confidence: e.match?.confidence ?? null,
          pattern: (e.match ? library.find((x) => x.id === e.match!.exerciseId)?.pattern : e.guessedPattern) ?? "core",
          sets: e.sets, repMin: e.repMin, repMax: e.repMax, seconds: e.seconds, noSets: e.noSets,
        })),
      })),
    });
    // The result renders below the text box, often off-screen on a phone: confirm and bring it into view.
    const n = d.sessions.reduce((a, s) => a + s.exercises.length, 0);
    toast({ text: n ? t("import.found", { n }) : t("import.nothing") });
    requestAnimationFrame(() => { result.current?.scrollIntoView({ behavior: "smooth", block: "start" }); });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.(txt|csv|tsv)$/i.test(f.name) && !f.type.startsWith("text/")) {
      toast({ text: t("import.pdfNote") });
      return;
    }
    const content = (await f.text()).slice(0, 100_000);
    setText(content);
    parse(content);
  };

  const setRow = (si: number, ri: number, patch: Partial<Row>) =>
    setDraft((d) => d && { ...d, sessions: d.sessions.map((s, i) => (i !== si ? s : { ...s, rows: s.rows.map((r, j) => (j === ri ? { ...r, ...patch } : r)) })) });
  const removeRow = (si: number, ri: number) =>
    setDraft((d) => d && { ...d, sessions: d.sessions.map((s, i) => (i !== si ? s : { ...s, rows: s.rows.filter((_, j) => j !== ri) })) });
  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || min)));

  const save = (then: "none" | "analyze" | "optimize") =>
    start(async () => {
      if (!draft) return;
      const r = await saveImportedPlan({
        name: draft.name,
        sessions: draft.sessions.filter((s) => s.rows.length).map((s) => ({
          name: s.name,
          exercises: s.rows.map((r) => ({ name: r.name, exerciseId: r.exerciseId, pattern: r.pattern, sets: r.sets, repMin: r.repMin, repMax: r.repMax, ...(r.seconds ? { seconds: r.seconds } : {}) })),
        })),
      });
      if (r.error || !r.id) return toast({ text: t("common.error") });
      router.push(`/training/plan/${r.id}${then === "none" ? "" : `?then=${then}`}`);
    });

  const total = draft?.sessions.reduce((a, s) => a + s.rows.length, 0) ?? 0;

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <Textarea aria-label={t("import.title")} rows={10} placeholder={t("import.placeholder")} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => parse()} disabled={!text.trim()}>{t("import.parse")}</Button>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-surface-2 px-4 text-[15px] font-medium transition-transform hover:bg-border active:scale-[0.97]">
            <FileUp size={18} aria-hidden />{t("import.file")}
            <input type="file" accept=".txt,.csv,.tsv,text/plain,text/csv,application/pdf,image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        <p className="text-xs text-muted">{t("import.pdfNote")}</p>
      </Card>

      {draft && (
        <>
          <h2 ref={result} className="scroll-mt-4 text-lg font-semibold">{t("import.review")}</h2>
          {total === 0 && <Notice tone="warning">{t("import.nothing")}</Notice>}
          {total > 0 && <Input aria-label={t("plan.rename")} value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="font-semibold" />}
          {draft.sessions.map((s, si) => (
            <Card key={si} className="space-y-3">
              <Input aria-label={t("plan.sessionName")} value={s.name} maxLength={60} className="font-medium"
                onChange={(e) => setDraft({ ...draft, sessions: draft.sessions.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)) })} />
              <ul className="divide-y divide-border">
                {s.rows.map((r, ri) => (
                  <li key={ri} className="space-y-2 py-3">
                    <div className="flex items-start gap-2">
                      {r.exerciseId ? <Check size={18} className="mt-0.5 shrink-0 text-accent" aria-label={t("import.matched")} /> : <CircleHelp size={18} className="mt-0.5 shrink-0 text-warning" aria-label={t("import.unmatched")} />}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{r.name}</p>
                        <p className="text-xs text-muted">{r.exerciseId ? `${t("import.matched")}: ${exName(library.find((x) => x.id === r.exerciseId), locale)}` : t("import.unmatched")}</p>
                      </div>
                      <button type="button" onClick={() => removeRow(si, ri)} aria-label={t("plan.remove")} className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 active:bg-border"><X size={16} aria-hidden /></button>
                    </div>
                    {r.noSets && <p className="text-xs text-warning">{t("import.noSets")}</p>}
                    {/* Sets and reps stay editable: notebook plans often have none, or they were "in the head". */}
                    <div className="flex items-center gap-2 text-sm">
                      <Input type="number" inputMode="numeric" min={1} max={12} aria-label={t("plan.sets")} value={r.sets} className="h-9 w-16 text-center"
                        onChange={(e) => setRow(si, ri, { sets: num(e.target.value, 1, 12), noSets: false })} />
                      <span className="text-muted">×</span>
                      {r.seconds ? (
                        <><Input type="number" inputMode="numeric" min={5} max={600} aria-label={t("plan.seconds")} value={r.seconds} className="h-9 w-20 text-center"
                          onChange={(e) => setRow(si, ri, { seconds: num(e.target.value, 5, 600), noSets: false })} /><span className="text-muted">{t("plan.seconds")}</span></>
                      ) : (
                        <><Input type="number" inputMode="numeric" min={1} max={100} aria-label={t("plan.reps")} value={r.repMin} className="h-9 w-16 text-center"
                          onChange={(e) => { const v = num(e.target.value, 1, 100); setRow(si, ri, { repMin: v, repMax: Math.max(v, r.repMax), noSets: false }); }} />
                        <span className="text-muted">–</span>
                        <Input type="number" inputMode="numeric" min={1} max={100} aria-label={t("plan.reps")} value={r.repMax} className="h-9 w-16 text-center"
                          onChange={(e) => { const v = num(e.target.value, 1, 100); setRow(si, ri, { repMax: v, repMin: Math.min(v, r.repMin), noSets: false }); }} />
                        <span className="text-muted">{t("plan.reps")}</span></>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select aria-label={t("import.chooseMatch")} value={r.exerciseId ?? ""}
                        onChange={(e) => {
                          const id = e.target.value || null;
                          setRow(si, ri, { exerciseId: id, pattern: id ? library.find((x) => x.id === id)!.pattern : r.pattern });
                        }}>
                        <option value="">— {t("library.custom")} —</option>
                        {sorted.map((x) => <option key={x.id} value={x.id}>{exName(x, locale)}</option>)}
                      </Select>
                      {!r.exerciseId && (
                        <Select aria-label={t("import.pattern")} value={r.pattern} onChange={(e) => setRow(si, ri, { pattern: e.target.value as Pattern })}>
                          {PATTERNS.map((p) => <option key={p} value={p}>{t(`patterns.${p}`)}</option>)}
                        </Select>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {draft.unparsed.length > 0 && (
            <Notice>
              <p className="mb-1 font-medium">{t("import.unparsed")}</p>
              <ul className="list-disc pl-5 font-mono text-xs">{draft.unparsed.slice(0, 30).map((l, i) => <li key={i}>{l}</li>)}</ul>
            </Notice>
          )}
          {total > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save("none")} disabled={pending}>{t("import.saveAsIs")}</Button>
              <Button variant="secondary" onClick={() => save("analyze")} disabled={pending}>{t("import.analyze")}</Button>
              <Button variant="secondary" onClick={() => save("optimize")} disabled={pending}>{t("import.optimize")}</Button>
            </div>
          )}
          {total > 0 && <p className="text-xs text-muted">{t("import.optimizeNote")}</p>}
        </>
      )}
    </div>
  );
}
