"use client";
import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "@/app/actions/auth";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { useI18n } from "@/i18n/client";

export function RegisterForm({ first, invite }: { first: boolean; invite: string }) {
  const { t, locale } = useI18n();
  const [state, action, pending] = useActionState(registerAction, undefined);
  return (
    <Card>
      <h1 className="mb-4 text-xl font-semibold">{t("auth.register")}</h1>
      {first && <Notice tone="accent" className="mb-4">{t("auth.firstUser")}</Notice>}
      <form action={action} className="space-y-4">
        <input type="hidden" name="locale" value={locale} />
        {!first && (
          <Field label={t("auth.inviteCode")} htmlFor="invite">
            <Input id="invite" name="invite" defaultValue={invite} required autoCapitalize="characters" autoComplete="off" className="uppercase tracking-widest" />
          </Field>
        )}
        <Field label={t("auth.name")} htmlFor="name">
          <Input id="name" name="name" autoComplete="given-name" required maxLength={60} />
        </Field>
        <Field label={t("auth.email")} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label={t("auth.password")} htmlFor="password" hint={t("auth.passwordShort")} error={state?.error}>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </Field>
        <Button type="submit" full disabled={pending}>{pending ? t("common.loading") : t("auth.register")}</Button>
      </form>
      {!first && (
        <p className="mt-5 text-sm text-muted">
          {t("auth.haveAccount")} <Link className="font-medium text-accent hover:underline" href="/login">{t("auth.login")}</Link>
        </p>
      )}
    </Card>
  );
}
