import type { Ability } from "../types/effects";

/** Multiclassing prerequisites (PHB 2014): every entry must be met; an entry is met if any listed ability is >= min */
export const MULTICLASS_PREREQ: Record<string, { abilities: Ability[]; min: number }[]> = {
  "class:artificer": [{ abilities: ["int"], min: 13 }],
  "class:barbarian": [{ abilities: ["str"], min: 13 }],
  "class:bard": [{ abilities: ["cha"], min: 13 }],
  "class:cleric": [{ abilities: ["wis"], min: 13 }],
  "class:druid": [{ abilities: ["wis"], min: 13 }],
  "class:fighter": [{ abilities: ["str", "dex"], min: 13 }],
  "class:monk": [
    { abilities: ["dex"], min: 13 },
    { abilities: ["wis"], min: 13 },
  ],
  "class:paladin": [
    { abilities: ["str"], min: 13 },
    { abilities: ["cha"], min: 13 },
  ],
  "class:ranger": [
    { abilities: ["dex"], min: 13 },
    { abilities: ["wis"], min: 13 },
  ],
  "class:rogue": [{ abilities: ["dex"], min: 13 }],
  "class:sorcerer": [{ abilities: ["cha"], min: 13 }],
  "class:warlock": [{ abilities: ["cha"], min: 13 }],
  "class:wizard": [{ abilities: ["int"], min: 13 }],
};

export function prereqText(classId: string): string {
  const req = MULTICLASS_PREREQ[classId];
  if (!req) return "";
  return req.map((r) => `${r.abilities.map((a) => a.toUpperCase()).join(" or ")} ${r.min}`).join(" and ");
}

export function meetsPrereq(classId: string, scores: Record<Ability, number>): boolean {
  const req = MULTICLASS_PREREQ[classId];
  if (!req) return true;
  return req.every((r) => r.abilities.some((a) => scores[a] >= r.min));
}

/**
 * Proficiencies gained when a class is added as a second (or later) class (PHB "Multiclassing Proficiencies").
 * skills: number of skill choices (from the class skill list, or any skill for the bard).
 */
export const MULTICLASS_PROFICIENCIES: Record<
  string,
  { armor: string[]; weapons: string[]; tools: string[]; skills?: { count: number; any?: boolean }; toolChoice?: { count: number; ids?: string[]; label: string } }
> = {
  "class:artificer": { armor: ["light", "medium", "shields"], weapons: [], tools: ["thieves-tools", "tinkers-tools"] },
  "class:barbarian": { armor: ["shields"], weapons: ["simple", "martial"], tools: [] },
  "class:bard": {
    armor: ["light"],
    weapons: [],
    tools: [],
    skills: { count: 1, any: true },
    toolChoice: { count: 1, label: "Musical Instrument", ids: ["bagpipes", "drum", "dulcimer", "flute", "lute", "lyre", "horn", "pan-flute", "shawm", "viol"] },
  },
  "class:cleric": { armor: ["light", "medium", "shields"], weapons: [], tools: [] },
  "class:druid": { armor: ["light", "medium", "shields"], weapons: [], tools: [] },
  "class:fighter": { armor: ["light", "medium", "shields"], weapons: ["simple", "martial"], tools: [] },
  "class:monk": { armor: [], weapons: ["simple", "shortsword"], tools: [] },
  "class:paladin": { armor: ["light", "medium", "shields"], weapons: ["simple", "martial"], tools: [] },
  "class:ranger": { armor: ["light", "medium", "shields"], weapons: ["simple", "martial"], tools: [], skills: { count: 1 } },
  "class:rogue": { armor: ["light"], weapons: [], tools: ["thieves-tools"], skills: { count: 1 } },
  "class:sorcerer": { armor: [], weapons: [], tools: [] },
  "class:warlock": { armor: ["light"], weapons: ["simple"], tools: [] },
  "class:wizard": { armor: [], weapons: [], tools: [] },
};

/**
 * Caster level for the shared multiclass spell slot table:
 * full casters count fully, paladin/ranger half (rounded down), eldritch knight/arcane trickster a third (rounded down),
 * artificer half rounded up. Warlock pact magic is separate.
 */
export function multiclassCasterLevel(entries: { type: string; level: number }[]): number {
  let total = 0;
  for (const e of entries) {
    if (e.type === "full") total += e.level;
    else if (e.type === "half") total += Math.floor(e.level / 2);
    else if (e.type === "third") total += Math.floor(e.level / 3);
    else if (e.type === "artificer") total += Math.ceil(e.level / 2);
  }
  return total;
}
