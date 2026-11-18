import type { AsiChoice, CharacterBuild, CustomBonus, InventoryEntry } from "../types/character";
import type { ClassData, ContentRow, FeatData, ItemData, SpeciesData, SpellData, SubclassData, SubspeciesData } from "../types/content";
import { SKILLS } from "../types/content";
import type { Ability, Choice, Condition, Effect } from "../types/effects";
import { ABILITIES } from "../types/effects";
import type {
  ChoiceInstance,
  ProfLevel,
  Sheet,
  SheetAttack,
  SheetCasting,
  SheetClassInfo,
  SheetFeature,
  SheetResource,
  SheetSpell,
  SheetSpellcasting,
  Stat,
  StatPart,
} from "../types/sheet";
import {
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  STANDARD_ARRAY,
  THIRD_CASTER_CANTRIPS,
  THIRD_CASTER_KNOWN,
  THIRD_CASTER_SUBCLASSES,
  abilityMod,
  pactSlots,
  proficiencyBonus,
  spellSlots,
  titleCase,
} from "../rules/tables";
import { MULTICLASS_PROFICIENCIES, meetsPrereq, multiclassCasterLevel, prereqText } from "../rules/multiclass";
import { classLevels, classOrder, firstClassId, levelMap, spellsOf, subclassOf } from "./buildHelpers";
import type { ContentIndex } from "./contentIndex";
import { type FormulaContext, cellNumber, evalText, safeEval } from "./formula";

export interface ComputeInput {
  build: CharacterBuild;
  inventory: InventoryEntry[];
  custom: CustomBonus[];
}

type Location = ChoiceInstance["location"];

interface EffectEntry {
  effect: Effect;
  source: string;
  /** effect comes from an item; conditions itemEquipped/itemAttuned refer to it */
  item?: InventoryEntry;
  /** effect from species/subspecies ASI (skipped with Customize Origin) */
  originAsi?: boolean;
  /** class the effect belongs to: formulas use that class's level and table */
  classId?: string;
}

interface ClassCtx {
  id: string;
  row: ContentRow<ClassData>;
  data: ClassData;
  level: number;
  subclass?: ContentRow<SubclassData>;
  first: boolean;
}

const stat = (parts: StatPart[]): Stat => ({ total: parts.reduce((s, p) => s + p.value, 0), parts: parts.filter((p) => p.value !== 0 || p.label === "Base") });
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function asiChoiceKey(classId: string, level: number) {
  return `${classId}@${level}:asi`;
}
export function skillChoiceKey(classId: string) {
  return `${classId}:skills`;
}
export function subclassChoiceKey(classId: string) {
  return `${classId}:subclass`;
}

/** Replace "$id" in a grant effect with the chosen id */
function substitute(effect: Effect, id: string): Effect {
  return JSON.parse(JSON.stringify(effect).replace(/"\$id"/g, JSON.stringify(id)));
}

