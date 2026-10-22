"use client";
import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteAccount, makeInvite, removeInvite, updateLocale, updatePassword, updateSettings } from "@/app/actions/general";
import { Choices, Switch, useToast } from "@/components/client";
import { Button, Card, Field, Input, Notice, SectionTitle } from "@/components/ui";
import { fmtDate, LOCALES, type Locale } from "@/i18n";
import { useI18n } from "@/i18n/client";
import type { Settings } from "@/lib/data";

const LANG_NAMES: Record<Locale, string> = { pl: "Polski", en: "English", de: "Deutsch" };
export const PROVIDER_NAME = { gemini: "Google Gemini", anthropic: "Claude (Anthropic)" } as const;

export function SettingsForm({
  settings, locale, isAdmin, users, invites: initialInvites, aiProvider,
}: {
  settings: Settings;
  locale: Locale;
  isAdmin: boolean;
  users: { name: string; created: string; admin: boolean }[];
  invites: { note: string | null; created_at: string; expires_at: string; used_at: string | null }[];
  aiProvider: "gemini" | "anthropic" | null;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [inviteNote, setInviteNote] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [invites, setInvites] = useState(initialInvites);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [confirmWord, setConfirmWord] = useState("");

  const set = (patch: Partial<Settings>) => start(async () => { await updateSettings(patch); router.refresh(); });
  const theme = (v: Settings["theme"]) => {
    if (v === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", v);
    set({ theme: v });
  };

  return (
    <div className="space-y-2">
      {/* Four groups instead of nine: look & language, training & food, assistant, account (folded). */}
      <SectionTitle>{t("settings.appearance")}</SectionTitle>
      <Card className="space-y-3">
        <div><p className="mb-2 text-sm font-medium">{t("settings.language")}</p><Choices name={t("settings.language")} columns={3} value={locale} onChange={(l) => start(async () => { await updateLocale(l); router.refresh(); })} options={LOCALES.map((l) => ({ value: l, label: LANG_NAMES[l] }))} /></div>
        <div><p className="mb-2 text-sm font-medium">{t("settings.theme")}</p><Choices name={t("settings.theme")} columns={3} value={settings.theme} onChange={theme} options={(["system", "light", "dark"] as const).map((v) => ({ value: v, label: t(`settings.themeOpt.${v}`) }))} /></div>
      </Card>

      <SectionTitle>{t("settings.trainingFood")}</SectionTitle>
      <Card className="space-y-3">
        <div className="divide-y divide-border">
        <Switch checked={settings.modules.training} label={t("settings.training")} onChange={(v) => set({ modules: { ...settings.modules, training: v } })} />
        <Switch checked={settings.modules.nutrition} label={t("settings.nutrition")} onChange={(v) => set({ modules: { ...settings.modules, nutrition: v } })} />
        </div>
        {settings.modules.training && (
          <div className="space-y-3 border-t border-border pt-3">
        <Switch checked={settings.logWorkouts} label={t("settings.logWorkouts")} hint={t("settings.logWorkoutsHint")} onChange={(v) => set({ logWorkouts: v })} />
        <div>
          <p className="mb-2 text-sm font-medium">{t("settings.logging")}</p>
          <Choices name={t("settings.logging")} columns={2} value={settings.logMode} onChange={(logMode) => set({ logMode })}
            options={[{ value: "simple", label: t("workout.simple"), hint: t("workout.simpleHint") }, { value: "detailed", label: t("workout.detailed"), hint: t("workout.detailedHint") }]} />
        </div>
        <div className="divide-y divide-border">
          <Switch checked={settings.restTimer} label={t("settings.restTimer")} onChange={(restTimer) => set({ restTimer })} />
          {settings.restTimer && <Switch checked={settings.autoTimer} label={t("settings.autoTimer")} onChange={(autoTimer) => set({ autoTimer })} />}
          <Switch checked={settings.showEffort} label={t("settings.effort")} onChange={(showEffort) => set({ showEffort })} />
          <Switch checked={settings.showFiber} label={t("settings.fiber")} onChange={(showFiber) => set({ showFiber })} />
        </div>
          </div>
        )}
      </Card>

      <SectionTitle>{t("settings.ai")}</SectionTitle>
      <Card className={aiProvider ? "py-1 sm:py-1" : undefined}>
        {aiProvider
          ? <Switch checked={settings.ai} label={t("settings.aiSwitch")} hint={`${t("settings.aiHint", { provider: PROVIDER_NAME[aiProvider] })}${aiProvider === "gemini" ? ` ${t("settings.aiGeminiNote")}` : ""}`} onChange={(v) => set({ ai: v })} />
          : <p className="text-sm text-muted">{t("settings.aiNotConfigured")}</p>}
      </Card>

      <details className="mt-6 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <summary className="cursor-pointer list-none font-semibold">{t("settings.account")}</summary>
        <div className="mt-2 space-y-2">
      {isAdmin && (
        <>
          <SectionTitle>{t("settings.invites")}</SectionTitle>
          <Card className="space-y-3">
            <p className="text-sm text-muted">{t("settings.inviteHint")}</p>
            {/* Wraps on narrow phones so the "for whom" field stays readable next to the long button label. */}
            <div className="flex flex-wrap gap-2">
              <Input className="min-w-0 flex-1 basis-44" placeholder={t("settings.inviteNote")} value={inviteNote} maxLength={60} onChange={(e) => setInviteNote(e.target.value)} aria-label={t("settings.inviteNote")} />
              <Button className="grow" disabled={pending} onClick={() => start(async () => { const r = await makeInvite(inviteNote); setCode(r.code ?? null); if (r.invites) setInvites(r.invites); setInviteNote(""); })}>{t("settings.createInvite")}</Button>
            </div>
            {code && (
              <Notice tone="accent" className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-lg tracking-widest">{t("settings.inviteShown", { code })}</p>
                <Button size="sm" variant="secondary" className="shrink-0" onClick={() => {
                  navigator.clipboard?.writeText(code).then(() => toast({ text: t("settings.copied") }), () => {});
                }}>{t("settings.copy")}</Button>
              </Notice>
            )}
            {invites.length > 0 && (
              <ul className="space-y-1 text-sm text-muted">
                {invites.map((i, k) => (
                  <li key={k} className="flex min-h-9 items-center justify-between gap-2">
                    <span className="min-w-0">{i.note ?? "—"} · {i.used_at ? `${t("settings.used")} ${fmtDate(locale, i.used_at)}` : `${t("settings.expires")} ${fmtDate(locale, i.expires_at)}`}</span>
                    {!i.used_at && (
                      <Button size="sm" variant="ghost" className="shrink-0 text-danger!" disabled={pending}
                        onClick={() => confirm(t("settings.deleteInviteConfirm")) && start(async () => { const list = await removeInvite(i.created_at); if (list) setInvites(list); })}>
                        {t("common.delete")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="pt-2 text-sm font-medium">{t("settings.users")}</p>
            <ul className="text-sm text-muted">{users.map((u, k) => <li key={k}>{u.name}{u.admin ? " (admin)" : ""} · {fmtDate(locale, u.created)}</li>)}</ul>
          </Card>
        </>
      )}

      <SectionTitle>{t("settings.password")}</SectionTitle>
      <Card>
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await updatePassword(pw.current, pw.next);
            if (r?.error) toast({ text: r.error === "wrong" ? t("settings.wrongPassword") : t("auth.passwordShort") });
          });
        }}>
          <Field label={t("settings.currentPassword")} htmlFor="pw-c"><Input id="pw-c" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
          <Field label={t("settings.newPassword")} htmlFor="pw-n"><Input id="pw-n" type="password" autoComplete="new-password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
          <Button type="submit" variant="secondary" disabled={pending}>{t("common.save")}</Button>
        </form>
      </Card>

      <SectionTitle>{t("settings.data")}</SectionTitle>
      <Card className="space-y-4">
        <a href="/api/export" className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface-2 px-4 font-medium hover:bg-border" download><Download size={18} aria-hidden />{t("settings.export")}</a>
        <div className="space-y-2 border-t border-border pt-4">
          <p className="font-medium text-danger">{t("settings.deleteAccount")}</p>
          <p className="text-sm text-muted">{t("settings.deleteHint")}</p>
          <div className="flex gap-2">
            <Input placeholder={t("settings.deleteConfirm")} value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)} aria-label={t("settings.deleteConfirm")} />
            <Button variant="danger" className="shrink-0" disabled={pending || confirmWord.trim() !== t("settings.deleteWord")}
              onClick={() => start(async () => { await deleteAccount(confirmWord, t("settings.deleteWord")); })}>{t("common.delete")}</Button>
          </div>
        </div>
      </Card>

      <SectionTitle>{t("settings.about")}</SectionTitle>
      <Card><p className="text-sm leading-relaxed text-muted">{t("settings.disclaimer")}</p><p className="mt-2 text-xs text-muted">{t("nutrition.offAttribution")}</p></Card>
        </div>
      </details>
    </div>
  );
}
