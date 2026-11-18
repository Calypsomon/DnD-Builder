import { describe, expect, it } from "vitest";
import { readCached } from "../../importer/fetch";
import { parseLineage, parseLineageIndex } from "../../importer/parsers/lineage";

const has = (rows: { type: string }[], match: object) =>
  rows.some((e) => Object.entries(match).every(([k, v]) => JSON.stringify((e as any)[k]) === JSON.stringify(v)));

describe("lineage index", () => {
  const html = readCached("lineage");
  it.skipIf(!html)("lists lineages with categories", () => {
    const idx = parseLineageIndex(html!);
    expect(idx.length).toBeGreaterThan(60);
    expect(idx.find((i) => i.slug === "lineage:dwarf")?.category).toBe("Standard Lineages");
    expect(idx.find((i) => i.slug === "lineage:custom")?.category).toBe("Custom Lineage");
    expect(idx.find((i) => i.slug === "lineage:kender-ua")?.category).toBe("Unearthed Arcana");
  });
});

describe("lineage:dwarf", () => {
  const html = readCached("lineage:dwarf");
  it.skipIf(!html)("parses variants, subraces and traits", () => {
    const r = parseLineage("lineage:dwarf", html!, "Standard Lineages");
    expect(r.species).toHaveLength(2); // PHB + Plane Shift: Kaladesh (Eberron only adds the Mark of Warding subrace)
    const dwarf = r.species[0];
    expect(dwarf.id).toBe("species:dwarf");
    expect(dwarf.source).toBe("PHB");
    expect(dwarf.data.speed.walk).toBe(25);
    expect(dwarf.data.darkvision).toBe(60);
    expect(dwarf.data.languages).toEqual(["common", "dwarvish"]);
    expect(has(dwarf.effects, { type: "abilityIncrease", ability: "con", value: 2 })).toBe(true);
    expect(r.species[1].id).toBe("species:dwarf@plane-shift-kaladesh");
    expect(r.species[1].data.baseId).toBe("species:dwarf");

    const hill = r.subspecies.find((s) => s.id === "subspecies:dwarf:hill")!;
    expect(has(hill.effects, { type: "abilityIncrease", ability: "wis", value: 1 })).toBe(true);
    const tough = r.features.find((f) => f.data.ownerId === hill.id && f.effects.some((e) => e.type === "hpPerLevel"));
    expect(tough?.id).toBe("subspecies:dwarf:hill/dwarven-toughness");
    expect(tough?.effects).toContainEqual({ type: "hpPerLevel", value: 1 });

    const mountain = r.subspecies.find((s) => s.id === "subspecies:dwarf:mountain")!;
    expect(has(mountain.effects, { type: "abilityIncrease", ability: "str", value: 2 })).toBe(true);
    const armor = r.features.find((f) => f.data.ownerId === mountain.id && f.effects.some((e) => e.type === "proficiency"));
    expect(armor?.effects).toContainEqual({ type: "proficiency", kind: "armor", ids: ["light", "medium"] });

    const mark = r.subspecies.find((s) => s.id === "subspecies:dwarf:mark-of-warding")!;
    expect(mark.data.speciesId).toBe("species:dwarf");
    expect(r.features.find((f) => f.id === "species:dwarf/dwarven-combat-training")?.effects).toContainEqual({
      type: "proficiency",
      kind: "weapon",
      ids: ["battleaxe", "handaxe", "light-hammer", "warhammer"],
    });
    expect(r.features.find((f) => f.id === "species:dwarf/tool-proficiency")?.choices[0].from).toEqual({
      kind: "tools",
      ids: ["smiths-tools", "brewers-supplies", "masons-tools"],
    });
    // data traits are not duplicated as feature rows
    expect(r.features.some((f) => f.id === "species:dwarf/speed")).toBe(false);
  });
});

describe("lineage:elf", () => {
  const html = readCached("lineage:elf");
  it.skipIf(!html)("parses elf subraces", () => {
    const r = parseLineage("lineage:elf", html!, "Standard Lineages");
    const ids = r.subspecies.filter((s) => s.data.speciesId === "species:elf").map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["subspecies:elf:high", "subspecies:elf:wood", "subspecies:elf:drow"]));
    const wood = r.subspecies.find((s) => s.id === "subspecies:elf:wood")!;
    expect(wood.data.speedWalk).toBe(35);
    expect(wood.effects).toContainEqual({ type: "speed", mode: "walk", op: "set", value: 35 });
    const drow = r.subspecies.find((s) => s.id === "subspecies:elf:drow")!;
    expect(drow.data.darkvision).toBe(120);
    expect(drow.effects).toContainEqual({ type: "sense", sense: "darkvision", range: 120 });
    expect(r.features.find((f) => f.id === "species:elf/keen-senses")?.effects).toContainEqual({
      type: "proficiency",
      kind: "skill",
      ids: ["perception"],
    });
  });
});

describe("lineage:half-elf / human", () => {
  const he = readCached("lineage:half-elf");
  it.skipIf(!he)("half-elf has a choice of two +1 increases", () => {
    const r = parseLineage("lineage:half-elf", he!, "Standard Lineages");
    const sp = r.species[0];
    expect(sp.effects).toContainEqual({ type: "abilityIncrease", ability: "cha", value: 2 });
    const c = sp.choices.find((x) => x.id === "species:half-elf:asi")!;
    expect(c.count).toBe(2);
    expect(c.from).toMatchObject({ kind: "abilities", amount: 1, distinct: true });
  });

  const hu = readCached("lineage:human");
  it.skipIf(!hu)("human +1 all, variant human as subspecies with choices", () => {
    const r = parseLineage("lineage:human", hu!, "Standard Lineages");
    const human = r.species[0];
    expect(human.id).toBe("species:human");
    expect(human.effects.filter((e) => e.type === "abilityIncrease" && e.value === 1)).toHaveLength(6);
    const v = r.subspecies.find((s) => s.id === "subspecies:human:variant")!;
    expect(v.choices[0].count).toBe(2);
    const feats = r.features.filter((f) => f.data.ownerId === v.id);
    expect(feats.some((f) => f.choices.some((c) => c.from.kind === "skills"))).toBe(true);
    expect(feats.some((f) => f.choices.some((c) => c.from.kind === "feats"))).toBe(true);
  });
});

describe("lineage:orc (MPMM flexible ASI)", () => {
  const html = readCached("lineage:orc");
  it.skipIf(!html)("emits +2 and +1 choices", () => {
    const r = parseLineage("lineage:orc", html!, "Monstrous Lineages");
    const sp = r.species[0];
    expect(sp.source).toBe("MPMM");
    expect(sp.choices.map((c) => c.id)).toEqual(expect.arrayContaining(["species:orc:asi-2", "species:orc:asi-1"]));
  });
});
