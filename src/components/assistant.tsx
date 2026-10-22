"use client";
import { ArrowUp, Camera, Check, PenLine, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { applySuggestion, askAssistant, rejectSuggestion } from "@/app/actions/assistant";
import { updateSettings } from "@/app/actions/general";
import { Sheet } from "@/components/client";
import { Button, cx, inputClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import type { Proposal } from "@/lib/assistant";

type Card = Proposal & { state?: "busy" | "applied" | "rejected" | "failed"; error?: string };
type Msg = { role: "user" | "assistant"; text: string; proposals?: Card[]; error?: boolean; photo?: string };

/** Downscale a meal photo in the browser (also drops EXIF/GPS) so it stays small enough to send. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.75);
}

/**
 * Training: one "Assistant" button. Food: two tiles, "Take photo" and "Describe meal", sharing one chat.
 * Changes only happen when the user taps "Apply" on a proposal card.
 */
/** `review`: renders a "Rate my plan" button that opens the chat and asks for a review of the current plan. */
export function Assistant({ scope, date, enabled, provider, review }: { scope: "training" | "nutrition"; date: string; enabled: boolean; provider: "gemini" | "anthropic"; review?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(enabled);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"chat" | "photo">("chat");
  const fileRef = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // Scroll only the chat itself to the newest message. scrollIntoView would also move the page behind the
  // sheet on iPhones (the "jump up" when opening "Describe a meal").
  useEffect(() => {
    if (!msgs.length && !busy) return;
    const box = end.current?.closest<HTMLElement>(".overflow-y-auto");
    if (box) box.scrollTop = box.scrollHeight;
  }, [msgs, busy]);

  const err = (code: string) => {
    const s = t(`assistant.errors.${code}`);
    return s.startsWith("assistant.") ? t("assistant.errors.generic") : s;
  };

  // The model only sees text, so proposal cards are summarised into the history with their outcome.
  const asHistory = (m: Msg) => ({
    role: m.role,
    text: [m.photo ? `${t("assistant.photoSent")} ${m.text}` : m.text, ...(m.proposals ?? []).map((p) => `[${p.title}: ${p.lines.join("; ")} — ${p.state ?? "pending"}]`)].join("\n"),
  });

  const send = async (raw: string, shot?: string) => {
    const q = raw.trim() || (shot ? t("assistant.photoPrompt") : "");
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text: q, photo: shot }];
    setMsgs(next);
    setText("");
    if (box.current) box.current.style.height = "";
    setBusy(true);
    try {
      const r = await askAssistant({ scope, date, history: next.filter((m) => !m.error).slice(-20).map(asHistory), image: shot?.split(",")[1] });
      setMsgs((m) => [...m, "error" in r ? { role: "assistant", text: err(r.error), error: true } : { role: "assistant", text: r.reply, proposals: r.proposals }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: err("generic"), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const patch = (mi: number, pi: number, p: Partial<Card>) =>
    setMsgs((m) => m.map((x, i) => (i !== mi ? x : { ...x, proposals: x.proposals?.map((c, j) => (j === pi ? { ...c, ...p } : c)) })));

  const decide = async (mi: number, pi: number, apply: boolean) => {
    const card = msgs[mi]?.proposals?.[pi];
    if (!card || card.state) return;
    patch(mi, pi, { state: "busy" });
    try {
      if (!apply) {
        await rejectSuggestion(card.id);
        patch(mi, pi, { state: "rejected" });
        return;
      }
      const r = await applySuggestion(card.id);
      patch(mi, pi, r.error ? { state: "failed", error: err(r.error) } : { state: "applied" });
      if (!r.error) router.refresh();
    } catch {
      patch(mi, pi, { state: "failed", error: err("generic") });
    }
  };

  const examples = [1, 2, 3, 4].map((i) => t(`assistant.ex${scope === "training" ? "Training" : "Nutrition"}${i}`));
  const photoMode = scope === "nutrition" && mode === "photo";
  const title = scope === "training" ? t("assistant.title") : photoMode ? t("assistant.photo") : t("assistant.describe");
  const takePhoto = () => fileRef.current?.click();
  const placeholder = t(scope === "training" ? "assistant.placeholder" : photoMode ? "assistant.placeholderPhoto" : "assistant.placeholderFood");

  return (
    <>
      {review ? (
        <Button size="sm" className="shrink-0" onClick={() => { setOpen(true); if (on && !msgs.length) send(t("assistant.reviewPrompt")); }}><Sparkles size={16} aria-hidden />{t("assistant.reviewPlan")}</Button>
      ) : scope === "training" ? (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><Sparkles size={16} aria-hidden />{t("assistant.open")}</Button>
      ) : (
        <>
          {/* Opens the camera straight away; the picked photo is sent at once. */}
          <Button variant="secondary" size="tile" onClick={() => { setMode("photo"); if (on) takePhoto(); else setOpen(true); }}><Camera size={20} aria-hidden />{t("assistant.takePhotoShort")}</Button>
          <Button variant="secondary" size="tile" onClick={() => { setMode("chat"); setOpen(true); }}><PenLine size={20} aria-hidden />{t("assistant.describeShort")}</Button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              const shot = f ? await shrink(f).catch(() => null) : null;
              if (!shot) return;
              setMode("photo");
              setOpen(true);
              send("", shot);
            }} />
        </>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={title} wide full>
        {!on ? (
          <div className="space-y-4">
            <p className="font-medium">{t("assistant.consentTitle")}</p>
            <p className="text-sm text-muted">{t("settings.aiHint", { provider: provider === "gemini" ? "Google Gemini" : "Claude (Anthropic)" })}</p>
            {provider === "gemini" && <p className="text-sm text-muted">{t("settings.aiGeminiNote")}</p>}
            <Button full onClick={async () => { await updateSettings({ ai: true }); setOn(true); }}>{t("assistant.enable")}</Button>
          </div>
        ) : (
          <div className="flex min-h-[45dvh] flex-col max-sm:min-h-full">
            <div className="flex-1 space-y-3 pb-3" aria-live="polite">
              {msgs.length > 0 && !busy && (
                <button type="button" onClick={() => setMsgs([])} className="ml-auto block text-sm text-muted hover:text-text">{t("assistant.newChat")}</button>
              )}
              {msgs.length === 0 && photoMode && (
                <>
                  <p className="text-sm text-muted">{t("assistant.photoHint")}</p>
                  <Button full size="lg" onClick={takePhoto}><Camera size={20} aria-hidden />{t("assistant.takePhoto")}</Button>
                </>
              )}
              {msgs.length === 0 && !photoMode && (
                <>
                  <p className="text-sm text-muted">{t(scope === "training" ? "assistant.introTraining" : "assistant.introNutrition")}</p>
                  <div className="flex flex-wrap gap-2">
                    {examples.map((e) => (
                      <button key={e} type="button" onClick={() => send(e)} className="rounded-full border border-border px-3 py-1.5 text-left text-sm hover:bg-surface-2">{e}</button>
                    ))}
                  </div>
                </>
              )}
              {msgs.map((m, mi) => (
                <div key={mi} className={cx("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
                  {m.photo && <img src={m.photo} alt="" className="max-h-48 rounded-2xl object-cover" />}
                  <p className={cx(
                    "max-w-[90%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed",
                    m.role === "user" ? "bg-accent-soft" : "bg-surface-2",
                    m.error && "text-danger",
                  )}>{m.text}</p>
                  {m.proposals?.map((c, pi) => (
                    <div key={c.id} className="w-full max-w-[90%] rounded-2xl border border-accent/40 p-3.5">
                      <p className="text-sm font-semibold">{c.title}</p>
                      <ul className="mt-1 space-y-0.5 text-sm">{c.lines.map((l, k) => <li key={k}>{l}</li>)}</ul>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {c.state === "applied" ? <p className="inline-flex items-center gap-1 text-sm font-medium text-accent"><Check size={16} aria-hidden />{t("assistant.applied")}</p>
                          : c.state === "rejected" ? <p className="text-sm text-muted">{t("assistant.rejected")}</p>
                          : c.state === "failed" ? <p className="text-sm text-danger">{c.error}</p>
                          : (
                            <>
                              <Button size="sm" disabled={c.state === "busy"} onClick={() => decide(mi, pi, true)}>{t("assistant.apply")}</Button>
                              <Button size="sm" variant="ghost" disabled={c.state === "busy"} onClick={() => decide(mi, pi, false)}>{t("assistant.reject")}</Button>
                            </>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {busy && <p className="w-fit animate-pulse rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[15px] text-muted">{t("assistant.thinking")}</p>}
              <div ref={end} />
            </div>
            <form className="sticky bottom-0 -mx-5 -mb-4 flex items-end gap-2 border-t border-border bg-surface px-5 py-3" onSubmit={(e) => { e.preventDefault(); send(text); }}>
              {photoMode && msgs.length > 0 && (
                <Button type="button" variant="secondary" disabled={busy} onClick={takePhoto} aria-label={t("assistant.takePhoto")}><Camera size={18} aria-hidden /></Button>
              )}
              {/* Wraps and grows up to ~5 lines, so a longer message stays readable while typing. */}
              <textarea ref={box} value={text} rows={1} maxLength={4000} placeholder={placeholder} aria-label={placeholder}
                onChange={(e) => { setText(e.target.value); const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 132)}px`; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); send(text); } }}
                className={cx(inputClass, "h-auto min-h-11 resize-none py-2.5 leading-snug")} />
              <Button type="submit" disabled={busy || !text.trim()} aria-label={t("assistant.send")}><ArrowUp size={18} aria-hidden /></Button>
            </form>
          </div>
        )}
      </Sheet>
    </>
  );
}
