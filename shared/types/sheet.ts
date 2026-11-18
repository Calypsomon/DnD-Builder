import type { Ability, Choice } from "./effects";
import type { AsiChoice } from "./character";

export interface StatPart {
  label: string;
  value: number;
}
/** A computed number with its breakdown (shown as tooltip) */
export interface Stat {
  total: number;
  parts: StatPart[];
}

export type ProfLevel = 0 | 0.5 | 1 | 2;

export interface SheetAttack {
  name: string;
  itemEntryId?: string;
  toHit: Stat;
  damage: string; // "1d8+3"
  damageType: string;
  versatileDamage?: string;
  range?: string;
  properties: string[];
  notes: string[];
}

export interface SheetSpell {
  id: string;
  name: string;
  level: number;
  /** class = chosen from class list, always = always prepared (subclass/feature), granted = from a feature/species */
  origin: "class" | "always" | "granted";
  prepared: boolean;
  ritual: boolean;
  concentration: boolean;
  sourceLabel?: string;
  /** class whose spell list it was chosen from (class spells) */
  classId?: string;
}

/** Spellcasting of one class */
export interface SheetSpellcasting {
  classId: string;
  className: string;
  classLevel: number;
  ability: Ability;
  mode: "known" | "prepared" | "spellbook";
  dc: Stat;
  attack: Stat;
  /** highest spell level this class can learn/prepare (as if single-classed) */
  maxSpellLevel: number;
  cantripsMax: number;
  knownMax?: number;
  preparedMax?: number;
  spellbookMin?: number;
  /** spell lists the class may choose from */
  lists: string[];
  /** additional spells the class may choose (e.g. warlock expanded spell list) */
  extraSpellIds: string[];
  ritual: boolean;
  counts: { cantrips: number; known: number; prepared: number };
}

/** All spellcasting of the character: shared slots + per-class details */
export interface SheetCasting {
  /** slots[1..9] (shared multiclass table when several classes cast) */
  slots: number[];
  pact?: { slots: number; level: number };
  /** highest slot level available */
  maxSlotLevel: number;
  /** caster level used for the multiclass slot table (only when 2+ casting classes) */
  multiclassCasterLevel?: number;
  classes: SheetSpellcasting[];
}

export interface SheetClassInfo {
  classId: string;
  name: string;
  level: number;
  hitDie: number;
  subclassId: string | null;
  subclassName: string | null;
}

export interface SheetResource {
  id: string;
  name: string;
  max: number;
  /** e.g. Rage at barbarian level 20 */
  unlimited?: boolean;
  recharge: "short" | "long" | "dawn" | "none";
  die?: string;
  source: string;
}

export interface SheetFeature {
  id: string;
  name: string;
  level: number;
  ownerType: string;
  ownerName: string;
  description: string;
  source: string;
}

/** One choice the player can make, with current selection */
export interface ChoiceInstance {
  key: string;
  choice: Choice;
  /** where it is shown in the UI */
  location: "origin" | "background" | "class" | "feat" | "item" | "custom";
  ownerId: string;
  ownerName: string;
  /** class level for class choices, else 1 */
  level: number;
  /** class the choice belongs to (class choices) */
  classId?: string;
  /** character level at which the choice appears */
  charLevel: number;
  count: number;
  selected: string[];
  asi?: AsiChoice;
  /** true for "ASI or feat" choices */
  isAsi?: boolean;
  open: boolean;
}

export interface Sheet {
  /** character level (at least 1) */
  level: number;
  /** number of class levels taken (0 = no class yet) */
  classLevel: number;
  classes: SheetClassInfo[];
  /** e.g. "5d10 + 2d6" */
  hitDice: string;
  pb: number;
  /** hit die of the first class */
  hitDie: number;
  abilities: Record<Ability, { score: Stat; mod: number }>;
  saves: Record<Ability, { total: Stat; proficient: boolean }>;
  skills: Record<string, { ability: Ability; total: Stat; prof: ProfLevel }>;
  passive: { perception: Stat; investigation: Stat; insight: Stat };
  initiative: Stat;
  ac: Stat;
  hpMax: Stat;
  speed: { walk: Stat; fly?: number; swim?: number; climb?: number; burrow?: number };
  senses: { sense: string; range: number }[];
  defenses: { resistance: string[]; immunity: string[]; vulnerability: string[] };
  proficiencies: { armor: string[]; weapons: string[]; tools: string[]; languages: string[]; saves: Ability[] };
  attacks: SheetAttack[];
  spellcasting: SheetCasting | null;
  spells: SheetSpell[];
  resources: SheetResource[];
  features: SheetFeature[];
  notes: string[];
  choices: ChoiceInstance[];
  openChoices: ChoiceInstance[];
  warnings: string[];
  attunedCount: number;
  carriedWeight: number;
  carryCapacity: number;
  pointBuy: { spent: number; budget: number };
  summary: string;
}
