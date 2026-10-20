// Create an invite code from the command line (useful if no admin can log in).
// Usage: npm run invite -- "for Anna"     (uses DATABASE_URL if set, else the local database)
import crypto from "node:crypto";
import { connect } from "./db-lib.mjs";

const db = await connect();
const code = crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "x").slice(0, 12).toUpperCase();
const now = new Date();
await db.query("INSERT INTO invites (code_hash, created_by, note, created_at, expires_at) VALUES ($1, NULL, $2, $3, $4)", [
  crypto.createHash("sha256").update(code).digest("hex"),
  process.argv[2] ?? null,
  now.toISOString(),
  new Date(now.getTime() + 14 * 86_400_000).toISOString(),
]);
await db.close();
console.log(`Invite code (valid 14 days, single use): ${code}`);
