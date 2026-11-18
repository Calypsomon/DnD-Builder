// Creates a consistent copy of the database in data/backups (safe while the app is running).
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { CONFIG, ROOT } from "./db/client";
import { Database } from "./db/sqlite";

const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
const dir = resolve(ROOT, "data/backups");
mkdirSync(dir, { recursive: true });
const target = resolve(dir, `dndbuilder-${stamp}.db`);
const db = new Database(resolve(ROOT, CONFIG.dbPath));
await db.backup(target);
db.close();
console.log(`Backup written: ${target}`);
