import { z } from "zod";

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export const AbilitySchema = z.enum(ABILITIES);
export type Ability = z.infer<typeof AbilitySchema>;

/** Formula string, e.g. "10 + dex + con", "level", "max(1, cha)", "table:Rages". See shared/engine/formula.ts */
export const FormulaSchema = z.string();
export type Formula = string;

export const ConditionSchema = z.enum([
  "always",
  "noArmor",
  /** no body armor and no shield (Monk) */
  "unarmored",
  "noHeavyArmor",
  "wearingArmor",
  "noShield",
  "itemEquipped",
  "itemAttuned",
  "oneHandedMeleeOnly",
  "rangedWeapon",
]);
export type Condition = z.infer<typeof ConditionSchema>;

/**
 * Bonus targets:
 * "ac" | "initiative" | "hp.max" | "save.all" | "save.<ability>" | "skill.<skillId>" | "skill.all"
 * "passive.perception" | "passive.investigation" | "passive.insight"
 * "attack.melee" | "attack.ranged" | "attack.spell" | "attack.all"
 * "damage.melee" | "damage.ranged" | "damage.all" | "spellDc" | "speed.walk"
 */
export const BonusTargetSchema = z.string();
export type BonusTarget = string;

export const RechargeSchema = z.enum(["short", "long", "dawn", "none"]);

export const EffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("abilityIncrease"), ability: AbilitySchema, value: z.number(), max: z.number().optional() }),
  z.object({ type: z.literal("abilitySet"), ability: AbilitySchema, value: z.number() }),
  z.object({
    type: z.literal("bonus"),
    target: BonusTargetSchema,
    value: z.union([z.number(), FormulaSchema]),
    when: ConditionSchema.optional(),
  }),
  z.object({
    type: z.literal("acFormula"),
    name: z.string().optional(),
    formula: FormulaSchema,
    allowsShield: z.boolean(),
    when: ConditionSchema.optional(),
  }),
  z.object({
    type: z.literal("proficiency"),
    kind: z.enum(["skill", "save", "armor", "weapon", "tool", "language"]),
    ids: z.array(z.string()),
  }),
  z.object({ type: z.literal("expertise"), skills: z.array(z.string()) }),
  z.object({ type: z.literal("halfProficiency"), scope: z.enum(["abilityChecks", "initiative"]) }),
  z.object({
    type: z.literal("speed"),
    mode: z.enum(["walk", "fly", "swim", "climb", "burrow"]),
    op: z.enum(["add", "set", "equalWalk"]),
    value: z.number().optional(),
    when: ConditionSchema.optional(),
  }),
  z.object({
    type: z.literal("sense"),
    sense: z.enum(["darkvision", "blindsight", "tremorsense", "truesight"]),
    range: z.number(),
  }),
  z.object({
    type: z.literal("damageDefense"),
    kind: z.enum(["resistance", "immunity", "vulnerability"]),
    damageTypes: z.array(z.string()),
  }),
  z.object({ type: z.literal("hpPerLevel"), value: z.number() }),
  z.object({
    type: z.literal("resource"),
    id: z.string(),
    name: z.string(),
    max: z.union([z.number(), FormulaSchema]),
    recharge: RechargeSchema,
    /** e.g. Bardic Inspiration: recharges on a short rest from class level 5 (Font of Inspiration) */
    shortRestFromLevel: z.number().optional(),
    /** die size; a formula that evaluates to a number N becomes "dN" (e.g. "min(12, 6 + 2 * floor(level / 5))") */
    die: FormulaSchema.optional(),
  }),
  z.object({
    type: z.literal("grantSpell"),
    spellId: z.string(),
    alwaysPrepared: z.boolean(),
    ability: AbilitySchema.optional(),
    minLevel: z.number().optional(),
    uses: z.object({ max: z.union([z.number(), FormulaSchema]), recharge: RechargeSchema }).optional(),
  }),
  z.object({
    type: z.literal("attackOption"),
    name: z.string(),
    ability: z.union([AbilitySchema, z.literal("best")]),
    damage: FormulaSchema,
    damageType: z.string(),
    proficient: z.boolean().optional(),
  }),
  z.object({ type: z.literal("note"), text: z.string() }),
]);
export type Effect = z.infer<typeof EffectSchema>;

export const ChoiceFromSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("list"), ids: z.array(z.string()) }),
  z.object({ kind: z.literal("skills"), ids: z.array(z.string()).optional() }),
  z.object({ kind: z.literal("tools"), ids: z.array(z.string()).optional() }),
  z.object({ kind: z.literal("languages"), ids: z.array(z.string()).optional() }),
  z.object({ kind: z.literal("classOptions"), group: z.string(), classId: z.string().optional() }),
  z.object({ kind: z.literal("feats") }),
  z.object({
    kind: z.literal("spells"),
    lists: z.array(z.string()).optional(),
    maxLevel: z.union([z.number(), FormulaSchema]).optional(),
    minLevel: z.number().optional(),
    school: z.array(z.string()).optional(),
    ritual: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("asiOrFeat") }),
  z.object({ kind: z.literal("subclass"), classId: z.string() }),
  z.object({ kind: z.literal("abilities"), amount: z.number(), distinct: z.boolean(), ids: z.array(AbilitySchema).optional() }),
]);
export type ChoiceFrom = z.infer<typeof ChoiceFromSchema>;

/**
 * A choice the player has to make. `grants` are applied once per chosen element;
 * "$id" inside grants is replaced by the chosen id (e.g. proficiency in the chosen skill).
 */
export const ChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  level: z.number().default(1),
  count: z.union([z.number(), FormulaSchema]),
  from: ChoiceFromSchema,
  grants: z.array(EffectSchema).optional(),
});
export type Choice = z.infer<typeof ChoiceSchema>;
