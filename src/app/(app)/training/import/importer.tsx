"use client";
import { Check, CircleHelp, FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveImportedPlan } from "@/app/actions/training";
import { useToast } from "@/components/client";
import { Button, Card, Input, Notice, Select, Textarea } from "@/components/ui";
import { EXERCISES } from "@/engine/exercises";
import { PATTERNS, type Exercise, type Pattern } from "@/engine/types";
import { exName } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { parseImport, type ImportDraft } from "@/import/parse";

type Row = { name: string; exerciseId: string | null; pattern: Pattern; sets: number; repMin: number; repMax: number; seconds?: number; confidence: number | null };

export function Importer({ custom }: { custom: Exercise[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const library = useMemo(() => [...EXERCISES, ...custom], [custom]);
  const sorted = useMemo(() => [...library].sort((a, b) => exName(a, locale).localeCompare(exName(b, locale))), [library, locale]);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<{ name: string; sessions: { name: string; rows: Row[] }[]; unparsed: string[] } | null>(null);
  const [pending, start] = useTransition();

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
          sets: e.sets, repMin: e.repMin, repMax: e.repMax, seconds: e.seconds,
        })),
      })),
    });
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
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-surface-2 px-4 text-[15px] font-medium hover:bg-border">
            <FileUp size={18} aria-hidden />{t("import.file")}
            <input type="file" accept=".txt,.csv,.tsv,text/plain,text/csv,application/pdf,image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        <p className="text-xs text-muted">{t("import.pdfNote")}</p>
      </Card>

      {draft && (
        <>
          <h2 className="text-lg font-semibold">{t("import.review")}</h2>
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
                      <span className="shrink-0 text-sm tabular-nums text-muted">{r.sets} × {r.seconds ? `${r.seconds}s` : r.repMin === r.repMax ? r.repMin : `${r.repMin}–${r.repMax}`}</span>
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
