import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CONTENT_TABLES, type ContentTable } from "../../shared/types/content";
import { ChoiceSchema, EffectSchema } from "../../shared/types/effects";
import { type DB, contentCounts, getContent, loadBundle, upsertContent } from "../db/client";
import { TABLE_NAMES } from "../db/schema";
import { importStatus, startImport } from "../importRunner";

/** Tables where homebrew entries can be created */
const HOMEBREW_TABLES: ContentTable[] = ["items", "feats", "features", "classOptions", "spells"];

const HomebrewSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().default(""),
  source: z.string().default("Custom"),
  data: z.record(z.string(), z.any()),
  effects: z.array(EffectSchema).default([]),
  choices: z.array(ChoiceSchema).default([]),
});

export function contentRoutes(app: FastifyInstance, db: DB) {
  let bundleCache: { etag: string; json: string; importId: number } | null = null;
  const invalidate = () => (bundleCache = null);
  const lastImportId = () => ((db.prepare("SELECT MAX(id) AS id FROM import_runs").get() as any)?.id ?? 0) as number;

  app.get("/api/content/bundle", async (req, reply) => {
    // the importer runs as a separate process: rebuild when a new import finished
    if (bundleCache && bundleCache.importId !== lastImportId()) invalidate();
    if (!bundleCache) {
      const json = JSON.stringify(loadBundle(db));
      bundleCache = { etag: `"${Date.now().toString(36)}-${json.length}"`, json, importId: lastImportId() };
    }
    if (req.headers["if-none-match"] === bundleCache.etag) return reply.code(304).send();
    reply.header("ETag", bundleCache.etag).header("Content-Type", "application/json");
    return reply.send(bundleCache.json);
  });

  app.get("/api/content/:table/:id", async (req, reply) => {
    const { table, id } = req.params as { table: ContentTable; id: string };
    if (!CONTENT_TABLES.includes(table)) return reply.code(400).send({ error: "Unknown table" });
    const row = getContent(db, table, id);
    return row ?? reply.code(404).send({ error: "Not found" });
  });

  app.get("/api/meta", async () => {
    const lastImport = db.prepare("SELECT * FROM import_runs ORDER BY id DESC LIMIT 1").get() as any;
    const settings = Object.fromEntries(
      (db.prepare("SELECT key, value FROM settings").all() as any[]).map((r) => [r.key, JSON.parse(r.value)]),
    );
    return {
      counts: contentCounts(db),
      lastImport: lastImport
        ? { ...lastImport, warnings: JSON.parse(lastImport.warnings).length }
        : null,
      settings,
    };
  });

  app.get("/api/import/status", async () => importStatus());

  /** Start a (re-)import of the wiki data; body {refresh?: boolean} */
  app.post("/api/import/start", async (req, reply) => {
    const refresh = !!(req.body as any)?.refresh;
    if (!startImport(refresh ? ["--refresh"] : [])) return reply.code(409).send({ error: "An import is already running" });
    return { ok: true };
  });

  app.put("/api/settings", async (req) => {
    const body = z.record(z.string(), z.any()).parse(req.body);
    const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    for (const [k, v] of Object.entries(body)) stmt.run(k, JSON.stringify(v));
    return { ok: true };
  });

  // --- Homebrew ---
  app.post("/api/homebrew/:table", async (req, reply) => {
    const table = (req.params as any).table as ContentTable;
    if (!HOMEBREW_TABLES.includes(table)) return reply.code(400).send({ error: "Homebrew not supported for this table" });
    const body = HomebrewSchema.parse(req.body);
    const id = `custom:${table}:${randomUUID().slice(0, 8)}`;
    upsertContent(db, table, { ...body, id, origin: "custom", sourceKind: "homebrew", source: body.source || "Custom" } as any);
    invalidate();
    return getContent(db, table, id);
  });

  app.put("/api/homebrew/:table/:id", async (req, reply) => {
    const { table, id } = req.params as { table: ContentTable; id: string };
    const existing = getContent(db, table, id);
    if (!existing || existing.origin !== "custom") return reply.code(404).send({ error: "Custom entry not found" });
    const body = HomebrewSchema.parse(req.body);
    upsertContent(db, table, { ...body, id, origin: "custom", sourceKind: "homebrew", source: body.source || "Custom" } as any);
    invalidate();
    return getContent(db, table, id);
  });

  /** Characters that reference a content id (inventory or build JSON) */
  app.get("/api/homebrew/:table/:id/usage", async (req) => {
    const { id } = req.params as { id: string };
    return usage(db, id);
  });

  app.delete("/api/homebrew/:table/:id", async (req, reply) => {
    const { table, id } = req.params as { table: ContentTable; id: string };
    const existing = getContent(db, table, id);
    if (!existing || existing.origin !== "custom") return reply.code(404).send({ error: "Custom entry not found" });
    db.prepare(`DELETE FROM ${TABLE_NAMES[table]} WHERE id = ?`).run(id);
    invalidate();
    return { ok: true };
  });
}

export function usage(db: DB, id: string): { id: string; name: string }[] {
  const viaItems = db
    .prepare("SELECT DISTINCT c.id, c.name FROM characters c JOIN character_items i ON i.character_id = c.id WHERE i.item_id = ?")
    .all(id) as any[];
  const viaBuild = db.prepare("SELECT id, name FROM characters WHERE instr(build, ?) > 0").all(`"${id}"`) as any[];
  const map = new Map<string, { id: string; name: string }>();
  for (const r of [...viaItems, ...viaBuild]) map.set(r.id, { id: r.id, name: r.name });
  return [...map.values()];
}
