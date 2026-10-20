import { logoutAction } from "@/app/actions/auth";
import { PageHeader } from "@/components/ui";
import { pageCtx } from "@/lib/ctx";
import { listInvites, listUsers } from "@/lib/data";
import { SettingsForm } from "./form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, t, settings, locale } = await pageCtx();
  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={`${user.name} · ${user.email}`}
        action={<form action={logoutAction}><button className="h-9 rounded-xl bg-surface-2 px-3 text-sm font-medium hover:bg-border">{t("auth.logout")}</button></form>} />
      <SettingsForm
        settings={settings}
        locale={locale}
        isAdmin={user.is_admin === 1}
        users={user.is_admin ? (await listUsers()).map((u) => ({ name: u.name, created: u.created_at, admin: u.is_admin === 1 })) : []}
        invites={user.is_admin ? await listInvites() : []}
        aiConfigured={!!process.env.ANTHROPIC_API_KEY && process.env.AI_PROVIDER === "anthropic"}
      />
    </>
  );
}
