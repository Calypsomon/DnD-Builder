import { describe, expect, it } from "vitest";
import { readCached } from "../../importer/fetch";
import { parseClass } from "../../importer/parsers/class";
import { parseSubclass } from "../../importer/parsers/subclass";
import { OPTION_PAGES, parseOptionPage } from "../../importer/parsers/classOptions";

const fighterHtml = readCached("fighter");
const wizardHtml = readCached("wizard");
const warlockHtml = readCached("warlock");
const barbHtml = readCached("barbarian");
const clericHtml = readCached("cleric");
const bmHtml = readCached("fighter:battle-master");
const lifeHtml = readCached("cleric:life");

describe("fighter", () => {
  it.skipIf(!fighterHtml)("parses the class", () => {
    const p = parseClass("fighter", fighterHtml!);
    const d = p.cls.data;
    expect(d.hitDie).toBe(10);
    expect(d.saves).toEqual(["str", "con"]);
    expect(d.table).toHaveLength(20);
    expect(d.subclassLevel).toBe(3);
    expect(d.subclassLabel).toBe("Martial Archetype");
    expect(d.asiLevels).toEqual([4, 6, 8, 12, 14, 16, 19]);
    expect(d.skillChoice.count).toBe(2);
    expect(d.skillChoice.from).toContain("athletics");
    expect(d.proficiencies.armor).toEqual(expect.arrayContaining(["heavy", "shields"]));
    expect(d.proficiencies.weapons).toEqual(["simple", "martial"]);
    expect(p.subclassRefs.filter((r) => r.sourceKind === "official").length).toBeGreaterThanOrEqual(10);
    expect(p.subclassRefs.filter((r) => r.sourceKind === "ua").length).toBeGreaterThanOrEqual(3);
    const lvl = (id: string) => p.features.find((f) => f.id === id)?.data.level;
    expect(lvl("class:fighter/second-wind")).toBe(1);
    expect(lvl("class:fighter/action-surge")).toBe(2);
    expect(lvl("class:fighter/extra-attack")).toBe(5);
    const fs = p.features.find((f) => f.id === "class:fighter/fighting-style")!;
    expect(fs.choices[0].from).toMatchObject({ kind: "classOptions", group: "fighting-style" });
    const archery = p.classOptions.find((o) => o.id === "option:fighting-style:archery")!;
    expect(archery.source).toBe("PHB");
    const bf = p.classOptions.find((o) => o.id === "option:fighting-style:blind-fighting")!;
    expect(bf.source).toBe("TCE");
    expect(bf.sourceKind).toBe("official");
  });
});

describe("other classes", () => {
  it.skipIf(!wizardHtml)("wizard", () => {
    const d = parseClass("wizard", wizardHtml!).cls.data;
    expect(d.table[0].columns).toHaveProperty("Cantrips Known");
    for (const k of ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"]) expect(d.table[0].columns).toHaveProperty(k);
    expect(d.table[4].columns["3rd"]).toBe("2");
    expect(d.table[0].columns["2nd"]).toBe("");
    expect(d.subclassLevel).toBe(2);
    expect(d.spellcasting?.mode).toBe("spellbook");
  });
  it.skipIf(!warlockHtml)("warlock", () => {
    const p = parseClass("warlock", warlockHtml!);
    expect(p.cls.data.spellcasting?.type).toBe("pact");
    for (const k of ["Spell Slots", "Slot Level", "Invocations Known"]) expect(p.cls.data.table[0].columns).toHaveProperty(k);
    expect(p.classOptions.filter((o) => o.data.group === "pact-boon").length).toBeGreaterThanOrEqual(4);
    expect(p.features.find((f) => f.id === "class:warlock/eldritch-invocations")?.choices[0].count).toBe("table:Invocations Known");
  });
  it.skipIf(!barbHtml)("barbarian", () => {
    const d = parseClass("barbarian", barbHtml!).cls.data;
    expect(d.table[5].columns["Rages"]).toBe("4");
  });
  it.skipIf(!clericHtml)("cleric", () => {
    expect(parseClass("cleric", clericHtml!).cls.data.subclassLevel).toBe(1);
  });
});

describe("subclasses and options", () => {
  it.skipIf(!fighterHtml || !bmHtml)("battle master", () => {
    const cls = parseClass("fighter", fighterHtml!).cls;
    const { subclass, features } = parseSubclass("fighter:battle-master", bmHtml!, cls, {
      slug: "fighter:battle-master",
      name: "Battle Master",
      source: "PHB",
      sourceKind: "official",
    });
    expect(subclass.id).toBe("subclass:fighter:battle-master");
    expect(subclass.source).toBe("PHB");
    const lvl = (s: string) => features.find((f) => f.id === `subclass:fighter:battle-master/${s}`)?.data.level;
    expect(lvl("combat-superiority")).toBe(3);
    expect(lvl("student-of-war")).toBe(3);
    expect(lvl("know-your-enemy")).toBe(7);
    expect(lvl("improved-combat-superiority")).toBe(10);
    expect(lvl("relentless")).toBe(15);
  });
  it.skipIf(!clericHtml || !lifeHtml)("cleric life spells", () => {
    const cls = parseClass("cleric", clericHtml!).cls;
    const { subclass } = parseSubclass("cleric:life", lifeHtml!, cls, { slug: "cleric:life", name: "Life", source: "PHB", sourceKind: "official" });
    const l1 = subclass.data.spells?.find((s) => s.level === 1);
    expect(l1?.spellIds).toEqual(expect.arrayContaining(["spell:bless", "spell:cure-wounds"]));
    expect(l1?.alwaysPrepared).toBe(true);
  });
  it("option pages", () => {
    for (const o of OPTION_PAGES) {
      const html = readCached(o.slug);
      if (!html) continue;
      const rows = parseOptionPage(o.slug, html, o.group, o.classIds);
      expect(rows.length).toBeGreaterThan(10);
      expect(rows[0].id.startsWith(`option:${o.group}:`)).toBe(true);
    }
    const inv = readCached("warlock:eldritch-invocations");
    if (inv) {
      const rows = parseOptionPage("warlock:eldritch-invocations", inv, "invocation", ["class:warlock"]);
      const ab = rows.find((r) => r.id === "option:invocation:agonizing-blast")!;
      expect(ab.data.prerequisite).toMatch(/eldritch blast/i);
      expect(rows.find((r) => r.id === "option:invocation:ascendant-step")?.data.levelReq).toBe(9);
    }
  });
});
