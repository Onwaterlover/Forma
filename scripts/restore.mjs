// Restore a backup. STOP THE APP FIRST.
// Usage: npm run restore -- backups/forma-2026-10-20-1830.db
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error("Usage: npm run restore -- <path-to-backup.db>");
  process.exit(1);
}
// Sanity-check the backup before touching anything.
const check = new DatabaseSync(src, { readOnly: true });
const ok = check.prepare("PRAGMA integrity_check").get();
const users = check.prepare("SELECT COUNT(*) AS n FROM users").get();
check.close();
if (Object.values(ok)[0] !== "ok") {
  console.error("Backup failed integrity check; nothing was changed.");
  process.exit(1);
}

const dataDir = path.resolve(process.env.DATA_DIR ?? "./data");
const dbFile = path.join(dataDir, "forma.db");
fs.mkdirSync(dataDir, { recursive: true });
if (fs.existsSync(dbFile)) {
  const safety = `${dbFile}.before-restore-${Date.now()}`;
  fs.copyFileSync(dbFile, safety);
  console.log(`Current database kept as ${safety}`);
}
for (const ext of ["-wal", "-shm"]) fs.rmSync(dbFile + ext, { force: true });
fs.copyFileSync(src, dbFile);
console.log(`Restored ${src} → ${dbFile} (${users.n} users). Start the app again.`);
