import { ToastProvider } from "@/components/client";
import { Logo } from "@/components/logo";
import { I18nProvider } from "@/i18n/client";
import { pageCtx } from "@/lib/ctx";
import { Nav } from "./nav";
import { SwRegister } from "./sw-register";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { locale, t, settings } = await pageCtx();
  const items = [
    { href: "/", label: t("nav.today"), icon: "today" as const },
    ...(settings.modules.training ? [{ href: "/training", label: t("nav.training"), icon: "training" as const }] : []),
    ...(settings.modules.nutrition ? [{ href: "/nutrition", label: t("nav.nutrition"), icon: "nutrition" as const }] : []),
    { href: "/progress", label: t("nav.progress"), icon: "progress" as const },
    { href: "/settings", label: t("nav.settings"), icon: "settings" as const },
  ];
  return (
    <I18nProvider locale={locale}>
      <ToastProvider>
        <div className="md:flex">
          <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border px-4 py-6 md:flex print:hidden">
            <Logo className="mb-8 px-2" />
            <Nav items={items} variant="side" />
          </aside>
          <main className="mx-auto w-full min-w-0 max-w-3xl px-4 pb-28 pt-5 sm:px-6 md:pb-12 md:pt-8 print:max-w-none print:p-0">{children}</main>
        </div>
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden print:hidden" aria-label="Main">
          <Nav items={items} variant="bottom" />
        </nav>
        <SwRegister />
      </ToastProvider>
    </I18nProvider>
  );
}
