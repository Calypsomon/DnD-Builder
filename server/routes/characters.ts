import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CharacterBuildSchema,
  CharacterSchema,
  CharacterStateSchema,
  CustomBonusSchema,
  InventoryEntrySchema,
  newBuild,
  newState,
  type Character,
} from "../../shared/types/character";
import { type DB, now } from "../db/client";

function loadCharacter(db: DB, id: string): Character | null {
  const c = db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as any;
  if (!c) return null;
  const inventory = (db.prepare("SELECT * FROM character_items WHERE character_id = ? ORDER BY sort, rowid").all(id) as any[]).map(
    (r) => ({
      id: r.id,
      itemId: r.item_id,
      quantity: r.quantity,
      equipped: !!r.equipped,
      attuned: !!r.attuned,
      customName: r.custom_name,
      notes: r.notes,
    }),
  );
  const custom = (db.prepare("SELECT * FROM character_custom WHERE character_id = ? ORDER BY rowid").all(id) as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    effects: JSON.parse(r.effects),
  }));
  return {
    id: c.id,
    build: JSON.parse(c.build),
    state: JSON.parse(c.state),
    inventory,
    custom,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

const SaveSchema = z.object({
  build: CharacterBuildSchema,
  state: CharacterStateSchema,
  inventory: z.array(InventoryEntrySchema),
  custom: z.array(CustomBonusSchema),
  summary: z.string().optional(),
});

function saveCharacter(db: DB, id: string, data: z.infer<typeof SaveSchema>, isNew = false) {
  const ts = now();
  db.transaction(() => {
    if (isNew) {
      db.prepare(
        "INSERT INTO characters (id, name, summary, build, state, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
      ).run(id, data.build.name, data.summary ?? "", JSON.stringify(data.build), JSON.stringify(data.state), ts, ts);
    } else {
      db.prepare("UPDATE characters SET name=?, summary=?, build=?, state=?, updated_at=? WHERE id=?").run(
        data.build.name,
        data.summary ?? "",
        JSON.stringify(data.build),
        JSON.stringify(data.state),
        ts,
        id,
      );
    }
    db.prepare("DELETE FROM character_items WHERE character_id = ?").run(id);
    const insItem = db.prepare(
      "INSERT INTO character_items (id, character_id, item_id, quantity, equipped, attuned, custom_name, notes, sort) VALUES (?,?,?,?,?,?,?,?,?)",
    );
    data.inventory.forEach((e, i) =>
      insItem.run(e.id || randomUUID(), id, e.itemId, e.quantity, e.equipped ? 1 : 0, e.attuned ? 1 : 0, e.customName ?? null, e.notes ?? null, i),
    );
    db.prepare("DELETE FROM character_custom WHERE character_id = ?").run(id);
    const insCustom = db.prepare("INSERT INTO character_custom (id, character_id, name, description, effects) VALUES (?,?,?,?,?)");
    for (const c of data.custom) insCustom.run(c.id || randomUUID(), id, c.name, c.description, JSON.stringify(c.effects));
  })();
}

export function characterRoutes(app: FastifyInstance, db: DB) {
  app.get("/api/characters", async () => {
    return db.prepare("SELECT id, name, summary, created_at AS createdAt, updated_at AS updatedAt FROM characters ORDER BY updated_at DESC").all();
  });

  app.post("/api/characters", async (req) => {
    const body = z.object({ name: z.string().optional() }).parse(req.body ?? {});
    const id = randomUUID();
    const build = newBuild(body.name || "New Character");
    saveCharacter(db, id, { build, state: newState(), inventory: [], custom: [] }, true);
    return loadCharacter(db, id);
  });

  app.get("/api/characters/:id", async (req, reply) => {
    const c = loadCharacter(db, (req.params as any).id);
    if (!c) return reply.code(404).send({ error: "Character not found" });
    return c;
  });

  app.put("/api/characters/:id", async (req, reply) => {
    const id = (req.params as any).id;
    if (!db.prepare("SELECT 1 FROM characters WHERE id = ?").get(id)) return reply.code(404).send({ error: "Character not found" });
    const data = SaveSchema.parse(req.body);
    saveCharacter(db, id, data);
    return { ok: true, updatedAt: now() };
  });

  app.post("/api/characters/:id/duplicate", async (req, reply) => {
    const c = loadCharacter(db, (req.params as any).id);
    if (!c) return reply.code(404).send({ error: "Character not found" });
    const id = randomUUID();
    const build = { ...c.build, name: `${c.build.name} (copy)` };
    const summaryRow = db.prepare("SELECT summary FROM characters WHERE id = ?").get(c.id) as any;
    saveCharacter(
      db,
      id,
      {
        build,
        state: c.state,
        inventory: c.inventory.map((e) => ({ ...e, id: randomUUID() })),
        custom: c.custom.map((e) => ({ ...e, id: randomUUID() })),
        summary: summaryRow?.summary,
      },
      true,
    );
    return loadCharacter(db, id);
  });

  app.delete("/api/characters/:id", async (req) => {
    db.prepare("DELETE FROM characters WHERE id = ?").run((req.params as any).id);
    return { ok: true };
  });

  app.get("/api/characters/:id/export", async (req, reply) => {
    const c = loadCharacter(db, (req.params as any).id);
    if (!c) return reply.code(404).send({ error: "Character not found" });
    const file = `${c.build.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "character"}.json`;
    reply.header("Content-Disposition", `attachment; filename="${file}"`);
    return { format: "dndbuilder-character", version: 1, character: c };
  });

  app.post("/api/characters/import", async (req) => {
    const body = req.body as any;
    const raw = body?.character ?? body;
    const parsed = CharacterSchema.parse({ ...raw, id: raw?.id ?? "import" });
    const id = randomUUID();
    saveCharacter(
      db,
      id,
      {
        build: parsed.build,
        state: parsed.state,
        inventory: parsed.inventory.map((e) => ({ ...e, id: randomUUID() })),
        custom: parsed.custom.map((e) => ({ ...e, id: randomUUID() })),
      },
      true,
    );
    return loadCharacter(db, id);
  });
}
