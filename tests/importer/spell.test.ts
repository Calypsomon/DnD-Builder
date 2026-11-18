import { describe, expect, it } from "vitest";
import { readCached } from "../../importer/fetch";
import { parseSpell, parseSpellIndex } from "../../importer/parsers/spell";

const parse = (slug: string) => {
  const html = readCached(slug);
  return html ? parseSpell(slug, html) : null;
};

describe("spell index", () => {
  const html = readCached("spells");
  it.skipIf(!html)("lists spell slugs", () => {
    const slugs = parseSpellIndex(html!);
    expect(slugs.length).toBeGreaterThan(400);
    expect(slugs).toContain("spell:fireball");
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("spell pages", () => {
  const fireball = parse("spell:fireball");
  const fireBolt = parse("spell:fire-bolt");
  const detectMagic = parse("spell:detect-magic");

  it.skipIf(!fireball)("parses fireball", () => {
    const r = fireball!;
    expect(r.id).toBe("spell:fireball");
    expect(r.name).toBe("Fireball");
    expect(r.source).toBe("PHB");
    expect(r.data).toMatchObject({
      level: 3,
      school: "evocation",
      castingTime: "1 action",
      range: "150 feet",
      duration: "Instantaneous",
      concentration: false,
      ritual: false,
      lists: ["class:sorcerer", "class:wizard"],
    });
    expect(r.data.components).toMatchObject({ v: true, s: true, m: true });
    expect(r.data.components.material).toContain("bat guano");
    expect(r.data.higherLevels).toContain("1d6");
    expect(r.description).toContain("Dexterity saving throw");
    expect(r.description).not.toContain("At Higher Levels");
  });

  it.skipIf(!fireBolt)("parses a cantrip", () => {
    expect(fireBolt!.data.level).toBe(0);
    expect(fireBolt!.data.school).toBe("evocation");
  });

  it.skipIf(!detectMagic)("parses a ritual concentration spell", () => {
    expect(detectMagic!.data).toMatchObject({ level: 1, ritual: true, concentration: true });
    expect(detectMagic!.data.lists).toContain("class:artificer");
  });
});
