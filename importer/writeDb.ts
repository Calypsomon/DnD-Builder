import type { DB } from "../server/db/client";
import { upsertContent } from "../server/db/client";
import { TABLE_NAMES } from "../server/db/schema";
import type { ContentTable, ImportBundle } from "../shared/types/content";
import { CONTENT_TABLES } from "../shared/types/content";

/** Which bundle tables belong to which --only category */
const CATEGORY_TABLES: Record<string, ContentTable[]> = {
  classes: ["classes", "subclasses", "classOptions"],
  species: ["species", "subspecies"],
  backgrounds: ["backgrounds"],
  feats: ["feats"],
  spells: ["spells"],
  items: ["items"],
};

/**
 * Upsert all wiki rows in one transaction. Custom rows are never touched.
 * Wiki rows that were not seen in this import are marked stale (not deleted).
 * Features are owned by several categories; stale marking only happens for owners that were imported.
 */
export function writeBundle(db: DB, bundle: ImportBundle, only: string[] | null): number {
  const tables = only ? [...new Set(only.flatMap((c) => CATEGORY_TABLES[c] ?? []))] : CONTENT_TABLES.filter((t) => t !== "features");
  let written = 0;
  db.transaction(() => {
    const touch = (table: ContentTable, rows: { id: string }[]) => {
      const name = TABLE_NAMES[table];
      const customIds = new Set((db.prepare(`SELECT id FROM ${name} WHERE origin = 'custom'`).all() as { id: string }[]).map((r) => r.id));
      for (const r of rows as any[]) {
        if (customIds.has(r.id)) continue; // never overwrite custom content
        upsertContent(db, table, { ...r, origin: "wiki" });
        written++;
      }
    };
    for (const t of tables) {
      db.prepare(`UPDATE ${TABLE_NAMES[t]} SET stale = 1 WHERE origin = 'wiki'`).run();
      touch(t, bundle[t]);
    }
    // features: mark stale only those whose owner table was imported
    const ownerPrefixes = only
      ? [
          ...(only.includes("classes") ? ["class:", "subclass:"] : []),
          ...(only.includes("species") ? ["species:", "subspecies:"] : []),
          ...(only.includes("backgrounds") ? ["background:"] : []),
        ]
      : ["class:", "subclass:", "species:", "subspecies:", "background:"];
    for (const p of ownerPrefixes) db.prepare(`UPDATE features SET stale = 1 WHERE origin = 'wiki' AND owner_id LIKE ?`).run(`${p}%`);
    touch("features", bundle.features);
    // spell list mapping table
    if (!only || only.includes("spells")) {
      db.prepare("DELETE FROM spell_lists").run();
      const ins = db.prepare("INSERT OR IGNORE INTO spell_lists (spell_id, list_id) VALUES (?, ?)");
      for (const s of bundle.spells) for (const l of s.data.lists ?? []) ins.run(s.id, l);
    }
  })();
  return written;
}
