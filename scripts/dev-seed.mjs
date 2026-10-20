// Development-only test account in a SEPARATE database (never your real ./data).
// Usage: DATA_DIR=./data-dev node scripts/dev-seed.mjs
// Test credentials (fake, for local testing only):
export const DEV_EMAIL = "tester@forma.test";
export const DEV_PASSWORD = "dev-only-password-123";

import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const dir = path.resolve(process.env.DATA_DIR ?? "");
if (!process.env.DATA_DIR || dir === path.resolve("./data")) {
  console.error("Refusing to seed: set DATA_DIR to a separate dev directory, e.g. DATA_DIR=./data-dev");
  process.exit(1);
}
const file = path.join(dir, "forma.db");
if (!fs.existsSync(file)) {
  console.error(`Start the app once with DATA_DIR=${process.env.DATA_DIR} so the schema exists, then rerun.`);
  process.exit(1);
}
const db = new DatabaseSync(file);
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(DEV_PASSWORD, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
db.prepare("INSERT OR IGNORE INTO users (id, email, name, password_hash, is_admin, locale, created_at) VALUES (?, ?, ?, ?, 1, 'pl', ?)").run(
  crypto.randomUUID(), DEV_EMAIL, "Tester", `scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`, new Date().toISOString(),
);
console.log(`Dev user ready in ${file}`);
