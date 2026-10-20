import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { I18nProvider } from "@/i18n/client";
import { currentUser } from "@/lib/auth";
import { guestLocale } from "@/lib/ctx";
import { translator } from "@/i18n";
import { LocaleSwitch } from "./locale-switch";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await currentUser()) redirect("/");
  const locale = await guestLocale();
  const t = translator(locale);
  return (
    <I18nProvider locale={locale}>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <LocaleSwitch />
        </div>
        <p className="mb-6 text-sm text-muted">{t("app.tagline")}</p>
        {children}
        <p className="mt-8 text-xs leading-relaxed text-muted">{t("auth.privacy")}</p>
      </main>
    </I18nProvider>
  );
}
