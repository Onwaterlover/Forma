// Create an invite code from the command line (useful if no admin can log in).
// Usage: npm run invite -- "for Anna"
import crypto from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(path.join(path.resolve(process.env.DATA_DIR ?? "./data"), "forma.db"));
const code = crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "x").slice(0, 12).toUpperCase();
const now = new Date();
db.prepare("INSERT INTO invites (code_hash, created_by, note, created_at, expires_at) VALUES (?, NULL, ?, ?, ?)").run(
  crypto.createHash("sha256").update(code).digest("hex"),
  process.argv[2] ?? null,
  now.toISOString(),
  new Date(now.getTime() + 14 * 86_400_000).toISOString(),
);
console.log(`Invite code (valid 14 days, single use): ${code}`);
