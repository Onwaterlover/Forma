import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, newId, nowIso } from "./db";

const COOKIE = "forma_session";
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export interface User {
  id: string;
  email: string;
  name: string;
  is_admin: number;
  locale: "pl" | "en" | "de";
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, N, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const got = crypto.scryptSync(password, Buffer.from(salt, "base64"), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

async function secureCookie(): Promise<boolean> {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  const h = await headers();
  return h.get("x-forwarded-proto") === "https";
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db().prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(sha256(token), userId, expires.toISOString(), nowIso());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: await secureCookie(), path: "/", expires });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db().prepare("DELETE FROM sessions WHERE id = ?").run(sha256(token));
  jar.delete(COOKIE);
}

/** Current user, or null. Cached per request. */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.is_admin, u.locale, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    )
    .get(sha256(token)) as (User & { expires_at: string }) | undefined;
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    db().prepare("DELETE FROM sessions WHERE id = ?").run(sha256(token));
    return null;
  }
  const { expires_at: _e, ...user } = row;
  return user;
});

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

/** For route handlers: returns null instead of redirecting. */
export async function apiUser(): Promise<User | null> {
  return currentUser();
}

export function userCount(): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

export function createUser(email: string, name: string, password: string, isAdmin: boolean, locale = "pl"): string {
  const id = newId();
  db()
    .prepare("INSERT INTO users (id, email, name, password_hash, is_admin, locale, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, email.trim().toLowerCase(), name.trim(), hashPassword(password), isAdmin ? 1 : 0, locale, nowIso());
  return id;
}

// Simple in-memory throttle for login attempts (single-process server).
const attempts = new Map<string, { n: number; until: number }>();
export function throttle(key: string, max = 8, windowMs = 15 * 60_000): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.until < now) {
    attempts.set(key, { n: 1, until: now + windowMs });
    return true;
  }
  a.n++;
  return a.n <= max;
}

export function createInvite(createdBy: string | null, note: string | null, days = 14): string {
  // Short enough to type on a phone, long enough not to be guessable.
  const code = crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "x").slice(0, 12).toUpperCase();
  db()
    .prepare("INSERT INTO invites (code_hash, created_by, note, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(sha256(code), createdBy, note, nowIso(), new Date(Date.now() + days * 86_400_000).toISOString());
  return code;
}

export function consumeInvite(code: string, userId: string): boolean {
  const r = db()
    .prepare("UPDATE invites SET used_by = ?, used_at = ? WHERE code_hash = ? AND used_by IS NULL AND expires_at > ?")
    .run(userId, nowIso(), sha256(code.trim().toUpperCase()), nowIso());
  return r.changes === 1;
}

export function inviteValid(code: string): boolean {
  return !!db().prepare("SELECT 1 FROM invites WHERE code_hash = ? AND used_by IS NULL AND expires_at > ?").get(sha256(code.trim().toUpperCase()), nowIso());
}
