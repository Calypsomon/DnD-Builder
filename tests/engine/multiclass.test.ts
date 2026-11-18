/**
 * Multiclassing rules (PHB 2014), checked against the imported database.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBundle, openDb, ROOT } from "../../server/db/client";
import { computeSheet } from "../../shared/engine/computeSheet";
import { type ContentIndex, indexContent } from "../../shared/engine/contentIndex";
import { type Character, type CharacterBuild, newBuild, newState } from "../../shared/types/character";

const dbPath = resolve(ROOT, "data/dndbuilder.db");
let idx: ContentIndex | null = null;
if (existsSync(dbPath)) {
  const db = openDb(dbPath);
  const bundle = loadBundle(db);
  db.close();
  if (bundle.classes.length) idx = indexContent(bundle);
}

/** levels: e.g. [["fighter", 5], ["wizard", 2]] in the order they were taken */
function make(base: Record<string, number>, levels: [string, number][], extra: Partial<CharacterBuild> = {}) {
  const build: CharacterBuild = {
    ...newBuild("MC"),
    abilities: { method: "manual", base: base as CharacterBuild["abilities"]["base"] },
    speciesId: "species:human",
    ...extra,
  };
  build.levels = levels.flatMap(([c, n]) => Array.from({ length: n }, () => ({ classId: `class:${c}`, hp: "avg" as const })));
  build.levels[0].hp = "max";
  build.classId = build.levels[0].classId;
  const character: Character = { id: "t", build, state: newState(), inventory: [], custom: [] };
  return computeSheet(character, idx!);
}

