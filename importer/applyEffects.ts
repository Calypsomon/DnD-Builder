import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "../server/db/client";
import type { ContentRow, ImportBundle } from "../shared/types/content";
import { ChoiceSchema, EffectSchema } from "../shared/types/effects";

/**
 * data/effects/*.json: { "<content id>": { "effects"?: Effect[], "choices"?: Choice[], "replace"?: boolean } }
 *   Adds hand-made rule effects/choices to imported rows (replace=true replaces the parsed ones).
 * data/overrides/*.json: { "<content id>": { ...fields to merge, "data": {...partial data} } }
 *   Corrects parsed values (e.g. a wrong feature level). Deep-merges "data".
 * Keys starting with "_" are comments and ignored.
 */
export function applyEffects(bundle: ImportBundle): { applied: number; warnings: string[]; overridden: Set<string> } {
  const warnings: string[] = [];
  const byId = new Map<string, ContentRow<any>>();
  for (const rows of Object.values(bundle)) for (const r of rows as ContentRow<any>[]) byId.set(r.id, r);
  let applied = 0;
  const overridden = new Set<string>();

  for (const file of jsonFiles("data/effects")) {
    const json = readJson(file, warnings);
    for (const [id, entry] of Object.entries(json ?? {})) {
      if (id.startsWith("_")) continue;
      const row = byId.get(id);
      if (!row) {
        warnings.push(`effects: ${id} (${file}) not found in imported data`);
        continue;
      }
      const e = entry as { effects?: unknown[]; choices?: unknown[]; replace?: boolean };
      const effects = (e.effects ?? []).flatMap((x) => {
        const p = EffectSchema.safeParse(x);
        if (!p.success) warnings.push(`effects: invalid effect on ${id}: ${p.error.issues[0]?.message}`);
        return p.success ? [p.data] : [];
      });
      const choices = (e.choices ?? []).flatMap((x) => {
        const p = ChoiceSchema.safeParse(x);
        if (!p.success) warnings.push(`effects: invalid choice on ${id}: ${p.error.issues[0]?.message}`);
        return p.success ? [p.data] : [];
      });
      if (e.replace) {
        row.effects = effects;
        row.choices = choices;
      } else {
        row.effects = [...row.effects, ...effects];
        const ids = new Set(choices.map((c) => c.id));
        row.choices = [...row.choices.filter((c) => !ids.has(c.id)), ...choices];
      }
      applied++;
    }
  }

  for (const file of jsonFiles("data/overrides")) {
    const json = readJson(file, warnings);
    for (const [id, patch] of Object.entries(json ?? {})) {
      if (id.startsWith("_")) continue;
      const row = byId.get(id);
      if (!row) {
        warnings.push(`overrides: ${id} (${file}) not found in imported data`);
        continue;
      }
      const { data, ...rest } = patch as { data?: Record<string, unknown> };
      Object.assign(row, rest);
      if (data) row.data = { ...row.data, ...data };
      overridden.add(id);
      applied++;
    }
  }
  return { applied, warnings, overridden };
}

function jsonFiles(dir: string): string[] {
  const abs = resolve(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => f.endsWith(".json"))
    .map((f) => resolve(abs, f));
}

function readJson(file: string, warnings: string[]): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    warnings.push(`Could not read ${file}: ${(e as Error).message}`);
    return null;
  }
}
