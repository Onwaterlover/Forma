// Full backup of all tables to a JSON file (works for Supabase and the local database).
// Usage: npm run backup            → backups/forma-YYYY-MM-DD-HHMM.json
//        BACKUP_KEEP=30 npm run backup   (keeps the newest N backups, default 30)
import fs from "node:fs";
import path from "node:path";
import { connect, encode, existingTables } from "./db-lib.mjs";

const outDir = path.resolve(process.env.BACKUP_DIR ?? "./backups");
fs.mkdirSync(outDir, { recursive: true });
const db = await connect();
const tables = {};
for (const t of await existingTables(db)) {
  tables[t] = (await db.query(`SELECT * FROM ${t}`)).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, encode(v)])));
}
await db.close();

const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
const target = path.join(outDir, `forma-${stamp}.json`);
fs.writeFileSync(target, JSON.stringify({ format: "forma-backup", version: 2, createdAt: new Date().toISOString(), tables }));

const keep = Number(process.env.BACKUP_KEEP ?? 30);
for (const f of fs.readdirSync(outDir).filter((f) => /^forma-.*\.json$/.test(f)).sort().reverse().slice(keep)) fs.rmSync(path.join(outDir, f));
console.log(`Backup written: ${target} (${Object.values(tables).reduce((a, r) => a + r.length, 0)} rows)`);
