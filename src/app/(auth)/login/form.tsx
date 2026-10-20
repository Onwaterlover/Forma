"use client";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";
import { useI18n } from "@/i18n/client";

export function LoginForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <Card>
      <h1 className="mb-5 text-xl font-semibold">{t("auth.login")}</h1>
      <form action={action} className="space-y-4">
        <Field label={t("auth.email")} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label={t("auth.password")} htmlFor="password" error={state?.error}>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" full disabled={pending}>{pending ? t("common.loading") : t("auth.login")}</Button>
      </form>
      <p className="mt-5 text-sm text-muted">
        {t("auth.noAccount")} <Link className="font-medium text-accent underline-offset-2 hover:underline" href="/register">{t("auth.register")}</Link>
      </p>
    </Card>
  );
}