describe.skipIf(!idx)("multiclassing", () => {
  it("Fighter 5 / Wizard 2: hit dice, saves, single-caster slots, choice levels", () => {
    // human +1 to all → STR 16, DEX 13, CON 15, INT 14, WIS 11, CHA 9
    const s = make({ str: 15, dex: 12, con: 14, int: 13, wis: 10, cha: 8 }, [
      ["fighter", 5],
      ["wizard", 2],
    ]);
    expect(s.level).toBe(7);
    expect(s.pb).toBe(3);
    expect(s.summary).toBe("Human Fighter 5 / Wizard 2");
    expect(s.hitDice).toBe("5d10 + 2d6");
    expect(s.hpMax.total).toBe(10 + 4 * 6 + 2 * 4 + 2 * 7);
    expect(s.proficiencies.saves.sort()).toEqual(["con", "str"]);
    expect(s.saves.int.total.total).toBe(2);
    const sc = s.spellcasting!;
    expect(sc.multiclassCasterLevel).toBeUndefined();
    expect(sc.slots[1]).toBe(3);
    expect(sc.slots[2]).toBe(0);
    const wiz = sc.classes.find((c) => c.classId === "class:wizard")!;
    expect(wiz.cantripsMax).toBe(3);
    expect(wiz.preparedMax).toBe(4);
    expect(wiz.maxSpellLevel).toBe(1);
    expect(wiz.dc.total).toBe(13);
    const sub = s.choices.find((c) => c.key === "class:wizard:subclass")!;
    expect(sub.charLevel).toBe(7);
    expect(s.choices.find((c) => c.key === "class:fighter@4:asi")!.charLevel).toBe(4);
    expect(s.choices.some((c) => c.key === "class:wizard:skills")).toBe(false);
    expect(s.warnings.filter((w) => /Multiclassing/.test(w))).toEqual([]);
  });

  it("Paladin 6 / Warlock 2: own slots plus pact magic, class-level formulas", () => {
    const s = make({ str: 15, dex: 10, con: 13, int: 8, wis: 12, cha: 14 }, [
      ["paladin", 6],
      ["warlock", 2],
    ]);
    const sc = s.spellcasting!;
    expect(sc.slots.slice(1, 3)).toEqual([4, 2]);
    expect(sc.pact).toEqual({ slots: 2, level: 1 });
    expect(sc.classes.map((c) => c.classId)).toEqual(["class:paladin", "class:warlock"]);
    expect(sc.classes[1].cantripsMax).toBe(2);
    expect(sc.classes[1].knownMax).toBe(3);
    expect(s.proficiencies.saves.sort()).toEqual(["cha", "wis"]);
    // Lay on Hands uses the paladin level (6), not the character level (8)
    expect(s.resources.find((r) => /lay on hands/i.test(r.name))?.max).toBe(30);
  });

  it("Cleric 3 / Wizard 3: combined slot table, spells learned per class", () => {
    const s = make(
      { str: 8, dex: 12, con: 14, int: 13, wis: 15, cha: 10 },
      [
        ["cleric", 3],
        ["wizard", 3],
      ],
      { classSpells: { "class:cleric": { known: [], prepared: ["spell:cure-wounds"] }, "class:wizard": { known: ["spell:magic-missile", "spell:shield"], prepared: ["spell:shield"] } } },
    );
    const sc = s.spellcasting!;
    expect(sc.multiclassCasterLevel).toBe(6);
    expect(sc.slots.slice(1, 4)).toEqual([4, 3, 3]);
    expect(sc.classes.every((c) => c.maxSpellLevel === 2)).toBe(true);
    expect(s.hpMax.total).toBe(8 + 2 * 5 + 3 * 4 + 2 * 6);
    const cleric = sc.classes.find((c) => c.classId === "class:cleric")!;
    const wizard = sc.classes.find((c) => c.classId === "class:wizard")!;
    expect(cleric.counts.prepared).toBe(1);
    expect(wizard.counts.known).toBe(2);
    expect(wizard.counts.prepared).toBe(1);
    expect(s.spells.find((x) => x.id === "spell:magic-missile")?.classId).toBe("class:wizard");
  });

  it("Eldritch Knight 3 / Wizard 3: third caster counts a third", () => {
    const s = make(
      { str: 15, dex: 12, con: 14, int: 13, wis: 10, cha: 8 },
      [
        ["fighter", 3],
        ["wizard", 3],
      ],
      { subclasses: { "class:fighter": "subclass:fighter:eldritch-knight" } },
    );
    const sc = s.spellcasting!;
    expect(sc.multiclassCasterLevel).toBe(4);
    expect(sc.slots.slice(1, 3)).toEqual([4, 3]);
    const ek = sc.classes.find((c) => c.classId === "class:fighter")!;
    expect(ek.maxSpellLevel).toBe(1);
    expect(ek.cantripsMax).toBe(2);
  });

  it("warns when multiclass prerequisites are not met", () => {
    const s = make({ str: 15, dex: 12, con: 14, int: 9, wis: 10, cha: 8 }, [
      ["fighter", 1],
      ["wizard", 1],
    ]);
    expect(s.warnings.some((w) => /Wizard requires INT 13/.test(w))).toBe(true);
  });

  it("gives only multiclass proficiencies to later classes", () => {
    const rogue = make({ str: 15, dex: 14, con: 13, int: 10, wis: 10, cha: 8 }, [
      ["fighter", 1],
      ["rogue", 1],
    ]);
    expect(rogue.proficiencies.saves.sort()).toEqual(["con", "str"]);
    expect(rogue.proficiencies.tools).toContain("thieves-tools");
    const mc = rogue.choices.find((c) => c.key === "class:rogue:mc-skills")!;
    expect(mc.count).toBe(1);
    expect(rogue.choices.some((c) => c.key === "class:rogue:skills")).toBe(false);

    const wizardFirst = make({ str: 13, dex: 14, con: 13, int: 15, wis: 10, cha: 8 }, [
      ["wizard", 1],
      ["fighter", 1],
    ]);
    expect(wizardFirst.proficiencies.armor.sort()).toEqual(["light", "medium", "shields"]);
    expect(wizardFirst.proficiencies.saves.sort()).toEqual(["int", "wis"]);

    const bard = make({ str: 15, dex: 12, con: 13, int: 10, wis: 10, cha: 14 }, [
      ["fighter", 1],
      ["bard", 1],
    ]);
    expect(bard.choices.find((c) => c.key === "class:bard:mc-tools")?.count).toBe(1);
  });
});
