/** Fixed 5e (2014) rules tables */

export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export function proficiencyBonus(level: number) {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export function abilityMod(score: number) {
  return Math.floor((score - 10) / 2);
}

/** Spell slots by caster level (index = level 1..20), each row = slots for spell levels 1..9 */
export const FULL_CASTER_SLOTS: number[][] = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Slots for a single-class caster of the given type and class level */
export function spellSlots(type: string, classLevel: number): number[] {
  // A single-class half/third caster's own slot table equals the full-caster table
  // at ceil(level/2) resp. ceil(level/3) (half casters start at 2nd, third casters at 3rd level).
  let casterLevel = 0;
  if (type === "full") casterLevel = classLevel;
  else if (type === "artificer") casterLevel = Math.ceil(classLevel / 2);
  else if (type === "half") casterLevel = classLevel >= 2 ? Math.ceil(classLevel / 2) : 0;
  else if (type === "third") casterLevel = classLevel >= 3 ? Math.ceil(classLevel / 3) : 0;
  const row = FULL_CASTER_SLOTS[Math.min(20, casterLevel)] ?? [];
  const out = new Array(10).fill(0);
  row.forEach((n, i) => (out[i + 1] = n));
  return out;
}

/** Warlock pact magic: [slots, slot level] by warlock level */
export function pactSlots(level: number): { slots: number; level: number } {
  if (level < 1) return { slots: 0, level: 0 };
  const slots = level === 1 ? 1 : level <= 10 ? 2 : level <= 16 ? 3 : 4;
  const slotLevel = level <= 2 ? 1 : level <= 4 ? 2 : level <= 6 ? 3 : level <= 8 ? 4 : 5;
  return { slots, level: slotLevel };
}

/** Third casters (Eldritch Knight, Arcane Trickster): cantrips and spells known by class level */
export const THIRD_CASTER_CANTRIPS = [0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
export const THIRD_CASTER_KNOWN = [0, 0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13];
export const THIRD_CASTER_SUBCLASSES: Record<string, { ability: "int"; lists: string[]; cantripBonus?: string }> = {
  "subclass:fighter:eldritch-knight": { ability: "int", lists: ["class:wizard"] },
  "subclass:rogue:arcane-trickster": { ability: "int", lists: ["class:wizard"], cantripBonus: "spell:mage-hand" },
};

export const STANDARD_LANGUAGES = [
  "common",
  "dwarvish",
  "elvish",
  "giant",
  "gnomish",
  "goblin",
  "halfling",
  "orc",
  "abyssal",
  "celestial",
  "draconic",
  "deep-speech",
  "infernal",
  "primordial",
  "sylvan",
  "undercommon",
];

export const ARTISAN_TOOLS = [
  "alchemists-supplies",
  "brewers-supplies",
  "calligraphers-supplies",
  "carpenters-tools",
  "cartographers-tools",
  "cobblers-tools",
  "cooks-utensils",
  "glassblowers-tools",
  "jewelers-tools",
  "leatherworkers-tools",
  "masons-tools",
  "painters-supplies",
  "potters-tools",
  "smiths-tools",
  "tinkers-tools",
  "weavers-tools",
  "woodcarvers-tools",
];
export const OTHER_TOOLS = [
  "disguise-kit",
  "forgery-kit",
  "herbalism-kit",
  "navigators-tools",
  "poisoners-kit",
  "thieves-tools",
  "dice-set",
  "dragonchess-set",
  "playing-card-set",
  "three-dragon-ante-set",
  "bagpipes",
  "drum",
  "dulcimer",
  "flute",
  "lute",
  "lyre",
  "horn",
  "pan-flute",
  "shawm",
  "viol",
  "vehicles-land",
  "vehicles-water",
];

export const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
];

/** "sleight-of-hand" → "Sleight of Hand", "smiths-tools" → "Smiths Tools" */
export function titleCase(id: string): string {
  return id
    .replace(/^[a-z]+:/, "")
    .split("-")
    .map((w) => (["of", "the", "and"].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Short skill summaries (own wording) shown in choice tooltips */
export const SKILL_INFO: Record<string, string> = {
  acrobatics: "Keeping your balance, tumbling, flips and staying on your feet in tricky situations.",
  "animal-handling": "Calming, controlling or reading the intentions of animals and mounts.",
  arcana: "Knowledge of spells, magic items, planes and arcane traditions.",
  athletics: "Climbing, jumping, swimming, grappling and other feats of strength.",
  deception: "Hiding the truth convincingly: lies, misdirection and disguises in speech.",
  history: "Knowledge of past events, kingdoms, wars, people and civilizations.",
  insight: "Reading body language and intentions; noticing lies.",
  intimidation: "Influencing others through threats, hostility or a menacing presence.",
  investigation: "Finding clues, deducing from evidence, searching for hidden details.",
  medicine: "Stabilizing the dying and diagnosing illnesses or wounds.",
  nature: "Knowledge of terrain, plants, animals, weather and natural cycles.",
  perception: "Noticing things with your senses: spotting, hearing, detecting presences.",
  performance: "Entertaining an audience with music, dance, acting or storytelling.",
  persuasion: "Influencing others with tact, charm and good-faith arguments.",
  religion: "Knowledge of deities, rites, holy symbols and religious orders.",
  "sleight-of-hand": "Manual trickery: picking pockets, palming objects, planting items.",
  stealth: "Moving silently and staying hidden from others.",
  survival: "Tracking, hunting, navigating the wild and predicting weather.",
};

/** Standard and exotic languages (PHB): typical speakers and script */
export const LANGUAGE_INFO: Record<string, { speakers: string; script: string; exotic?: boolean }> = {
  common: { speakers: "Humans", script: "Common" },
  dwarvish: { speakers: "Dwarves", script: "Dwarvish" },
  elvish: { speakers: "Elves", script: "Elvish" },
  giant: { speakers: "Ogres, giants", script: "Dwarvish" },
  gnomish: { speakers: "Gnomes", script: "Dwarvish" },
  goblin: { speakers: "Goblinoids", script: "Dwarvish" },
  halfling: { speakers: "Halflings", script: "Common" },
  orc: { speakers: "Orcs", script: "Dwarvish" },
  abyssal: { speakers: "Demons", script: "Infernal", exotic: true },
  celestial: { speakers: "Celestials", script: "Celestial", exotic: true },
  draconic: { speakers: "Dragons, dragonborn", script: "Draconic", exotic: true },
  "deep-speech": { speakers: "Aboleths, cloakers", script: "—", exotic: true },
  infernal: { speakers: "Devils", script: "Infernal", exotic: true },
  primordial: { speakers: "Elementals", script: "Dwarvish", exotic: true },
  sylvan: { speakers: "Fey creatures", script: "Elvish", exotic: true },
  undercommon: { speakers: "Underworld traders", script: "Elvish", exotic: true },
};
