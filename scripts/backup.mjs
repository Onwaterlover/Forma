// Consistent online backup of the SQLite database (safe while the app is running).
// Usage: npm run backup            → backups/forma-YYYY-MM-DD-HHMM.db
//        BACKUP_KEEP=30 npm run backup   (keeps the newest N backups, default 30)
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = path.resolve(process.env.DATA_DIR ?? "./data");
const dbFile = path.join(dataDir, "forma.db");
const outDir = path.resolve(process.env.BACKUP_DIR ?? "./backups");
if (!fs.existsSync(dbFile)) {
  console.error(`No database at ${dbFile}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
const target = path.join(outDir, `forma-${stamp}.db`);
const db = new DatabaseSync(dbFile);
db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
db.close();

const keep = Number(process.env.BACKUP_KEEP ?? 30);
const old = fs.readdirSync(outDir).filter((f) => /^forma-.*\.db$/.test(f)).sort().reverse().slice(keep);
for (const f of old) fs.rmSync(path.join(outDir, f));
console.log(`Backup written: ${target}`);
