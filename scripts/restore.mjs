// Restore a JSON backup, replacing ALL current data. Stop the app first when using the local database.
// Usage: npm run restore -- backups/forma-2026-10-20-1830.json
import fs from "node:fs";
import { connect, decode, existingTables, TABLES } from "./db-lib.mjs";

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error("Usage: npm run restore -- <path-to-backup.json>");
  process.exit(1);
}
const backup = JSON.parse(fs.readFileSync(src, "utf8"));
if (backup.format !== "forma-backup" || !backup.tables?.users) {
  console.error("Not a Forma backup file; nothing was changed.");
  process.exit(1);
}

const db = await connect();
const present = await existingTables(db);
if (!present.includes("users")) {
  console.error("Database schema not found. Start the app once against this database, then rerun.");
  process.exit(1);
}
await db.tx(async (q) => {
  for (const t of [...present].reverse()) await q.query(`DELETE FROM ${t}`);
  for (const t of TABLES.filter((x) => present.includes(x))) {
    for (const row of backup.tables[t] ?? []) {
      const cols = Object.keys(row);
      await q.query(`INSERT INTO ${t} (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((c) => decode(row[c])));
    }
  }
});
await db.close();
console.log(`Restored ${src} (${backup.tables.users.length} users).`);