export function computeSheet(input: ComputeInput, idx: ContentIndex): Sheet {
  const { build: b, inventory, custom } = input;
  const warnings: string[] = [];
  const notes: string[] = [];
  const totalLevels = b.levels.length;
  const effLevel = Math.max(1, totalLevels);
  const pb = proficiencyBonus(effLevel);
  const lmap = levelMap(b);
  const lvls = classLevels(b);
  const firstId = firstClassId(b);

  // classes in the order they were taken
  const classes: ClassCtx[] = [];
  for (const id of classOrder(b)) {
    const row = idx.byId.get(id) as ContentRow<ClassData> | undefined;
    if (!row) {
      warnings.push(`Class ${id} not found in the database.`);
      continue;
    }
    const subId = subclassOf(b, id);
    const subclass = subId ? (idx.byId.get(subId) as ContentRow<SubclassData> | undefined) : undefined;
    classes.push({ id, row, data: row.data, level: lvls[id] ?? 0, subclass, first: id === firstId });
  }
  const classById = new Map(classes.map((c) => [c.id, c]));
  const firstClass = classes.find((c) => c.first);

  const species = b.speciesId ? (idx.byId.get(b.speciesId) as ContentRow<SpeciesData> | undefined) : undefined;
  const subspecies = b.subspeciesId ? (idx.byId.get(b.subspeciesId) as ContentRow<SubspeciesData> | undefined) : undefined;
  const background = b.backgroundId ? idx.byId.get(b.backgroundId) : undefined;
  if (b.speciesId && !species) warnings.push(`Species ${b.speciesId} not found in the database.`);

  // ---------------------------------------------------------------- formula contexts
  // ability modifiers are filled in once abilities are computed
  const baseVars: Record<string, number> = { pb, level: effLevel, classLevel: effLevel, charLevel: effLevel };
  /** Class effects see their own class level as "level" and read their own class table */
  const ctxFor = (classId?: string): FormulaContext => {
    const c = classId ? classById.get(classId) : undefined;
    if (!c) return { vars: { ...baseVars } };
    const lv = Math.max(1, c.level);
    const row = c.data.table?.find((r) => r.level === lv);
    return {
      vars: { ...baseVars, level: lv, classLevel: lv },
      table: (col) => {
        if (!row) return undefined;
        const key = Object.keys(row.columns).find((k) => k.toLowerCase() === col.toLowerCase());
        return key ? row.columns[key] : undefined;
      },
    };
  };
  const evalNum = (f: string | number, classId?: string, fallback = 0) => safeEval(f, ctxFor(classId), (m) => warnings.push(`Formula error: ${m}`), fallback);
  const evalTxt = (f: string, classId?: string) => evalText(f, ctxFor(classId));
  const levelIn = (classId?: string) => (classId ? classById.get(classId)?.level ?? 0 : effLevel);
  const charLevelFor = (classId: string | undefined, lvl: number) =>
    classId ? lmap.find((m) => m.classId === classId && m.classLevel === lvl)?.charLevel ?? lvl : 1;

  // ---------------------------------------------------------------- collect
  const effects: EffectEntry[] = [];
  const choices: ChoiceInstance[] = [];
  const featureRows: { row: ContentRow<any>; level: number; ownerName: string }[] = [];
  const activated = new Set<string>();

  const suppressSpeciesAsi = !!subspecies?.data.replacesSpeciesAsi;
  const isOriginAsiSource = (row: ContentRow<any>) => row.id.startsWith("species:") || row.id.startsWith("subspecies:");

  function activate(row: ContentRow<any> | undefined, location: Location, lvl: number, ownerName?: string, classId?: string) {
    if (!row || activated.has(row.id)) return;
    activated.add(row.id);
    const table = idx.tableOf.get(row.id);
    if (table === "features" || table === "feats" || table === "classOptions") {
      featureRows.push({ row, level: lvl, ownerName: ownerName ?? row.name });
    }
    const originAsi = isOriginAsiSource(row) || (table === "features" && /^(species|subspecies):/.test(row.data?.ownerId ?? ""));
    // a subrace like Variant Human replaces the species' own ability score increases
    const suppressAsi = suppressSpeciesAsi && (row.id === species?.id || row.data?.ownerId === species?.id);
    for (const e of row.effects ?? []) {
      if (suppressAsi && e.type === "abilityIncrease") continue;
      effects.push({ effect: e, source: row.name, originAsi: originAsi && e.type === "abilityIncrease", classId });
    }
    for (const ch of row.choices ?? []) {
      if (suppressAsi && ch.from.kind === "abilities") continue;
      handleChoice(ch, row, location, lvl, originAsi, classId);
    }
  }

  function handleChoice(ch: Choice, owner: ContentRow<any>, location: Location, ownerLevel: number, originAsi = false, classId?: string) {
    const lvl = Math.max(ch.level ?? 1, ownerLevel);
    if (location === "class" && classId && lvl > levelIn(classId)) return;
    if (originAsi && b.options.customizeOrigin && ch.from.kind === "abilities") return;
    const count = Math.max(0, Math.floor(evalNum(ch.count, classId, 1)));
    const raw = b.choices[ch.id];
    const selected = (Array.isArray(raw) ? raw : []).slice(0, count);
    choices.push({
      key: ch.id,
      choice: ch,
      location,
      ownerId: owner.id,
      ownerName: owner.name,
      level: lvl,
      classId,
      charLevel: charLevelFor(classId, lvl),
      count,
      selected,
      open: selected.length < count,
    });
    for (const id of selected) {
      for (const g of ch.grants ?? []) effects.push({ effect: substitute(g, id), source: owner.name, classId });
      if (ch.from.kind === "abilities") {
        effects.push({
          effect: { type: "abilityIncrease", ability: id as Ability, value: ch.from.amount, max: 20 },
          source: owner.name,
          originAsi,
        });
      } else if (ch.from.kind === "spells" && !ch.grants?.length) {
        effects.push({ effect: { type: "grantSpell", spellId: id, alwaysPrepared: true }, source: owner.name, classId });
      } else {
        const target = idx.byId.get(id);
        const t = target ? idx.tableOf.get(id) : undefined;
        if (target && (t === "feats" || t === "classOptions" || t === "features")) activate(target, location, lvl, owner.name, classId);
      }
    }
  }

  // species & subspecies
  if (species) {
    activate(species, "origin", 1);
    for (const f of idx.featuresByOwner.get(species.id) ?? []) activate(f, "origin", 1, species.name);
  }
  if (subspecies) {
    activate(subspecies, "origin", 1);
    for (const f of idx.featuresByOwner.get(subspecies.id) ?? []) activate(f, "origin", 1, subspecies.name);
  }
  if (b.options.customizeOrigin) {
    for (const [ab, v] of Object.entries(b.customAsi ?? {})) {
      if (v) effects.push({ effect: { type: "abilityIncrease", ability: ab as Ability, value: v }, source: "Customized origin" });
    }
  }
  // background
  if (background) {
    activate(background, "background", 1);
    for (const f of idx.featuresByOwner.get(background.id) ?? []) activate(f, "background", 1, background.name);
  }

  // classes
  const mcProfs = { armor: [] as string[], weapons: [] as string[], tools: [] as string[] };
  for (const c of classes) {
    if (c.level <= 0) continue;
    const { row: cls, data } = c;
    if (c.first) {
      if ((data.skillChoice?.count ?? 0) > 0) {
        handleChoice(
          {
            id: skillChoiceKey(cls.id),
            label: "Skill Proficiencies",
            level: 1,
            count: data.skillChoice.count,
            from: { kind: "skills", ids: data.skillChoice.from?.length ? data.skillChoice.from : undefined },
            grants: [{ type: "proficiency", kind: "skill", ids: ["$id"] }],
          },
          cls,
          "class",
          1,
          false,
          cls.id,
        );
      }
    } else {
      // multiclassing: only some proficiencies of the new class
      const mc = MULTICLASS_PROFICIENCIES[cls.id];
      if (mc) {
        mcProfs.armor.push(...mc.armor);
        mcProfs.weapons.push(...mc.weapons);
        mcProfs.tools.push(...mc.tools);
        if (mc.skills) {
          handleChoice(
            {
              id: `${cls.id}:mc-skills`,
              label: "Skill Proficiency (multiclass)",
              level: 1,
              count: mc.skills.count,
              from: { kind: "skills", ids: mc.skills.any ? undefined : data.skillChoice?.from },
              grants: [{ type: "proficiency", kind: "skill", ids: ["$id"] }],
            },
            cls,
            "class",
            1,
            false,
            cls.id,
          );
        }
        if (mc.toolChoice) {
          handleChoice(
            {
              id: `${cls.id}:mc-tools`,
              label: `${mc.toolChoice.label} (multiclass)`,
              level: 1,
              count: mc.toolChoice.count,
              from: { kind: "tools", ids: mc.toolChoice.ids },
              grants: [{ type: "proficiency", kind: "tool", ids: ["$id"] }],
            },
            cls,
            "class",
            1,
            false,
            cls.id,
          );
        }
      }
    }

    // class features (optional Tasha's features only when enabled)
    for (const f of idx.featuresByOwner.get(cls.id) ?? []) {
      if (f.data.level <= c.level && (!f.data.optional || b.options.optionalFeatures)) activate(f, "class", f.data.level, cls.name, cls.id);
    }
    // subclass
    if (c.level >= (data.subclassLevel || 99)) {
      choices.push({
        key: subclassChoiceKey(cls.id),
        choice: { id: subclassChoiceKey(cls.id), label: data.subclassLabel || "Subclass", level: data.subclassLevel, count: 1, from: { kind: "subclass", classId: cls.id } },
        location: "class",
        ownerId: cls.id,
        ownerName: cls.name,
        level: data.subclassLevel,
        classId: cls.id,
        charLevel: charLevelFor(cls.id, data.subclassLevel),
        count: 1,
        selected: c.subclass ? [c.subclass.id] : [],
        open: !c.subclass,
      });
      if (c.subclass) {
        activate(c.subclass, "class", data.subclassLevel, undefined, cls.id);
        for (const f of idx.featuresByOwner.get(c.subclass.id) ?? []) {
          if (f.data.level <= c.level && (!f.data.optional || b.options.optionalFeatures)) activate(f, "class", f.data.level, c.subclass.name, cls.id);
        }
      }
    } else if (c.subclass) {
      warnings.push(`${c.subclass.name} is only available from ${cls.name} level ${data.subclassLevel}.`);
    }
    // ability score improvements (per class level)
    for (const lvl of data.asiLevels ?? []) {
      if (lvl > c.level) continue;
      const key = asiChoiceKey(cls.id, lvl);
      const sel = b.choices[key] as AsiChoice | undefined;
      const asi = sel && !Array.isArray(sel) ? sel : undefined;
      choices.push({
        key,
        choice: { id: key, label: "Ability Score Improvement", level: lvl, count: 1, from: { kind: "asiOrFeat" } },
        location: "class",
        ownerId: cls.id,
        ownerName: cls.name,
        level: lvl,
        classId: cls.id,
        charLevel: charLevelFor(cls.id, lvl),
        count: 1,
        selected: asi?.kind === "feat" ? [asi.featId] : [],
        asi,
        isAsi: true,
        open: !asi || (asi.kind === "asi" && Object.values(asi.increases).reduce((s, v) => s + (v ?? 0), 0) < 2) || (asi.kind === "feat" && !asi.featId),
      });
      const label = classes.length > 1 ? `ASI (${cls.name} ${lvl})` : `ASI (level ${lvl})`;
      if (asi?.kind === "asi") {
        for (const [ab, v] of Object.entries(asi.increases)) {
          if (v) effects.push({ effect: { type: "abilityIncrease", ability: ab as Ability, value: v, max: 20 }, source: label });
        }
      } else if (asi?.kind === "feat" && asi.featId) {
        activate(idx.byId.get(asi.featId), "class", lvl, `Feat (${cls.name} ${lvl})`, cls.id);
      }
    }
  }

  // items
  let attunedCount = 0;
  let carriedWeight = 0;
  const equippedItems: { entry: InventoryEntry; item: ContentRow<ItemData> }[] = [];
  for (const entry of inventory) {
    const item = idx.byId.get(entry.itemId) as ContentRow<ItemData> | undefined;
    if (!item) {
      warnings.push(`Inventory item ${entry.itemId} not found.`);
      continue;
    }
    carriedWeight += (item.data.weightLb ?? 0) * entry.quantity;
    if (entry.attuned) attunedCount++;
    if (entry.equipped) equippedItems.push({ entry, item });
    const active = item.data.attunement ? entry.attuned : entry.equipped || entry.attuned;
    if (active) for (const e of item.effects ?? []) effects.push({ effect: e, source: entry.customName || item.name, item: entry });
  }
  if (attunedCount > 3) warnings.push(`You are attuned to ${attunedCount} items (maximum 3).`);

  // custom bonuses
  for (const c of custom) for (const e of c.effects) effects.push({ effect: e, source: c.name });

  // ---------------------------------------------------------------- abilities
  const scoreParts: Record<Ability, StatPart[]> = {} as any;
  for (const a of ABILITIES) scoreParts[a] = [{ label: "Base", value: b.abilities.base[a] }];
  const incs = effects.filter((e) => e.effect.type === "abilityIncrease" && !(e.originAsi && b.options.customizeOrigin));
  // fixed increases first (species), then capped ones (ASIs, feats)
  incs.sort((x, y) => Number((x.effect as any).max != null) - Number((y.effect as any).max != null));
  for (const e of incs) {
    const eff = e.effect as Extract<Effect, { type: "abilityIncrease" }>;
    const current = scoreParts[eff.ability].reduce((s, p) => s + p.value, 0);
    let v = eff.value;
    if (eff.max != null && current + v > eff.max) v = Math.max(0, eff.max - current);
    if (v !== eff.value) warnings.push(`${titleCase(eff.ability).toUpperCase()} increase from ${e.source} capped at ${eff.max}.`);
    scoreParts[eff.ability].push({ label: e.source, value: v });
  }
  for (const e of effects) {
    if (e.effect.type !== "abilitySet") continue;
    const eff = e.effect;
    const current = scoreParts[eff.ability].reduce((s, p) => s + p.value, 0);
    if (eff.value > current) scoreParts[eff.ability].push({ label: `${e.source} (sets to ${eff.value})`, value: eff.value - current });
  }
  const abilities = {} as Sheet["abilities"];
  for (const a of ABILITIES) {
    const score = stat(scoreParts[a]);
    abilities[a] = { score, mod: abilityMod(score.total) };
    baseVars[a] = abilities[a].mod;
    baseVars[`${a}Score`] = score.total;
  }
  const mod = (a: Ability) => abilities[a].mod;

  // multiclass prerequisites (checked against the current scores)
  if (classes.length > 1) {
    const scores = Object.fromEntries(ABILITIES.map((a) => [a, abilities[a].score.total])) as Record<Ability, number>;
    for (const c of classes) {
      if (!meetsPrereq(c.id, scores)) warnings.push(`Multiclassing into or out of ${c.row.name} requires ${prereqText(c.id)}.`);
    }
  }

  // ---------------------------------------------------------------- equipment state & conditions
  const bodyArmor = equippedItems.find((x) => x.item.data.armor && x.item.data.armor.type !== "shield");
  const shield = equippedItems.find((x) => x.item.data.armor?.type === "shield");
  const condition = (when: Condition | undefined, ctx: { ranged?: boolean; oneHanded?: boolean } = {}): boolean => {
    switch (when ?? "always") {
      case "always":
      case "itemEquipped":
      case "itemAttuned":
        return true;
      case "noArmor":
        return !bodyArmor;
      case "unarmored":
        return !bodyArmor && !shield;
      case "noHeavyArmor":
        return bodyArmor?.item.data.armor?.type !== "heavy";
      case "wearingArmor":
        return !!bodyArmor;
      case "noShield":
        return !shield;
      case "rangedWeapon":
        return !!ctx.ranged;
      case "oneHandedMeleeOnly":
        return !!ctx.oneHanded;
      default:
        return true;
    }
  };

  // ---------------------------------------------------------------- gather effect kinds
  const fd = firstClass?.data;
  const profs = {
    skill: new Set<string>(),
    // saving throws only from the first class
    save: new Set<string>(fd?.saves ?? []),
    armor: new Set<string>([...(fd?.proficiencies?.armor ?? []), ...mcProfs.armor]),
    weapon: new Set<string>([...(fd?.proficiencies?.weapons ?? []), ...mcProfs.weapons]),
    tool: new Set<string>([...(fd?.proficiencies?.tools ?? []), ...mcProfs.tools]),
    language: new Set<string>(species?.data.languages ?? []),
  };
  const expertise = new Set<string>();
  let halfProfChecks = false;
  let halfProfInit = false;
  const bonuses: { target: string; value: number; label: string; when?: Condition }[] = [];
  const acFormulas: { name: string; value: number; allowsShield: boolean; when?: Condition }[] = [];
  const speedEffects: { e: Extract<Effect, { type: "speed" }>; source: string }[] = [];
  const senses = new Map<string, number>();
  const defenses = { resistance: new Set<string>(), immunity: new Set<string>(), vulnerability: new Set<string>() };
  const hpPerLevel: StatPart[] = [];
  const resources: SheetResource[] = [];
  const granted: { spellId: string; alwaysPrepared: boolean; source: string }[] = [];
  const attackOptions: { e: Extract<Effect, { type: "attackOption" }>; source: string; classId?: string }[] = [];

  if (species?.data.darkvision) senses.set("darkvision", species.data.darkvision);
  if (subspecies?.data.darkvision) senses.set("darkvision", Math.max(senses.get("darkvision") ?? 0, subspecies.data.darkvision));

  for (const { effect: e, source, classId } of effects) {
    switch (e.type) {
      case "bonus": {
        const value = typeof e.value === "number" ? e.value : evalNum(e.value, classId);
        bonuses.push({ target: e.target, value, label: source, when: e.when });
        break;
      }
      case "acFormula":
        acFormulas.push({ name: e.name ?? source, value: evalNum(e.formula, classId), allowsShield: e.allowsShield, when: e.when });
        break;
      case "proficiency":
        for (const id of e.ids) profs[e.kind].add(id);
        break;
      case "expertise":
        for (const s of e.skills) expertise.add(s);
        break;
      case "halfProficiency":
        halfProfChecks = true;
        halfProfInit = true;
        break;
      case "speed":
        speedEffects.push({ e, source });
        break;
      case "sense":
        senses.set(e.sense, Math.max(senses.get(e.sense) ?? 0, e.range));
        break;
      case "damageDefense":
        for (const d of e.damageTypes) defenses[e.kind].add(d);
        break;
      case "hpPerLevel": {
        // class features count class levels (Draconic Resilience), everything else character levels
        const n = Math.max(1, levelIn(classId));
        hpPerLevel.push({ label: `${source} (${e.value} × ${n})`, value: e.value * n });
        break;
      }
      case "resource": {
        if (resources.some((r) => r.id === e.id)) break;
        // a table cell such as "Unlimited" (Rage at level 20) means no limit
        const tableCell = typeof e.max === "string" && /^\s*table:/.test(e.max) ? evalTxt(e.max, classId) : "";
        const unlimited = /unlimited|∞/i.test(tableCell);
        const max = unlimited ? 0 : Math.max(0, Math.floor(evalNum(e.max, classId)));
        let die = e.die ? evalTxt(e.die, classId) : undefined;
        if (die && /^\d+$/.test(die)) die = `d${die}`;
        const recharge = e.shortRestFromLevel && levelIn(classId) >= e.shortRestFromLevel ? "short" : e.recharge;
        resources.push({ id: e.id, name: e.name, max, unlimited, recharge, die, source });
        break;
      }
      case "grantSpell":
        if (!e.minLevel || e.minLevel <= levelIn(classId)) granted.push({ spellId: e.spellId, alwaysPrepared: e.alwaysPrepared, source });
        break;
      case "attackOption":
        attackOptions.push({ e, source, classId });
        break;
      case "note":
        notes.push(`${source}: ${e.text}`);
        break;
    }
  }

  const bonusParts = (targets: string[], ctx: { ranged?: boolean; oneHanded?: boolean } = {}): StatPart[] =>
    bonuses.filter((x) => targets.includes(x.target) && condition(x.when, ctx)).map((x) => ({ label: x.label, value: x.value }));

  // ---------------------------------------------------------------- saves & skills
  const saves = {} as Sheet["saves"];
  for (const a of ABILITIES) {
    const proficient = profs.save.has(a);
    saves[a] = {
      proficient,
      total: stat([
        { label: `${a.toUpperCase()} modifier`, value: mod(a) },
        ...(proficient ? [{ label: "Proficiency", value: pb }] : []),
        ...bonusParts(["save.all", `save.${a}`]),
      ]),
    };
  }
  const skills: Sheet["skills"] = {};
  for (const [skill, ab] of Object.entries(SKILLS)) {
    const prof: ProfLevel = expertise.has(skill) ? 2 : profs.skill.has(skill) ? 1 : halfProfChecks ? 0.5 : 0;
    const profLabel = prof === 2 ? "Expertise" : prof === 1 ? "Proficiency" : "Half proficiency";
    skills[skill] = {
      ability: ab,
      prof,
      total: stat([
        { label: `${ab.toUpperCase()} modifier`, value: mod(ab) },
        ...(prof ? [{ label: profLabel, value: Math.floor(pb * prof) }] : []),
        ...bonusParts(["skill.all", `skill.${skill}`]),
      ]),
    };
  }
  const passive = (skill: string, target: string): Stat =>
    stat([{ label: "Base", value: 10 }, { label: titleCase(skill), value: skills[skill].total.total }, ...bonusParts([target])]);

  // ---------------------------------------------------------------- initiative
  const initiative = stat([
    { label: "DEX modifier", value: mod("dex") },
    ...(halfProfInit ? [{ label: "Half proficiency", value: Math.floor(pb / 2) }] : []),
    ...bonusParts(["initiative"]),
  ]);

  // ---------------------------------------------------------------- armor class
  const dex = mod("dex");
  type AcCandidate = { parts: StatPart[]; allowsShield: boolean };
  const candidates: AcCandidate[] = [];
  if (bodyArmor) {
    const a = bodyArmor.item.data.armor!;
    const dexPart = a.dexCap === null || a.dexCap === undefined ? dex : Math.min(dex, a.dexCap);
    candidates.push({
      parts: [
        { label: bodyArmor.entry.customName || bodyArmor.item.name, value: a.baseAc },
        { label: "DEX modifier", value: a.dexCap === 0 ? 0 : dexPart },
        ...(a.magicBonus ? [{ label: "Magic bonus", value: a.magicBonus }] : []),
      ],
      allowsShield: true,
    });
    if (!profs.armor.has(a.type)) warnings.push(`Not proficient with ${a.type} armor (${bodyArmor.item.name}).`);
  } else {
    candidates.push({ parts: [{ label: "Unarmored", value: 10 }, { label: "DEX modifier", value: dex }], allowsShield: true });
  }
  for (const f of acFormulas) {
    if (!condition(f.when)) continue;
    candidates.push({ parts: [{ label: f.name, value: f.value }], allowsShield: f.allowsShield });
  }
  const total = (c: AcCandidate) => c.parts.reduce((s, p) => s + p.value, 0);
  candidates.sort((x, y) => total(y) - total(x));
  const bestAc = candidates[0];
  const acParts = [...bestAc.parts];
  if (shield) {
    if (bestAc.allowsShield) {
      acParts.push({ label: shield.entry.customName || shield.item.name, value: shield.item.data.armor!.baseAc + (shield.item.data.armor!.magicBonus ?? 0) });
    } else notes.push(`Shield does not combine with ${bestAc.parts[0].label}.`);
    if (!profs.armor.has("shields")) warnings.push("Not proficient with shields.");
  }
  acParts.push(...bonusParts(["ac"]));
  const ac = stat(acParts);

  // ---------------------------------------------------------------- hit points
  const dieOf = (classId: string) => classById.get(classId)?.data.hitDie ?? 8;
  const hpParts: StatPart[] = [];
  if (totalLevels > 0) {
    const perClass = new Map<string, number>();
    b.levels.forEach((l, i) => {
      const hd = dieOf(l.classId);
      const v = i === 0 ? hd : l.hp === "max" ? hd : l.hp === "avg" ? hd / 2 + 1 : Math.max(1, Math.min(hd, Number(l.hp) || 1));
      perClass.set(l.classId, (perClass.get(l.classId) ?? 0) + v);
    });
    for (const [cid, v] of perClass) {
      hpParts.push({ label: `Hit dice ${classById.get(cid)?.row.name ?? ""} (${lvls[cid]}d${dieOf(cid)})`, value: v });
    }
    hpParts.push({ label: `CON modifier × ${totalLevels}`, value: mod("con") * totalLevels });
  }
  hpParts.push(...hpPerLevel, ...bonusParts(["hp.max"]));
  const hpMax = stat(hpParts);
  if (totalLevels > 0 && hpMax.total < totalLevels) hpMax.total = totalLevels;

  // ---------------------------------------------------------------- speed
  const walkParts: StatPart[] = [{ label: species?.name ?? "Base", value: species?.data.speed?.walk ?? 30 }];
  if (subspecies?.data.speedWalk) walkParts[0] = { label: subspecies.name, value: subspecies.data.speedWalk };
  const other: Record<string, number> = {};
  for (const m of ["fly", "swim", "climb", "burrow"] as const) {
    const v = species?.data.speed?.[m];
    if (v) other[m] = v;
  }
  for (const { e, source } of speedEffects) {
    if (!condition(e.when)) continue;
    if (e.mode === "walk") {
      if (e.op === "set" && e.value != null) {
        const cur = walkParts.reduce((s, p) => s + p.value, 0);
        if (e.value > cur) walkParts.push({ label: source, value: e.value - cur });
      } else if (e.op === "add") walkParts.push({ label: source, value: e.value ?? 0 });
    }
  }
  walkParts.push(...bonusParts(["speed.walk"]));
  if (bodyArmor?.item.data.armor?.strReq && abilities.str.score.total < bodyArmor.item.data.armor.strReq) {
    const dwarf = (species?.data.baseId ?? species?.id ?? "").startsWith("species:dwarf");
    if (!dwarf) walkParts.push({ label: `${bodyArmor.item.name} (STR ${bodyArmor.item.data.armor.strReq} required)`, value: -10 });
  }
  const walk = stat(walkParts);
  for (const { e } of speedEffects) {
    if (e.mode === "walk" || !condition(e.when)) continue;
    if (e.op === "equalWalk") other[e.mode] = Math.max(other[e.mode] ?? 0, walk.total);
    else if (e.op === "set") other[e.mode] = Math.max(other[e.mode] ?? 0, e.value ?? 0);
    else if (e.op === "add") other[e.mode] = (other[e.mode] ?? 0) + (e.value ?? 0);
  }

  // ---------------------------------------------------------------- attacks
  const attacks: SheetAttack[] = [];
  const weaponProficient = (item: ContentRow<ItemData>) => {
    const w = item.data.weapon!;
    const slug = item.id.replace(/^[a-z]+:/, "");
    return profs.weapon.has(w.category) || profs.weapon.has(slug) || profs.weapon.has(slug.replace(/s$/, ""));
  };
  const equippedWeapons = equippedItems.filter((x) => x.item.data.weapon);
  const isMonk = (lvls["class:monk"] ?? 0) > 0;
  const martialArtsDie = isMonk ? ctxFor("class:monk").table?.("Martial Arts") : undefined;
  for (const { entry, item } of equippedWeapons) {
    const w = item.data.weapon!;
    const ranged = w.range === "ranged";
    const props = w.properties ?? [];
    const finesse = props.includes("finesse");
    const monkWeapon = isMonk && !ranged && (item.id === "item:shortsword" || (w.category === "simple" && !props.includes("two-handed") && !props.includes("heavy")));
    let ability: Ability = ranged ? "dex" : "str";
    if ((finesse || monkWeapon) && mod("dex") > mod("str")) ability = "dex";
    const oneHanded = !ranged && !props.includes("two-handed") && equippedWeapons.length === 1;
    const ctx = { ranged, oneHanded };
    const proficient = weaponProficient(item);
    const magic = w.magicBonus ?? 0;
    const toHit = stat([
      { label: `${ability.toUpperCase()} modifier`, value: mod(ability) },
      ...(proficient ? [{ label: "Proficiency", value: pb }] : []),
      ...(magic ? [{ label: "Magic bonus", value: magic }] : []),
      ...bonusParts(["attack.all", ranged ? "attack.ranged" : "attack.melee"], ctx),
    ]);
    const dmgBonus = mod(ability) + magic + bonusParts(["damage.all", ranged ? "damage.ranged" : "damage.melee"], ctx).reduce((s, p) => s + p.value, 0);
    let die = w.damage || "1";
    if (monkWeapon && martialArtsDie && /d\d+/.test(martialArtsDie) && dieAvg(martialArtsDie) > dieAvg(die)) die = martialArtsDie;
    const fmt = (d: string) => (dmgBonus ? `${d}${signed(dmgBonus)}` : d);
    const extraNotes: string[] = [];
    if (!proficient) extraNotes.push("not proficient");
    attacks.push({
      name: entry.customName || item.name,
      itemEntryId: entry.id,
      toHit,
      damage: fmt(die),
      damageType: w.damageType,
      versatileDamage: w.versatile ? fmt(w.versatile) : undefined,
      range: w.rangeNormal ? `${w.rangeNormal}/${w.rangeLong ?? w.rangeNormal} ft.` : props.includes("reach") ? "10 ft." : "5 ft.",
      properties: props,
      notes: extraNotes,
    });
  }
  // unarmed strike (may be replaced by an attack option with the same name)
  const unarmedOption = attackOptions.find((o) => o.e.name.toLowerCase() === "unarmed strike");
  for (const o of attackOptions.filter((o) => o !== unarmedOption)) attacks.push(optionAttack(o.e, o.source, o.classId));
  if (unarmedOption) attacks.push(optionAttack(unarmedOption.e, unarmedOption.source, unarmedOption.classId));
  else {
    const strMod = mod("str");
    attacks.push({
      name: "Unarmed Strike",
      toHit: stat([{ label: "STR modifier", value: strMod }, { label: "Proficiency", value: pb }, ...bonusParts(["attack.all", "attack.melee"])]),
      damage: String(Math.max(0, 1 + strMod)),
      damageType: "bludgeoning",
      range: "5 ft.",
      properties: [],
      notes: [],
    });
  }

  function optionAttack(e: Extract<Effect, { type: "attackOption" }>, source: string, classId?: string): SheetAttack {
    const ability: Ability = e.ability === "best" ? (mod("dex") > mod("str") ? "dex" : "str") : e.ability;
    const die = evalTxt(e.damage, classId) || "1";
    const bonus = mod(ability);
    return {
      name: e.name,
      toHit: stat([
        { label: `${ability.toUpperCase()} modifier`, value: mod(ability) },
        ...(e.proficient !== false ? [{ label: "Proficiency", value: pb }] : []),
        ...bonusParts(["attack.all", "attack.melee"]),
      ]),
      damage: /^\d+$/.test(die) ? String(Number(die) + bonus) : bonus ? `${die}${signed(bonus)}` : die,
      damageType: e.damageType,
      range: "5 ft.",
      properties: [],
      notes: [source],
    };
  }

  // ---------------------------------------------------------------- spellcasting
  const spells: SheetSpell[] = [];
  const spellRow = (id: string) => idx.byId.get(id) as ContentRow<SpellData> | undefined;
  const casterClasses: SheetSpellcasting[] = [];
  const casterTypes: { type: string; level: number }[] = [];
  let pact: { slots: number; level: number } | undefined;
  for (const c of classes) {
    if (c.level <= 0) continue;
    const sc = c.data.spellcasting;
    const third = c.subclass ? THIRD_CASTER_SUBCLASSES[c.subclass.id] : undefined;
    if (!sc && !(third && c.level >= 3)) continue;
    const type = sc?.type ?? "third";
    casterTypes.push({ type, level: c.level });
    const ctx = ctxFor(c.id);
    const ability: Ability = sc?.ability ?? third!.ability;
    const modeKind = sc?.mode ?? "known";
    // spells known/prepared are determined per class as if single-classed
    let maxSpellLevel = 0;
    if (type === "pact") {
      pact = pactSlots(c.level);
      maxSpellLevel = pact.level;
    } else {
      spellSlots(type, c.level).forEach((n, i) => {
        if (n > 0) maxSpellLevel = i;
      });
    }
    casterClasses.push({
      classId: c.id,
      className: c.row.name,
      classLevel: c.level,
      ability,
      mode: modeKind,
      dc: stat([{ label: "Base", value: 8 }, { label: "Proficiency", value: pb }, { label: `${ability.toUpperCase()} modifier`, value: mod(ability) }, ...bonusParts(["spellDc"])]),
      attack: stat([{ label: "Proficiency", value: pb }, { label: `${ability.toUpperCase()} modifier`, value: mod(ability) }, ...bonusParts(["attack.spell"])]),
      maxSpellLevel,
      cantripsMax: sc ? cellNumber(ctx.table?.("Cantrips Known")) : THIRD_CASTER_CANTRIPS[Math.min(20, c.level)],
      knownMax: modeKind === "known" ? (sc ? cellNumber(ctx.table?.("Spells Known")) : THIRD_CASTER_KNOWN[Math.min(20, c.level)]) : undefined,
      preparedMax: modeKind !== "known" && sc?.preparedFormula ? Math.max(1, Math.floor(evalNum(sc.preparedFormula, c.id, 1))) : undefined,
      spellbookMin: modeKind === "spellbook" ? 6 + 2 * (c.level - 1) : undefined,
      lists: sc ? [c.id] : third!.lists,
      extraSpellIds: (c.subclass?.data.spells ?? []).filter((s) => !s.alwaysPrepared && s.level <= c.level).flatMap((s) => s.spellIds),
      ritual: sc?.ritual ?? false,
      counts: { cantrips: 0, known: 0, prepared: 0 },
    });
  }
  let spellcasting: SheetCasting | null = null;
  if (casterClasses.length) {
    const slotCasters = casterTypes.filter((t) => t.type !== "pact");
    let slots = new Array(10).fill(0);
    let mcLevel: number | undefined;
    if (slotCasters.length === 1) slots = spellSlots(slotCasters[0].type, slotCasters[0].level);
    else if (slotCasters.length > 1) {
      mcLevel = multiclassCasterLevel(slotCasters);
      slots = spellSlots("full", mcLevel);
    }
    let maxSlotLevel = 0;
    slots.forEach((n, i) => {
      if (n > 0) maxSlotLevel = i;
    });
    if (pact) maxSlotLevel = Math.max(maxSlotLevel, pact.level);
    spellcasting = { slots, pact, maxSlotLevel, multiclassCasterLevel: mcLevel, classes: casterClasses };
  }

  const seen = new Set<string>();
  // always prepared (subclass spells)
  for (const c of classes) {
    for (const group of c.subclass?.data.spells ?? []) {
      if (!group.alwaysPrepared || group.level > c.level) continue;
      for (const id of group.spellIds) {
        const s = spellRow(id);
        if (!s || seen.has(id)) continue;
        seen.add(id);
        spells.push(sheetSpell(s, "always", true, c.subclass!.name, c.id));
      }
    }
  }
  for (const g of granted) {
    const s = spellRow(g.spellId);
    if (!s || seen.has(g.spellId)) continue;
    seen.add(g.spellId);
    spells.push(sheetSpell(s, "granted", true, g.source));
  }
  for (const sc of casterClasses) {
    const own = spellsOf(b, sc.classId);
    const prepared = new Set(own.prepared);
    for (const id of [...new Set([...own.known, ...own.prepared])]) {
      const s = spellRow(id);
      if (!s) {
        warnings.push(`Spell ${id} not found.`);
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      const isCantrip = s.data.level === 0;
      const isPrepared = isCantrip || sc.mode === "known" || prepared.has(id);
      spells.push(sheetSpell(s, "class", isPrepared, casterClasses.length > 1 ? sc.className : undefined, sc.classId));
      if (isCantrip) sc.counts.cantrips++;
      else {
        if (own.known.includes(id)) sc.counts.known++;
        if (sc.mode !== "known" && prepared.has(id)) sc.counts.prepared++;
        if (s.data.level > sc.maxSpellLevel) warnings.push(`${s.name} is level ${s.data.level}; as a ${sc.className} you can learn up to level ${sc.maxSpellLevel}.`);
      }
    }
    const n = sc.counts;
    const who = casterClasses.length > 1 ? ` (${sc.className})` : "";
    if (n.cantrips > sc.cantripsMax) warnings.push(`Too many cantrips${who} (${n.cantrips}/${sc.cantripsMax}).`);
    if (sc.knownMax != null && n.known > sc.knownMax) warnings.push(`Too many spells known${who} (${n.known}/${sc.knownMax}).`);
    if (sc.preparedMax != null && n.prepared > sc.preparedMax) warnings.push(`Too many prepared spells${who} (${n.prepared}/${sc.preparedMax}).`);
  }
  spells.sort((x, y) => x.level - y.level || x.name.localeCompare(y.name));

  function sheetSpell(s: ContentRow<SpellData>, origin: SheetSpell["origin"], isPrepared: boolean, sourceLabel?: string, classId?: string): SheetSpell {
    return {
      id: s.id,
      name: s.name,
      level: s.data.level,
      origin,
      prepared: isPrepared,
      ritual: s.data.ritual,
      concentration: s.data.concentration,
      sourceLabel,
      classId,
    };
  }

  // ---------------------------------------------------------------- features
  const features: SheetFeature[] = featureRows.map(({ row, level: lvl, ownerName }) => ({
    id: row.id,
    name: row.name,
    level: row.data?.level ?? lvl,
    ownerType: idx.tableOf.get(row.id) === "feats" ? "feat" : idx.tableOf.get(row.id) === "classOptions" ? "option" : row.data?.ownerType ?? "feature",
    ownerName,
    description: row.description,
    source: row.source,
  }));

  // ---------------------------------------------------------------- validation
  const pointBuy = { spent: 0, budget: POINT_BUY_BUDGET };
  if (b.abilities.method === "pointbuy") {
    for (const a of ABILITIES) {
      const v = b.abilities.base[a];
      if (POINT_BUY_COST[v] === undefined) warnings.push(`Point buy: ${a.toUpperCase()} must be between 8 and 15.`);
      pointBuy.spent += POINT_BUY_COST[v] ?? 0;
    }
    if (pointBuy.spent > POINT_BUY_BUDGET) warnings.push(`Point buy: ${pointBuy.spent}/${POINT_BUY_BUDGET} points spent.`);
  } else if (b.abilities.method === "standard") {
    const vals = ABILITIES.map((a) => b.abilities.base[a]).sort((x, y) => y - x);
    if (vals.join() !== STANDARD_ARRAY.join()) warnings.push("Standard array: each value (15, 14, 13, 12, 10, 8) must be used exactly once.");
  }
  for (const f of featureRows) {
    if (idx.tableOf.get(f.row.id) !== "feats") continue;
    const data = f.row.data as FeatData;
    for (const req of data.prereqAbilities ?? []) {
      if (!req.abilities.some((a) => abilities[a].score.total >= req.min)) {
        warnings.push(`${f.row.name} requires ${req.abilities.map((a) => a.toUpperCase()).join(" or ")} ${req.min}.`);
      }
    }
  }
  const carryCapacity = abilities.str.score.total * 15;
  if (carriedWeight > carryCapacity) warnings.push(`Carrying ${carriedWeight} lb (capacity ${carryCapacity} lb).`);

  const classInfo: SheetClassInfo[] = classes.map((c) => ({
    classId: c.id,
    name: c.row.name,
    level: c.level,
    hitDie: c.data.hitDie,
    subclassId: c.subclass?.id ?? null,
    subclassName: c.subclass?.name ?? null,
  }));
  const classText = classInfo.map((c) => `${c.name} ${c.level}`).join(" / ");
  const summary = [subspecies?.name ?? species?.name, classText || null].filter(Boolean).join(" ") || "New character";
  const hitDice = classInfo.map((c) => `${c.level}d${c.hitDie}`).join(" + ");

  return {
    level: effLevel,
    classLevel: totalLevels,
    classes: classInfo,
    hitDice,
    pb,
    hitDie: firstClass?.data.hitDie ?? 8,
    abilities,
    saves,
    skills,
    passive: {
      perception: passive("perception", "passive.perception"),
      investigation: passive("investigation", "passive.investigation"),
      insight: passive("insight", "passive.insight"),
    },
    initiative,
    ac,
    hpMax,
    speed: { walk, ...other },
    senses: [...senses.entries()].map(([sense, range]) => ({ sense, range })),
    defenses: {
      resistance: [...defenses.resistance],
      immunity: [...defenses.immunity],
      vulnerability: [...defenses.vulnerability],
    },
    proficiencies: {
      armor: [...profs.armor],
      weapons: [...profs.weapon],
      tools: [...profs.tool],
      languages: [...profs.language],
      saves: [...profs.save] as Ability[],
    },
    attacks,
    spellcasting,
    spells,
    resources,
    features,
    notes,
    choices,
    openChoices: choices.filter((c) => c.open),
    warnings,
    attunedCount,
    carriedWeight,
    carryCapacity,
    pointBuy,
    summary,
  };
}

function dieAvg(d: string): number {
  const m = d.match(/(\d+)d(\d+)/);
  return m ? (Number(m[1]) * (Number(m[2]) + 1)) / 2 : Number(d) || 0;
}
