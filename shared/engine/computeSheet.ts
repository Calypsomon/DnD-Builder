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
  const level = Math.max(0, b.levels.length);
  const classLevel = level; // prototype: single class
  const effLevel = Math.max(1, level);
  const pb = proficiencyBonus(effLevel);

  const cls = b.classId ? (idx.byId.get(b.classId) as ContentRow<ClassData> | undefined) : undefined;
  const classData = cls?.data;
  const subclass = b.subclassId ? (idx.byId.get(b.subclassId) as ContentRow<SubclassData> | undefined) : undefined;
  const species = b.speciesId ? (idx.byId.get(b.speciesId) as ContentRow<SpeciesData> | undefined) : undefined;
  const subspecies = b.subspeciesId ? (idx.byId.get(b.subspeciesId) as ContentRow<SubspeciesData> | undefined) : undefined;
  const background = b.backgroundId ? idx.byId.get(b.backgroundId) : undefined;

  if (b.classId && !cls) warnings.push(`Class ${b.classId} not found in the database.`);
  if (b.speciesId && !species) warnings.push(`Species ${b.speciesId} not found in the database.`);

  // ---------------------------------------------------------------- collect
  const effects: EffectEntry[] = [];
  const choices: ChoiceInstance[] = [];
  const featureRows: { row: ContentRow<any>; level: number; ownerName: string }[] = [];
  const activated = new Set<string>();

  // formula context; ability mods are filled in after abilities are computed
  const vars: Record<string, number> = { pb, level: effLevel, classLevel: Math.max(1, classLevel) };
  const tableRow = classData?.table?.find((r) => r.level === Math.max(1, classLevel));
  const fctx: FormulaContext = {
    vars,
    table: (col) => {
      if (!tableRow) return undefined;
      const key = Object.keys(tableRow.columns).find((k) => k.toLowerCase() === col.toLowerCase());
      return key ? tableRow.columns[key] : undefined;
    },
  };
  const evalNum = (f: string | number, fallback = 0) => safeEval(f, fctx, (m) => warnings.push(`Formula error: ${m}`), fallback);

  const suppressSpeciesAsi = !!subspecies?.data.replacesSpeciesAsi;
  const isOriginAsiSource = (row: ContentRow<any>) => row.id.startsWith("species:") || row.id.startsWith("subspecies:");

  function activate(row: ContentRow<any> | undefined, location: Location, lvl: number, ownerName?: string) {
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
      effects.push({ effect: e, source: row.name, originAsi: originAsi && e.type === "abilityIncrease" });
    }
    for (const ch of row.choices ?? []) {
      if (suppressAsi && ch.from.kind === "abilities") continue;
      handleChoice(ch, row, location, lvl, originAsi);
    }
  }

  function handleChoice(ch: Choice, owner: ContentRow<any>, location: Location, ownerLevel: number, originAsi = false) {
    const lvl = Math.max(ch.level ?? 1, ownerLevel);
    if (location === "class" && lvl > classLevel) return;
    if (originAsi && b.options.customizeOrigin && ch.from.kind === "abilities") return;
    const count = Math.max(0, Math.floor(evalNum(ch.count, 1)));
    const raw = b.choices[ch.id];
    const selected = (Array.isArray(raw) ? raw : []).slice(0, count);
    choices.push({
      key: ch.id,
      choice: ch,
      location,
      ownerId: owner.id,
      ownerName: owner.name,
      level: lvl,
      count,
      selected,
      open: selected.length < count,
    });
    for (const id of selected) {
      for (const g of ch.grants ?? []) effects.push({ effect: substitute(g, id), source: owner.name });
      if (ch.from.kind === "abilities") {
        effects.push({
          effect: { type: "abilityIncrease", ability: id as Ability, value: ch.from.amount, max: 20 },
          source: owner.name,
          originAsi,
        });
      } else if (ch.from.kind === "spells" && !ch.grants?.length) {
        effects.push({ effect: { type: "grantSpell", spellId: id, alwaysPrepared: true }, source: owner.name });
      } else {
        const target = idx.byId.get(id);
        const t = target ? idx.tableOf.get(id) : undefined;
        if (target && (t === "feats" || t === "classOptions" || t === "features")) activate(target, location, lvl, owner.name);
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

  // class
  if (cls && classData && classLevel > 0) {
    // skill choice
    const skillChoice: Choice = {
      id: skillChoiceKey(cls.id),
      label: "Skill Proficiencies",
      level: 1,
      count: classData.skillChoice?.count ?? 0,
      from: { kind: "skills", ids: classData.skillChoice?.from?.length ? classData.skillChoice.from : undefined },
      grants: [{ type: "proficiency", kind: "skill", ids: ["$id"] }],
    };
    if ((classData.skillChoice?.count ?? 0) > 0) handleChoice(skillChoice, cls, "class", 1);

    // optional class features (Tasha's) only when enabled in the options
    for (const f of idx.featuresByOwner.get(cls.id) ?? []) {
      if (f.data.level <= classLevel && (!f.data.optional || b.options.optionalFeatures)) activate(f, "class", f.data.level, cls.name);
    }
    // subclass
    if (classLevel >= (classData.subclassLevel || 99)) {
      choices.push({
        key: subclassChoiceKey(cls.id),
        choice: { id: subclassChoiceKey(cls.id), label: classData.subclassLabel || "Subclass", level: classData.subclassLevel, count: 1, from: { kind: "subclass", classId: cls.id } },
        location: "class",
        ownerId: cls.id,
        ownerName: cls.name,
        level: classData.subclassLevel,
        count: 1,
        selected: subclass ? [subclass.id] : [],
        open: !subclass,
      });
      if (subclass) {
        activate(subclass, "class", classData.subclassLevel);
        for (const f of idx.featuresByOwner.get(subclass.id) ?? []) {
          if (f.data.level <= classLevel && (!f.data.optional || b.options.optionalFeatures)) activate(f, "class", f.data.level, subclass.name);
        }
      }
    } else if (subclass) {
      warnings.push(`${subclass.name} is only available from level ${classData.subclassLevel}.`);
    }
    // ability score improvements
    for (const lvl of classData.asiLevels ?? []) {
      if (lvl > classLevel) continue;
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
        count: 1,
        selected: asi?.kind === "feat" ? [asi.featId] : [],
        asi,
        isAsi: true,
        open: !asi || (asi.kind === "asi" && Object.values(asi.increases).reduce((s, v) => s + (v ?? 0), 0) < 2) || (asi.kind === "feat" && !asi.featId),
      });
      if (asi?.kind === "asi") {
        for (const [ab, v] of Object.entries(asi.increases)) {
          if (v) effects.push({ effect: { type: "abilityIncrease", ability: ab as Ability, value: v, max: 20 }, source: `ASI (level ${lvl})` });
        }
      } else if (asi?.kind === "feat" && asi.featId) {
        activate(idx.byId.get(asi.featId), "class", lvl, `Feat (level ${lvl})`);
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
    vars[a] = abilities[a].mod;
    vars[`${a}Score`] = score.total;
  }
  const mod = (a: Ability) => abilities[a].mod;

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
  const profs = {
    skill: new Set<string>(),
    save: new Set<string>(classData?.saves ?? []),
    armor: new Set<string>(classData?.proficiencies?.armor ?? []),
    weapon: new Set<string>(classData?.proficiencies?.weapons ?? []),
    tool: new Set<string>(classData?.proficiencies?.tools ?? []),
    language: new Set<string>(species?.data.languages ?? []),
  };
  const expertise = new Set<string>();
  let halfProfChecks = false;
  let halfProfInit = false;
  const bonuses: { target: string; value: number; label: string; when?: Condition }[] = [];
  const acFormulas: { name: string; formula: string; allowsShield: boolean; when?: Condition }[] = [];
  const speedEffects: { e: Extract<Effect, { type: "speed" }>; source: string }[] = [];
  const senses = new Map<string, number>();
  const defenses = { resistance: new Set<string>(), immunity: new Set<string>(), vulnerability: new Set<string>() };
  let hpPerLevel: StatPart[] = [];
  const resources: SheetResource[] = [];
  const granted: { spellId: string; alwaysPrepared: boolean; source: string }[] = [];
  const attackOptions: { e: Extract<Effect, { type: "attackOption" }>; source: string }[] = [];

  if (species?.data.darkvision) senses.set("darkvision", species.data.darkvision);
  if (subspecies?.data.darkvision) senses.set("darkvision", Math.max(senses.get("darkvision") ?? 0, subspecies.data.darkvision));

  for (const { effect: e, source } of effects) {
    switch (e.type) {
      case "bonus": {
        const value = typeof e.value === "number" ? e.value : evalNum(e.value);
        bonuses.push({ target: e.target, value, label: source, when: e.when });
        break;
      }
      case "acFormula":
        acFormulas.push({ name: e.name ?? source, formula: e.formula, allowsShield: e.allowsShield, when: e.when });
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
      case "hpPerLevel":
        hpPerLevel.push({ label: `${source} (${e.value} × level)`, value: e.value * effLevel });
        break;
      case "resource": {
        if (resources.some((r) => r.id === e.id)) break;
        // a table cell such as "Unlimited" (Rage at level 20) means no limit
        const tableCell = typeof e.max === "string" && /^\s*table:/.test(e.max) ? evalText(e.max, fctx) : "";
        const unlimited = /unlimited|∞/i.test(tableCell);
        const max = unlimited ? 0 : Math.max(0, Math.floor(evalNum(e.max)));
        let die = e.die ? evalText(e.die, fctx) : undefined;
        if (die && /^\d+$/.test(die)) die = `d${die}`;
        const recharge = e.shortRestFromLevel && classLevel >= e.shortRestFromLevel ? "short" : e.recharge;
        resources.push({ id: e.id, name: e.name, max, unlimited, recharge, die, source });
        break;
      }
      case "grantSpell":
        if (!e.minLevel || e.minLevel <= effLevel) granted.push({ spellId: e.spellId, alwaysPrepared: e.alwaysPrepared, source });
        break;
      case "attackOption":
        attackOptions.push({ e, source });
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
    candidates.push({ parts: [{ label: f.name, value: evalNum(f.formula) }], allowsShield: f.allowsShield });
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
  const hitDie = classData?.hitDie ?? 8;
  const hpParts: StatPart[] = [];
  if (classLevel > 0) {
    let dice = 0;
    b.levels.forEach((l, i) => {
      if (i === 0) dice += hitDie;
      else dice += l.hp === "max" ? hitDie : l.hp === "avg" ? hitDie / 2 + 1 : Math.max(1, Math.min(hitDie, Number(l.hp) || 1));
    });
    hpParts.push({ label: `Hit dice (d${hitDie})`, value: dice });
    hpParts.push({ label: `CON modifier × ${classLevel}`, value: mod("con") * classLevel });
  }
  hpParts.push(...hpPerLevel, ...bonusParts(["hp.max"]));
  const hpMax = stat(hpParts);
  if (classLevel > 0 && hpMax.total < classLevel) hpMax.total = classLevel;

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
  const isMonk = cls?.id === "class:monk";
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
    if (monkWeapon) {
      const ma = fctx.table?.("Martial Arts");
      if (ma && /d\d+/.test(ma) && dieAvg(ma) > dieAvg(die)) die = ma;
    }
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
  for (const { e, source } of attackOptions.filter((o) => o !== unarmedOption)) attacks.push(optionAttack(e, source));
  if (unarmedOption) attacks.push(optionAttack(unarmedOption.e, unarmedOption.source));
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

  function optionAttack(e: Extract<Effect, { type: "attackOption" }>, source: string): SheetAttack {
    const ability: Ability = e.ability === "best" ? (mod("dex") > mod("str") ? "dex" : "str") : e.ability;
    const die = evalText(e.damage, fctx) || "1";
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
  let spellcasting: SheetSpellcasting | null = null;
  const spells: SheetSpell[] = [];
  const spellRow = (id: string) => idx.byId.get(id) as ContentRow<SpellData> | undefined;
  const third = subclass ? THIRD_CASTER_SUBCLASSES[subclass.id] : undefined;
  const sc = classData?.spellcasting;
  if (cls && classLevel > 0 && (sc || (third && classLevel >= 3))) {
    const type = sc?.type ?? "third";
    const ability: Ability = sc?.ability ?? third!.ability;
    const modeKind = sc?.mode ?? "known";
    const slots = type === "pact" ? new Array(10).fill(0) : spellSlots(type, classLevel);
    const pact = type === "pact" ? pactSlots(classLevel) : undefined;
    let maxSpellLevel = 0;
    slots.forEach((n, i) => {
      if (n > 0) maxSpellLevel = i;
    });
    if (pact) maxSpellLevel = pact.level;
    const cantripsMax = sc ? cellNumber(fctx.table?.("Cantrips Known")) : THIRD_CASTER_CANTRIPS[classLevel];
    const knownMax = modeKind === "known" ? (sc ? cellNumber(fctx.table?.("Spells Known")) : THIRD_CASTER_KNOWN[classLevel]) : undefined;
    const preparedMax = modeKind !== "known" && sc?.preparedFormula ? Math.max(1, Math.floor(evalNum(sc.preparedFormula, 1))) : undefined;
    const spellbookMin = modeKind === "spellbook" ? 6 + 2 * (classLevel - 1) : undefined;
    const extraSpellIds = (subclass?.data.spells ?? []).filter((s) => !s.alwaysPrepared && s.level <= classLevel).flatMap((s) => s.spellIds);
    spellcasting = {
      classId: cls.id,
      ability,
      mode: modeKind,
      dc: stat([{ label: "Base", value: 8 }, { label: "Proficiency", value: pb }, { label: `${ability.toUpperCase()} modifier`, value: mod(ability) }, ...bonusParts(["spellDc"])]),
      attack: stat([{ label: "Proficiency", value: pb }, { label: `${ability.toUpperCase()} modifier`, value: mod(ability) }, ...bonusParts(["attack.spell"])]),
      slots,
      pact,
      maxSpellLevel,
      cantripsMax,
      knownMax,
      preparedMax,
      spellbookMin,
      lists: sc ? [cls.id] : third!.lists,
      extraSpellIds,
      ritual: sc?.ritual ?? false,
      counts: { cantrips: 0, known: 0, prepared: 0 },
    };
  }
  const seen = new Set<string>();
  // always prepared (subclass spells)
  for (const group of subclass?.data.spells ?? []) {
    if (!group.alwaysPrepared || group.level > classLevel) continue;
    for (const id of group.spellIds) {
      const s = spellRow(id);
      if (!s || seen.has(id)) continue;
      seen.add(id);
      spells.push(sheetSpell(s, "always", true, subclass!.name));
    }
  }
  for (const g of granted) {
    const s = spellRow(g.spellId);
    if (!s || seen.has(g.spellId)) continue;
    seen.add(g.spellId);
    spells.push(sheetSpell(s, "granted", true, g.source));
  }
  if (spellcasting) {
    const prepared = new Set(b.spells.prepared);
    const ids = [...new Set([...b.spells.known, ...b.spells.prepared])];
    for (const id of ids) {
      const s = spellRow(id);
      if (!s) {
        warnings.push(`Spell ${id} not found.`);
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      const isCantrip = s.data.level === 0;
      const isPrepared = isCantrip || spellcasting.mode === "known" || prepared.has(id);
      spells.push(sheetSpell(s, "class", isPrepared));
      if (isCantrip) spellcasting.counts.cantrips++;
      else {
        if (b.spells.known.includes(id)) spellcasting.counts.known++;
        if (spellcasting.mode !== "known" && prepared.has(id)) spellcasting.counts.prepared++;
        if (s.data.level > spellcasting.maxSpellLevel) warnings.push(`${s.name} is level ${s.data.level}; you can cast up to level ${spellcasting.maxSpellLevel}.`);
      }
    }
    const c = spellcasting.counts;
    if (c.cantrips > spellcasting.cantripsMax) warnings.push(`Too many cantrips (${c.cantrips}/${spellcasting.cantripsMax}).`);
    if (spellcasting.knownMax != null && c.known > spellcasting.knownMax) warnings.push(`Too many spells known (${c.known}/${spellcasting.knownMax}).`);
    if (spellcasting.preparedMax != null && c.prepared > spellcasting.preparedMax) warnings.push(`Too many prepared spells (${c.prepared}/${spellcasting.preparedMax}).`);
  }
  spells.sort((x, y) => x.level - y.level || x.name.localeCompare(y.name));

  function sheetSpell(s: ContentRow<SpellData>, origin: SheetSpell["origin"], isPrepared: boolean, sourceLabel?: string): SheetSpell {
    return {
      id: s.id,
      name: s.name,
      level: s.data.level,
      origin,
      prepared: isPrepared,
      ritual: s.data.ritual,
      concentration: s.data.concentration,
      sourceLabel,
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

  const summary = [subspecies?.name ?? species?.name, cls ? `${cls.name} ${classLevel}` : null].filter(Boolean).join(" ") || "New character";

  return {
    level: effLevel,
    classLevel,
    pb,
    hitDie,
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
