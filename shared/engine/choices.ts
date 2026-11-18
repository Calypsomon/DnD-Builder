import type { CharacterBuild } from "../types/character";
import type { ClassOptionData, ContentRow, FeatData, SpellData } from "../types/content";
import { SKILLS } from "../types/content";
import type { Choice } from "../types/effects";
import { ABILITIES } from "../types/effects";
import { ARTISAN_TOOLS, LANGUAGE_INFO, OTHER_TOOLS, SKILL_INFO, STANDARD_LANGUAGES, titleCase } from "../rules/tables";
import { type ContentIndex, visible } from "./contentIndex";
import { type FormulaContext, safeEval } from "./formula";

export interface ChoiceOption {
  id: string;
  name: string;
  detail?: string;
  description?: string;
  source?: string;
}

const ABILITY_NAMES: Record<string, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export function displayName(id: string, idx: ContentIndex): string {
  const row = idx.byId.get(id);
  if (row) return row.name;
  if (ABILITY_NAMES[id]) return ABILITY_NAMES[id];
  return titleCase(id);
}

/** All options a player can pick for a choice, filtered by the character's source settings */
export function choiceOptions(choice: Choice, idx: ContentIndex, build: CharacterBuild, maxSpellLevel = 9): ChoiceOption[] {
  const from = choice.from;
  const opt = (row: ContentRow<any>, detail?: string): ChoiceOption => ({
    id: row.id,
    name: row.name,
    detail,
    description: row.description,
    source: row.source,
  });
  switch (from.kind) {
    case "list":
      return from.ids.map((id) => {
        const row = idx.byId.get(id);
        return row ? opt(row) : { id, name: displayName(id, idx) };
      });
    case "skills":
      return (from.ids?.length ? from.ids : Object.keys(SKILLS)).map((id) => ({
        id,
        name: titleCase(id),
        detail: SKILLS[id]?.toUpperCase(),
        description: SKILL_INFO[id],
      }));
    case "languages":
      return (from.ids?.length ? from.ids : STANDARD_LANGUAGES).map((id) => {
        const info = LANGUAGE_INFO[id];
        return {
          id,
          name: titleCase(id),
          detail: info?.exotic ? "exotic" : undefined,
          description: info ? `Typical speakers: ${info.speakers}. Script: ${info.script}.` : undefined,
        };
      });
    case "tools": {
      const ids = from.ids?.length ? from.ids : [...ARTISAN_TOOLS, ...OTHER_TOOLS];
      return ids.map((id) => {
        // tool descriptions come from the imported tool items (item:<slug>)
        const item = idx.byId.get(`item:${id}`) ?? idx.byId.get(`item:${id.replace(/s$/, "")}`);
        return { id, name: item?.name ?? titleCase(id), description: item?.description || undefined, source: item?.source };
      });
    }
    case "abilities":
      return (from.ids?.length ? from.ids : [...ABILITIES]).map((id) => ({ id, name: ABILITY_NAMES[id], detail: `+${from.amount}` }));
    case "classOptions":
      return (idx.bundle.classOptions as ContentRow<ClassOptionData>[])
        .filter((r) => r.data.group === from.group && (!from.classId || r.data.classIds.includes(from.classId)) && visible(r, build))
        .map((r) => opt(r, r.data.prerequisite));
    case "feats":
      return (idx.bundle.feats as ContentRow<FeatData>[]).filter((r) => visible(r, build)).map((r) => opt(r, r.data.prerequisite));
    case "subclass":
      return (idx.subclassesByClass.get(from.classId) ?? []).filter((r) => visible(r, build)).map((r) => opt(r, r.source));
    case "spells": {
      const ctx: FormulaContext = { vars: { level: build.levels.length, classLevel: build.levels.length, pb: 2 } };
      const max = from.maxLevel != null ? safeEval(from.maxLevel, ctx, undefined, 9) : maxSpellLevel;
      const min = from.minLevel ?? 0;
      return (idx.bundle.spells as ContentRow<SpellData>[])
        .filter(
          (s) =>
            visible(s, build) &&
            s.data.level >= min &&
            s.data.level <= max &&
            (!from.lists?.length || from.lists.some((l) => s.data.lists.includes(l))) &&
            (!from.school?.length || from.school.includes(s.data.school)) &&
            (from.ritual == null || s.data.ritual === from.ritual),
        )
        .map((s) => opt(s, s.data.level === 0 ? "Cantrip" : `Level ${s.data.level} ${s.data.school}`));
    }
    case "asiOrFeat":
      return [];
  }
}
