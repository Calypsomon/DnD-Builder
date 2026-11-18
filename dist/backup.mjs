import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);

// server/backup.ts
import { mkdirSync as mkdirSync2 } from "node:fs";
import { resolve as resolve2 } from "node:path";

// server/db/client.ts
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// server/db/schema.ts
var TABLE_NAMES = {
  classes: "classes",
  subclasses: "subclasses",
  features: "features",
  classOptions: "class_options",
  species: "species",
  subspecies: "subspecies",
  backgrounds: "backgrounds",
  feats: "feats",
  spells: "spells",
  items: "items"
};
var bool = (v) => v ? 1 : 0;
var EXTRA_COLUMNS = {
  classes: [
    { column: "hit_die", type: "INTEGER", get: (r) => r.data.hitDie },
    { column: "caster_type", type: "TEXT", get: (r) => r.data.spellcasting?.type ?? "none" },
    { column: "spell_ability", type: "TEXT", get: (r) => r.data.spellcasting?.ability ?? null },
    { column: "subclass_level", type: "INTEGER", get: (r) => r.data.subclassLevel }
  ],
  subclasses: [{ column: "class_id", type: "TEXT", get: (r) => r.data.classId }],
  features: [
    { column: "owner_type", type: "TEXT", get: (r) => r.data.ownerType },
    { column: "owner_id", type: "TEXT", get: (r) => r.data.ownerId },
    { column: "level", type: "INTEGER", get: (r) => r.data.level },
    { column: "sort", type: "INTEGER", get: (r) => r.data.sort }
  ],
  classOptions: [
    { column: "option_group", type: "TEXT", get: (r) => r.data.group },
    { column: "class_ids", type: "TEXT", get: (r) => (r.data.classIds ?? []).join(",") },
    { column: "level_req", type: "INTEGER", get: (r) => r.data.levelReq ?? null },
    { column: "prerequisite", type: "TEXT", get: (r) => r.data.prerequisite ?? null }
  ],
  species: [
    { column: "size", type: "TEXT", get: (r) => r.data.size },
    { column: "speed", type: "INTEGER", get: (r) => r.data.speed?.walk ?? null },
    { column: "base_id", type: "TEXT", get: (r) => r.data.baseId }
  ],
  subspecies: [{ column: "species_id", type: "TEXT", get: (r) => r.data.speciesId }],
  backgrounds: [],
  feats: [{ column: "prerequisite", type: "TEXT", get: (r) => r.data.prerequisite ?? null }],
  spells: [
    { column: "level", type: "INTEGER", get: (r) => r.data.level },
    { column: "school", type: "TEXT", get: (r) => r.data.school },
    { column: "ritual", type: "INTEGER", get: (r) => bool(r.data.ritual) },
    { column: "concentration", type: "INTEGER", get: (r) => bool(r.data.concentration) },
    { column: "casting_time", type: "TEXT", get: (r) => r.data.castingTime },
    { column: "range", type: "TEXT", get: (r) => r.data.range },
    { column: "duration", type: "TEXT", get: (r) => r.data.duration }
  ],
  items: [
    { column: "category", type: "TEXT", get: (r) => r.data.category },
    { column: "subtype", type: "TEXT", get: (r) => r.data.subtype ?? null },
    { column: "rarity", type: "TEXT", get: (r) => r.data.rarity ?? null },
    { column: "attunement", type: "INTEGER", get: (r) => bool(r.data.attunement) },
    { column: "cost_cp", type: "INTEGER", get: (r) => r.data.costCp ?? null },
    { column: "weight_lb", type: "REAL", get: (r) => r.data.weightLb ?? null }
  ]
};
function contentTableSql(key) {
  const extras = EXTRA_COLUMNS[key].map((e) => `  ${e.column} ${e.type},`).join("\n");
  return `CREATE TABLE IF NOT EXISTS ${TABLE_NAMES[key]} (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL DEFAULT 'official',
  origin TEXT NOT NULL DEFAULT 'wiki',
  description TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  effects TEXT NOT NULL DEFAULT '[]',
  choices TEXT NOT NULL DEFAULT '[]',
${extras}
  updated_at TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_${TABLE_NAMES[key]}_origin ON ${TABLE_NAMES[key]}(origin);`;
}
var MIGRATIONS = [
  [
    ...Object.keys(TABLE_NAMES).map(contentTableSql),
    `CREATE TABLE IF NOT EXISTS spell_lists (
  spell_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  PRIMARY KEY (spell_id, list_id)
);`,
    `CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  build TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`,
    `CREATE TABLE IF NOT EXISTS character_items (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  equipped INTEGER NOT NULL DEFAULT 0,
  attuned INTEGER NOT NULL DEFAULT 0,
  custom_name TEXT,
  notes TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);`,
    `CREATE TABLE IF NOT EXISTS character_custom (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  effects TEXT NOT NULL DEFAULT '[]'
);`,
    `CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);`,
    `CREATE TABLE IF NOT EXISTS import_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  entries_written INTEGER NOT NULL DEFAULT 0,
  warnings TEXT NOT NULL DEFAULT '[]'
);`
  ].join("\n")
];

// server/db/sqlite.ts
import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";
var Database = class {
  db;
  constructor(path, opts = {}) {
    this.db = new DatabaseSync(path, { readOnly: !!opts.readonly });
  }
  prepare(sql) {
    return this.db.prepare(sql);
  }
  exec(sql) {
    this.db.exec(sql);
  }
  /** "journal_mode = WAL" sets, "user_version" with {simple:true} returns the value */
  pragma(statement, opts = {}) {
    const rows = this.db.prepare(`PRAGMA ${statement}`).all();
    if (opts.simple) return rows[0] ? Object.values(rows[0])[0] : void 0;
    return rows;
  }
  /** Returns a function that runs fn inside a transaction (like better-sqlite3) */
  transaction(fn) {
    return (...args) => {
      this.db.exec("BEGIN");
      try {
        const result = fn(...args);
        this.db.exec("COMMIT");
        return result;
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    };
  }
  /** Online backup to a file */
  async backup(destination) {
    await sqliteBackup(this.db, destination);
  }
  close() {
    this.db.close();
  }
};

// server/db/client.ts
function findRoot() {
  let dir2 = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir2, "config.json"))) return dir2;
    dir2 = resolve(dir2, "..");
  }
  return process.cwd();
}
var ROOT = findRoot();
var CONFIG = JSON.parse(readFileSync(resolve(ROOT, "config.json"), "utf8"));

// server/backup.ts
var stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 16).replace("T", "-").replace(":", "");
var dir = resolve2(ROOT, "data/backups");
mkdirSync2(dir, { recursive: true });
var target = resolve2(dir, `dndbuilder-${stamp}.db`);
var db = new Database(resolve2(ROOT, CONFIG.dbPath));
await db.backup(target);
db.close();
console.log(`Backup written: ${target}`);
