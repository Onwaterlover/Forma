// Development-only test account in a SEPARATE local database (never your real data or Supabase).
// Usage: DATA_DIR=./data-dev node scripts/dev-seed.mjs   (start the app once with the same DATA_DIR first)
// Test credentials (fake, for local testing only):
export const DEV_EMAIL = "tester@forma.test";
export const DEV_PASSWORD = "dev-only-password-123";

import crypto from "node:crypto";
import path from "node:path";
import { connect } from "./db-lib.mjs";

if (process.env.DATABASE_URL || !process.env.DATA_DIR || path.resolve(process.env.DATA_DIR) === path.resolve("./data")) {
  console.error("Refusing to seed: unset DATABASE_URL and set DATA_DIR to a separate dev directory, e.g. DATA_DIR=./data-dev");
  process.exit(1);
}
const db = await connect();
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(DEV_PASSWORD, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
await db.query("INSERT INTO users (id, email, name, password_hash, is_admin, locale, created_at) VALUES ($1, $2, 'Tester', $3, 1, 'pl', $4) ON CONFLICT DO NOTHING", [
  crypto.randomUUID(), DEV_EMAIL, `scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`, new Date().toISOString(),
]);
await db.close();
console.log("Dev user ready.");
