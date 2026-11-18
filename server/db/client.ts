import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContentRow, ContentTable, ImportBundle } from "../../shared/types/content";
import { CONTENT_TABLES, emptyBundle } from "../../shared/types/content";
import { EXTRA_COLUMNS, MIGRATIONS, TABLE_NAMES } from "./schema";
import { Database } from "./sqlite";

/** Project root = nearest folder above this file that contains config.json (works for sources and the dist bundle) */
function findRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "config.json"))) return dir;
    dir = resolve(dir, "..");
  }
  return process.cwd();
}
export const ROOT = findRoot();
export const CONFIG = JSON.parse(readFileSync(resolve(ROOT, "config.json"), "utf8")) as {
  port: number;
  dbPath: string;
  import: { baseUrl: string; requestsPerSecond: number; cacheDir: string };
};

export type DB = Database;

export function openDb(path = resolve(ROOT, CONFIG.dbPath)): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function migrate(db: DB) {
  const version = db.pragma("user_version", { simple: true }) as number;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}

export function now() {
  return new Date().toISOString();
}

/** Convert a DB row to a ContentRow */
export function rowToContent(r: any): ContentRow<any> {
  return {
    id: r.id,
    name: r.name,
    source: r.source,
    sourceKind: r.source_kind,
    origin: r.origin,
    description: r.description,
    data: JSON.parse(r.data),
    effects: JSON.parse(r.effects),
    choices: JSON.parse(r.choices),
    stale: !!r.stale,
  };
}

/** Insert or replace one content row */
export function upsertContent(db: DB, table: ContentTable, row: ContentRow<any>) {
  const extras = EXTRA_COLUMNS[table];
  const cols = [
    "id",
    "name",
    "source",
    "source_kind",
    "origin",
    "description",
    "data",
    "effects",
    "choices",
    ...extras.map((e) => e.column),
    "updated_at",
    "stale",
  ];
  const values = [
    row.id,
    row.name,
    row.source ?? "",
    row.sourceKind ?? "official",
    row.origin ?? "wiki",
    row.description ?? "",
    JSON.stringify(row.data ?? {}),
    JSON.stringify(row.effects ?? []),
    JSON.stringify(row.choices ?? []),
    ...extras.map((e) => {
      const v = e.get(row);
      return v === undefined ? null : v;
    }),
    now(),
    0,
  ];
  const sql = `INSERT INTO ${TABLE_NAMES[table]} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})
    ON CONFLICT(id) DO UPDATE SET ${cols
      .filter((c) => c !== "id")
      .map((c) => `${c}=excluded.${c}`)
      .join(",")}`;
  db.prepare(sql).run(...(values as any[]));
}

export function getContent(db: DB, table: ContentTable, id: string): ContentRow<any> | null {
  const r = db.prepare(`SELECT * FROM ${TABLE_NAMES[table]} WHERE id = ?`).get(id);
  return r ? rowToContent(r) : null;
}

export function loadBundle(db: DB): ImportBundle {
  const bundle = emptyBundle();
  for (const t of CONTENT_TABLES) {
    (bundle as any)[t] = db
      .prepare(`SELECT * FROM ${TABLE_NAMES[t]} ORDER BY name`)
      .all()
      .map(rowToContent);
  }
  return bundle;
}

export function contentCounts(db: DB): Record<string, { wiki: number; custom: number }> {
  const out: Record<string, { wiki: number; custom: number }> = {};
  for (const t of CONTENT_TABLES) {
    const rows = db
      .prepare(`SELECT origin, COUNT(*) n FROM ${TABLE_NAMES[t]} WHERE stale = 0 GROUP BY origin`)
      .all() as { origin: string; n: number }[];
    out[t] = { wiki: 0, custom: 0 };
    for (const r of rows) (out[t] as any)[r.origin] = r.n;
  }
  return out;
}
