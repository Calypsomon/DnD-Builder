/**
 * Reference characters R1–R5 (docs/BAUPLAN_PROTOTYP.md section 12).
 * Runs against the imported database (data/dndbuilder.db); skipped when no data is imported.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBundle, openDb, ROOT } from "../../server/db/client";
import { indexContent, type ContentIndex } from "../../shared/engine/contentIndex";
import { computeSheet } from "../../shared/engine/computeSheet";
import { type Character, type CharacterBuild, newBuild, newState } from "../../shared/types/character";
import type { Sheet } from "../../shared/types/sheet";

const dbPath = resolve(ROOT, "data/dndbuilder.db");
let idx: ContentIndex | null = null;
if (existsSync(dbPath)) {
  const db = openDb(dbPath);
  const bundle = loadBundle(db);
  db.close();
  if (bundle.classes.length) idx = indexContent(bundle);
}

type Spec = {
  build: Partial<CharacterBuild> & Pick<CharacterBuild, "abilities">;
  levels: number;
  choices?: CharacterBuild["choices"];
  inventory?: { itemId: string; equipped?: boolean }[];
  custom?: Character["custom"];
  spells?: CharacterBuild["spells"];
};

function make(spec: Spec): { sheet: Sheet; character: Character } {
  const build: CharacterBuild = { ...newBuild("Test"), ...spec.build, choices: spec.choices ?? {} };
  build.levels = Array.from({ length: spec.levels }, (_, i) => ({ classId: build.classId!, hp: i === 0 ? "max" : "avg" }));
  if (spec.spells) build.spells = spec.spells;
  const character: Character = {
    id: "test",
    build,
    state: newState(),
    inventory: (spec.inventory ?? []).map((e, i) => ({ id: `i${i}`, itemId: e.itemId, quantity: 1, equipped: e.equipped ?? true, attuned: false })),
    custom: spec.custom ?? [],
  };
  return { sheet: computeSheet(character, idx!), character };
}

const pointbuy = (str: number, dex: number, con: number, int: number, wis: number, cha: number) => ({
  method: "pointbuy" as const,
  base: { str, dex, con, int, wis, cha },
});
const standard = (str: number, dex: number, con: number, int: number, wis: number, cha: number) => ({
  method: "standard" as const,
  base: { str, dex, con, int, wis, cha },
});

describe.skipIf(!idx)("reference characters", () => {
  it("R1 – Hill Dwarf Cleric 1 (Life), Acolyte", () => {
    const { sheet } = make({
      build: {
        abilities: pointbuy(14, 8, 15, 8, 15, 10),
        speciesId: "species:dwarf",
        subspeciesId: "subspecies:dwarf:hill",
        backgroundId: "background:acolyte",
        classId: "class:cleric",
        subclassId: "subclass:cleric:life",
      },
      levels: 1,
      choices: { "class:cleric:skills": ["medicine", "persuasion"] },
      inventory: [{ itemId: "item:chain-mail" }, { itemId: "item:shield" }],
    });
    expect(sheet.pointBuy.spent).toBe(27);
    expect(sheet.abilities.con.score.total).toBe(17);
    expect(sheet.abilities.wis.score.total).toBe(16);
    expect(sheet.ac.total).toBe(18);
    expect(sheet.hpMax.total).toBe(12);
    expect(sheet.pb).toBe(2);
    expect(sheet.spellcasting!.classes[0].dc.total).toBe(13);
    expect(sheet.spellcasting!.classes[0].attack.total).toBe(5);
    expect(sheet.spellcasting!.classes[0].preparedMax).toBe(4);
    expect(sheet.spellcasting!.classes[0].cantripsMax).toBe(3);
    expect(sheet.spellcasting!.slots[1]).toBe(2);
    expect(sheet.spells.filter((s) => s.origin === "always").map((s) => s.id).sort()).toEqual(["spell:bless", "spell:cure-wounds"]);
    expect(sheet.speed.walk.total).toBe(25);
    expect(sheet.initiative.total).toBe(-1);
    expect(sheet.saves.wis.total.total).toBe(5);
    expect(sheet.saves.cha.total.total).toBe(2);
    expect(sheet.passive.perception.total).toBe(13);
    expect(sheet.senses.find((s) => s.sense === "darkvision")?.range).toBe(60);
    expect(sheet.defenses.resistance).toContain("poison");
    expect(sheet.skills.insight.prof).toBe(1);
    expect(sheet.skills.religion.prof).toBe(1);
    expect(sheet.warnings).toEqual([]);
  });

  it("R2 – Variant Human Fighter 5 (Champion), Soldier", () => {
    const { sheet } = make({
      build: {
        abilities: standard(15, 13, 14, 10, 12, 8),
        speciesId: "species:human",
        subspeciesId: "subspecies:human:variant",
        backgroundId: "background:soldier",
        classId: "class:fighter",
        subclassId: "subclass:fighter:champion",
      },
      levels: 5,
      choices: {
        "subspecies:human:variant:asi": ["str", "con"],
        "subspecies:human:variant/skills:skills": ["acrobatics"],
        "subspecies:human:variant/feat:feat": ["feat:alert"],
        "species:human:languages": ["elvish"],
        "background:soldier:tools": ["dice-set"],
        "class:fighter:skills": ["perception", "survival"],
        "class:fighter/fighting-style:choice": ["option:fighting-style:defense"],
        "class:fighter@4:asi": { kind: "asi", increases: { str: 2 } },
      },
      inventory: [{ itemId: "item:chain-mail" }, { itemId: "item:greatsword" }],
    });
    expect(sheet.abilities.str.score.total).toBe(18);
    expect(sheet.abilities.con.score.total).toBe(15);
    expect(sheet.abilities.dex.score.total).toBe(13);
    expect(sheet.ac.total).toBe(17);
    expect(sheet.hpMax.total).toBe(44);
    expect(sheet.pb).toBe(3);
    expect(sheet.initiative.total).toBe(6);
    const gs = sheet.attacks.find((a) => a.name === "Greatsword")!;
    expect(gs.toHit.total).toBe(7);
    expect(gs.damage).toBe("2d6+4");
    expect(sheet.saves.str.total.total).toBe(7);
    expect(sheet.saves.con.total.total).toBe(5);
    expect(sheet.passive.perception.total).toBe(14);
    expect(sheet.skills.acrobatics.prof).toBe(1);
    expect(sheet.resources.map((r) => r.id)).toEqual(expect.arrayContaining(["second-wind", "action-surge"]));
    expect(sheet.openChoices.map((c) => c.key)).toEqual([]);
  });

  it("R3 – Wood Elf Monk 3 (Open Hand), Hermit", () => {
    const { sheet } = make({
      build: {
        abilities: pointbuy(8, 15, 14, 10, 15, 8),
        speciesId: "species:elf",
        subspeciesId: "subspecies:elf:wood",
        backgroundId: "background:hermit",
        classId: "class:monk",
        subclassId: "subclass:monk:way-of-the-open-hand",
      },
      levels: 3,
      choices: { "class:monk:skills": ["acrobatics", "insight"] },
    });
    expect(sheet.abilities.dex.score.total).toBe(17);
    expect(sheet.abilities.wis.score.total).toBe(16);
    expect(sheet.ac.total).toBe(16);
    expect(sheet.hpMax.total).toBe(24);
    expect(sheet.speed.walk.total).toBe(45);
    const unarmed = sheet.attacks.find((a) => a.name === "Unarmed Strike")!;
    expect(unarmed.toHit.total).toBe(5);
    expect(unarmed.damage).toBe("1d4+3");
    expect(sheet.resources.find((r) => /ki/i.test(r.name))?.max).toBe(3);
    expect(sheet.saves.str.total.total).toBe(1);
    expect(sheet.saves.dex.total.total).toBe(5);
    expect(sheet.passive.perception.total).toBe(15);
    expect(sheet.initiative.total).toBe(3);
  });

  it("R4 – High Elf Wizard 5 (Evocation), Sage", () => {
    const { sheet } = make({
      build: {
        abilities: pointbuy(8, 14, 14, 15, 10, 10),
        speciesId: "species:elf",
        subspeciesId: "subspecies:elf:high",
        backgroundId: "background:sage",
        classId: "class:wizard",
        subclassId: "subclass:wizard:school-of-evocation",
      },
      levels: 5,
      choices: {
        "class:wizard:skills": ["insight", "investigation"],
        "class:wizard@4:asi": { kind: "asi", increases: { int: 2 } },
      },
    });
    expect(sheet.abilities.int.score.total).toBe(18);
    expect(sheet.abilities.dex.score.total).toBe(16);
    expect(sheet.ac.total).toBe(13);
    expect(sheet.hpMax.total).toBe(32);
    expect(sheet.pb).toBe(3);
    const sc = sheet.spellcasting!.classes[0];
    expect(sc.dc.total).toBe(15);
    expect(sc.attack.total).toBe(7);
    expect(sheet.spellcasting!.slots.slice(1, 4)).toEqual([4, 3, 2]);
    expect(sc.cantripsMax).toBe(4);
    expect(sc.preparedMax).toBe(9);
    expect(sc.spellbookMin).toBe(14);
    expect(sheet.saves.int.total.total).toBe(7);
    expect(sheet.saves.wis.total.total).toBe(3);
    expect(sheet.passive.perception.total).toBe(13);
    expect(sheet.initiative.total).toBe(3);
    expect(sheet.resources.find((r) => /arcane recovery/i.test(r.name))?.max).toBe(1);
  });

  it("R5 – Mountain Dwarf Barbarian 6 (Berserker), Outlander, with homebrew", () => {
    // homebrew weapon added to the index for this test
    const axe = {
      id: "custom:items:test-axe",
      name: "Frostbite Axe",
      source: "Custom",
      sourceKind: "homebrew" as const,
      origin: "custom" as const,
      description: "",
      data: {
        category: "weapon" as const,
        weapon: { category: "martial" as const, range: "melee" as const, damage: "1d12", damageType: "slashing", properties: ["heavy", "two-handed"], magicBonus: 1 },
      },
      effects: [],
      choices: [],
    };
    idx!.byId.set(axe.id, axe);
    idx!.tableOf.set(axe.id, "items");
    const { sheet } = make({
      build: {
        abilities: standard(15, 13, 14, 8, 12, 10),
        speciesId: "species:dwarf",
        subspeciesId: "subspecies:dwarf:mountain",
        backgroundId: "background:outlander",
        classId: "class:barbarian",
        subclassId: "subclass:barbarian:path-of-the-berserker",
      },
      levels: 6,
      choices: {
        "class:barbarian:skills": ["intimidation", "perception"],
        "class:barbarian@4:asi": { kind: "asi", increases: { str: 1, con: 1 } },
      },
      inventory: [{ itemId: axe.id }],
      custom: [{ id: "c1", name: "Lucky charm", description: "", effects: [{ type: "bonus", target: "initiative", value: 1 }] }],
    });
    expect(sheet.abilities.str.score.total).toBe(18);
    expect(sheet.abilities.con.score.total).toBe(17);
    expect(sheet.ac.total).toBe(14);
    expect(sheet.hpMax.total).toBe(65);
    expect(sheet.pb).toBe(3);
    expect(sheet.speed.walk.total).toBe(35);
    const a = sheet.attacks.find((x) => x.name === "Frostbite Axe")!;
    expect(a.toHit.total).toBe(8);
    expect(a.damage).toBe("1d12+5");
    expect(sheet.resources.find((r) => r.id === "rage")?.max).toBe(4);
    expect(sheet.saves.str.total.total).toBe(7);
    expect(sheet.saves.con.total.total).toBe(6);
    expect(sheet.initiative.total).toBe(2);
    expect(sheet.passive.perception.total).toBe(14);
    expect(sheet.defenses.resistance).toContain("poison");
  });

  it("scales resource dice and handles unlimited rage", () => {
    const bard = make({
      build: { abilities: pointbuy(8, 14, 14, 10, 10, 15), speciesId: "species:human", classId: "class:bard" },
      levels: 5,
    }).sheet;
    const bi = bard.resources.find((r) => r.id === "bardic-inspiration")!;
    expect(bi.die).toBe("d8");
    expect(bi.recharge).toBe("short");
    const bard1 = make({ build: { abilities: pointbuy(8, 14, 14, 10, 10, 15), speciesId: "species:human", classId: "class:bard" }, levels: 1 }).sheet;
    expect(bard1.resources.find((r) => r.id === "bardic-inspiration")!.die).toBe("d6");
    expect(bard1.resources.find((r) => r.id === "bardic-inspiration")!.recharge).toBe("long");

    const barb = make({ build: { abilities: standard(15, 13, 14, 8, 12, 10), speciesId: "species:human", classId: "class:barbarian" }, levels: 20 }).sheet;
    const rage = barb.resources.find((r) => r.id === "rage")!;
    expect(rage.unlimited).toBe(true);
    expect(rage.die).toBe("+4");
  });

  it("applies optional class features only when enabled", () => {
    const base = { abilities: standard(15, 13, 14, 8, 12, 10), speciesId: "species:human", classId: "class:barbarian" };
    const off = make({ build: base, levels: 3 }).sheet;
    expect(off.features.some((f) => /primal knowledge/i.test(f.name))).toBe(false);
    const on = make({ build: { ...base, options: { sources: ["official"], featsAllowed: true, customizeOrigin: false, optionalFeatures: true } }, levels: 3 }).sheet;
    expect(on.features.some((f) => /primal knowledge/i.test(f.name))).toBe(true);
  });
});
