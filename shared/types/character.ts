import { z } from "zod";
import { ABILITIES, AbilitySchema, EffectSchema } from "./effects";

const AbilityRecord = z.object({
  str: z.number(),
  dex: z.number(),
  con: z.number(),
  int: z.number(),
  wis: z.number(),
  cha: z.number(),
});

export const AsiChoiceSchema = z.union([
  z.object({ kind: z.literal("asi"), increases: z.partialRecord(AbilitySchema, z.number()) }),
  z.object({ kind: z.literal("feat"), featId: z.string() }),
]);
export type AsiChoice = z.infer<typeof AsiChoiceSchema>;

/** Choice key → selected ids. ASI choices store an AsiChoice. */
export const ChoiceSelectionsSchema = z.record(z.string(), z.union([z.array(z.string()), AsiChoiceSchema]));
export type ChoiceSelections = z.infer<typeof ChoiceSelectionsSchema>;

export const LevelEntrySchema = z.object({
  classId: z.string(),
  hp: z.union([z.literal("max"), z.literal("avg"), z.number()]),
});
export type LevelEntry = z.infer<typeof LevelEntrySchema>;

export const CharacterBuildSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  options: z.object({
    sources: z.array(z.enum(["official", "ua", "homebrew"])),
    featsAllowed: z.boolean(),
    customizeOrigin: z.boolean(),
    /** apply optional class features (Tasha's Cauldron of Everything) */
    optionalFeatures: z.boolean().default(false),
  }),
  abilities: z.object({
    method: z.enum(["pointbuy", "standard", "manual"]),
    base: AbilityRecord,
  }),
  speciesId: z.string().nullable(),
  subspeciesId: z.string().nullable(),
  /** Customize Origin: replaces the species' fixed ability increases */
  customAsi: z.partialRecord(AbilitySchema, z.number()),
  backgroundId: z.string().nullable(),
  /** first class (kept for compatibility; the classes are defined by `levels`) */
  classId: z.string().nullable(),
  /** subclass of the first class (legacy, see `subclasses`) */
  subclassId: z.string().nullable(),
  /** chosen subclass per class id */
  subclasses: z.record(z.string(), z.string()).default({}),
  /** index 0 = character level 1 */
  levels: z.array(LevelEntrySchema),
  /** All choice selections, keyed by choice key (see engine/choices.ts) */
  choices: ChoiceSelectionsSchema,
  /** legacy single-class spell lists (belong to the first class), see `classSpells` */
  spells: z.object({ known: z.array(z.string()), prepared: z.array(z.string()) }),
  /** spells known/prepared per class id */
  classSpells: z.record(z.string(), z.object({ known: z.array(z.string()), prepared: z.array(z.string()) })).default({}),
  details: z.object({
    alignment: z.string().default(""),
    age: z.string().default(""),
    appearance: z.string().default(""),
    backstory: z.string().default(""),
    notes: z.string().default(""),
  }),
});
export type CharacterBuild = z.infer<typeof CharacterBuildSchema>;

export const CharacterStateSchema = z.object({
  hpCurrent: z.number().nullable(), // null = full
  hpTemp: z.number(),
  slotsUsed: z.record(z.string(), z.number()),
  pactSlotsUsed: z.number(),
  resourcesUsed: z.record(z.string(), z.number()),
  currency: z.object({ cp: z.number(), sp: z.number(), ep: z.number(), gp: z.number(), pp: z.number() }),
});
export type CharacterState = z.infer<typeof CharacterStateSchema>;

export const InventoryEntrySchema = z.object({
  id: z.string(),
  itemId: z.string(),
  quantity: z.number(),
  equipped: z.boolean(),
  attuned: z.boolean(),
  customName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;

export const CustomBonusSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  effects: z.array(EffectSchema),
});
export type CustomBonus = z.infer<typeof CustomBonusSchema>;

export const CharacterSchema = z.object({
  id: z.string(),
  build: CharacterBuildSchema,
  state: CharacterStateSchema,
  inventory: z.array(InventoryEntrySchema),
  custom: z.array(CustomBonusSchema),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Character = z.infer<typeof CharacterSchema>;

export function newBuild(name = "New Character"): CharacterBuild {
  return {
    version: 1,
    name,
    options: { sources: ["official"], featsAllowed: true, customizeOrigin: false, optionalFeatures: false },
    abilities: { method: "pointbuy", base: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } },
    speciesId: null,
    subspeciesId: null,
    customAsi: {},
    backgroundId: null,
    classId: null,
    subclassId: null,
    subclasses: {},
    levels: [],
    choices: {},
    spells: { known: [], prepared: [] },
    classSpells: {},
    details: { alignment: "", age: "", appearance: "", backstory: "", notes: "" },
  };
}

export function newState(): CharacterState {
  return {
    hpCurrent: null,
    hpTemp: 0,
    slotsUsed: {},
    pactSlotsUsed: 0,
    resourcesUsed: {},
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  };
}

export { ABILITIES };
