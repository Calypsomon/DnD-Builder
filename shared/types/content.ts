import type { Ability, Choice, Effect, Formula } from "./effects";

export type SourceKind = "official" | "ua" | "homebrew";
export type Origin = "wiki" | "custom";

/** Common shape of every content entry (one row in a content table). */
export interface ContentRow<T = Record<string, unknown>> {
  id: string;
  name: string;
  /** Book abbreviation: PHB, XGE, TCE, SCAG, EGW, MPMM, ERLW, UA, HB, DMG ... */
  source: string;
  sourceKind: SourceKind;
  origin: Origin;
  /** Light markdown */
  description: string;
  data: T;
  effects: Effect[];
  choices: Choice[];
  stale?: boolean;
}

export const SKILLS: Record<string, Ability> = {
  acrobatics: "dex",
  "animal-handling": "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  "sleight-of-hand": "dex",
  stealth: "dex",
  survival: "wis",
};
export type SkillId = keyof typeof SKILLS;

export type CasterType = "none" | "full" | "half" | "third" | "pact" | "artificer";

export interface ClassTableRow {
  level: number;
  pb: number;
  features: string[];
  /** Additional class-specific columns, e.g. {"Rages": "2", "Cantrips Known": "3", "1st": "2"} */
  columns: Record<string, string>;
}

export interface ClassData {
  hitDie: 6 | 8 | 10 | 12;
  saves: Ability[];
  /** armor: "light" | "medium" | "heavy" | "shields"; weapons: "simple" | "martial" | weapon slug; tools: slug */
  proficiencies: { armor: string[]; weapons: string[]; tools: string[] };
  /** Raw proficiency texts (for display) */
  proficiencyText: { armor: string; weapons: string; tools: string; saves: string; skills: string };
  skillChoice: { count: number; from: string[] };
  startingEquipment: { text: string; options: string[] };
  spellcasting?: {
    type: Exclude<CasterType, "none">;
    ability: Ability;
    mode: "known" | "prepared" | "spellbook";
    ritual: boolean;
    preparedFormula?: Formula;
  };
  table: ClassTableRow[];
  subclassLevel: number;
  subclassLabel: string;
  asiLevels: number[];
  multiclassRequirement: string;
  primaryAbility?: string;
}

export interface SubclassData {
  classId: string;
  /** Expanded / always-prepared spells: class level → spell ids */
  spells?: { level: number; spellIds: string[]; alwaysPrepared: boolean }[];
}

export type FeatureOwnerType = "class" | "subclass" | "species" | "subspecies" | "background" | "feat" | "option";
export interface FeatureData {
  ownerType: FeatureOwnerType;
  ownerId: string;
  /** Class level / character level from which the feature applies (1 for species/background) */
  level: number;
  sort: number;
  optional?: boolean;
}

export interface ClassOptionData {
  group: string; // fighting-style, maneuver, invocation, metamagic, pact-boon, infusion, ...
  classIds: string[];
  levelReq?: number;
  prerequisite?: string;
}

export interface SpeciesData {
  /** For source variants, the id of the base species (PHB version), else own id */
  baseId: string;
  variantLabel: string; // "Player's Handbook", "Eberron: Rising from the Last War", ...
  size: string;
  speed: { walk: number; fly?: number; swim?: number; climb?: number; burrow?: number };
  darkvision?: number;
  languages: string[];
  category?: string; // Standard, Exotic, Monstrous, Setting Specific, Unearthed Arcana
}

export interface SubspeciesData {
  speciesId: string;
  /** The subrace replaces the species' Ability Score Increase (e.g. Variant Human) */
  replacesSpeciesAsi?: boolean;
  speedWalk?: number;
  darkvision?: number;
}

export interface BackgroundData {
  skills: string[];
  tools: string[];
  languagesText: string;
  equipmentText: string;
  featureName?: string;
  characteristics?: Record<string, string[]>; // "Personality Traits" -> rows
}

export interface FeatData {
  prerequisite?: string;
  prereqAbilities?: { abilities: Ability[]; min: number }[];
}

export interface SpellData {
  level: number; // 0 = cantrip
  school: string; // lowercase: evocation
  castingTime: string;
  range: string;
  components: { v: boolean; s: boolean; m: boolean; material?: string };
  duration: string;
  concentration: boolean;
  ritual: boolean;
  higherLevels?: string;
  /** Class ids whose spell list contains the spell, e.g. ["class:wizard"] */
  lists: string[];
}

export type ItemCategory = "weapon" | "armor" | "shield" | "gear" | "tool" | "ammunition" | "pack" | "magic";

export interface WeaponStats {
  category: "simple" | "martial";
  range: "melee" | "ranged";
  damage: string; // "1d8" or "1" or ""
  damageType: string; // slashing ...
  properties: string[]; // finesse, light, heavy, reach, two-handed, loading, thrown, ammunition, versatile, special
  versatile?: string;
  rangeNormal?: number;
  rangeLong?: number;
  magicBonus?: number;
}

export interface ArmorStats {
  type: "light" | "medium" | "heavy" | "shield";
  baseAc: number; // shield: 2
  dexCap: number | null; // null = unlimited, 0 = no dex
  strReq?: number;
  stealthDisadvantage: boolean;
  magicBonus?: number;
}

export interface ItemData {
  category: ItemCategory;
  subtype?: string; // "simple-melee", "light", "Wondrous item", "Ring", "Potion" ...
  costCp?: number;
  weightLb?: number;
  rarity?: string; // common, uncommon, rare, very rare, legendary, artifact, varies
  attunement?: boolean;
  attunementText?: string;
  weapon?: WeaponStats;
  armor?: ArmorStats;
  /** Magic items: "Weapon (any sword)", "Wondrous item" ... */
  magicType?: string;
  baseItemId?: string;
  contents?: string[];
}

/** Output of the importer parsers, written by importer/writeDb.ts */
export interface ImportBundle {
  classes: ContentRow<ClassData>[];
  subclasses: ContentRow<SubclassData>[];
  features: ContentRow<FeatureData>[];
  classOptions: ContentRow<ClassOptionData>[];
  species: ContentRow<SpeciesData>[];
  subspecies: ContentRow<SubspeciesData>[];
  backgrounds: ContentRow<BackgroundData>[];
  feats: ContentRow<FeatData>[];
  spells: ContentRow<SpellData>[];
  items: ContentRow<ItemData>[];
}

export type ContentTable = keyof ImportBundle;
export const CONTENT_TABLES: ContentTable[] = [
  "classes",
  "subclasses",
  "features",
  "classOptions",
  "species",
  "subspecies",
  "backgrounds",
  "feats",
  "spells",
  "items",
];

/** Content as delivered to the browser */
export type ContentBundle = ImportBundle;

export function emptyBundle(): ImportBundle {
  return {
    classes: [],
    subclasses: [],
    features: [],
    classOptions: [],
    species: [],
    subspecies: [],
    backgrounds: [],
    feats: [],
    spells: [],
    items: [],
  };
}
