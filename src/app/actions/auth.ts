"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocale, translator } from "@/i18n";
import { consumeInvite, createSession, createUser, destroySession, inviteValid, throttle, userCount, verifyPassword } from "@/lib/auth";
import { guestLocale } from "@/lib/ctx";
import { db, transaction } from "@/lib/db";

export type FormState = { error?: string } | undefined;

async function clientKey() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const t = translator(await guestLocale());
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!throttle(`login:${await clientKey()}:${email}`)) return { error: t("auth.throttled") };
  const row = db().prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email) as { id: string; password_hash: string } | undefined;
  // Verify even when the user doesn't exist so timing doesn't reveal which emails are registered.
  const ok = verifyPassword(password, row?.password_hash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
  if (!row || !ok) return { error: t("auth.invalid") };
  await createSession(row.id);
  redirect("/");
}

const registerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.email().max(200),
  password: z.string().min(10).max(200),
  invite: z.string().trim().max(40).optional(),
  locale: z.string().optional(),
});

export async function registerAction(_: FormState, form: FormData): Promise<FormState> {
  const t = translator(await guestLocale());
  if (!throttle(`register:${await clientKey()}`, 10)) return { error: t("auth.throttled") };
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const pw = parsed.error.issues.some((i) => i.path[0] === "password");
    return { error: pw ? t("auth.passwordShort") : t("common.error") };
  }
  const { name, email, password, invite } = parsed.data;
  const locale = isLocale(parsed.data.locale) ? parsed.data.locale : await guestLocale();

  let userId: string;
  try {
    userId = transaction(() => {
      const first = userCount() === 0;
      if (!first && (!invite || !inviteValid(invite))) throw new Error("invite");
      const id = createUser(email, name, password, first, locale);
      if (!first && !consumeInvite(invite!, id)) throw new Error("invite");
      return id;
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "invite") return { error: t("auth.inviteInvalid") };
    if (/UNIQUE/.test(msg)) return { error: t("auth.emailTaken") };
    throw e;
  }
  await createSession(userId);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
