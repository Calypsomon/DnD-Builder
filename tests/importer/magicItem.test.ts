import { describe, expect, it } from "vitest";
import { readCached } from "../../importer/fetch";
import { parseMagicItem, parseMagicItemIndex } from "../../importer/parsers/magicItem";

const indexHtml = readCached("wondrous-items");
const index = indexHtml ? parseMagicItemIndex(indexHtml) : [];
const entry = (slug: string) => index.find((e) => e.slug === slug);

describe("magic item index", () => {
  it.skipIf(!indexHtml)("lists items with rarity from the tab", () => {
    expect(index.length).toBeGreaterThan(500);
    expect(entry("wondrous-items:bag-of-holding")).toMatchObject({ rarity: "uncommon", attuned: false, source: "DMG" });
    expect(entry("wondrous-items:ring-of-protection")).toMatchObject({ rarity: "rare", attuned: true });
    expect(new Set(index.map((e) => e.slug)).size).toBe(index.length);
  });
});

describe("magic item page", () => {
  const bag = readCached("wondrous-items:bag-of-holding");
  const ring = readCached("wondrous-items:ring-of-protection");
  const gauntlets = readCached("wondrous-items:gauntlets-of-ogre-power");
  const weapon = readCached("wondrous-items:weapon-1-2-3");

  it.skipIf(!bag)("parses bag of holding", () => {
    const r = parseMagicItem("wondrous-items:bag-of-holding", bag!, entry("wondrous-items:bag-of-holding"));
    expect(r.id).toBe("magic:bag-of-holding");
    expect(r.source).toBe("DMG");
    expect(r.data).toMatchObject({ category: "magic", rarity: "uncommon", attunement: false, subtype: "wondrous", magicType: "Wondrous item" });
    expect(r.description).toContain("500 pounds");
  });

  it.skipIf(!ring)("detects AC and save bonuses", () => {
    const r = parseMagicItem("wondrous-items:ring-of-protection", ring!);
    expect(r.data).toMatchObject({ rarity: "rare", attunement: true, subtype: "ring" });
    expect(r.effects).toEqual(
      expect.arrayContaining([
        { type: "bonus", target: "ac", value: 1, when: "itemAttuned" },
        { type: "bonus", target: "save.all", value: 1, when: "itemAttuned" },
      ]),
    );
  });

  it.skipIf(!gauntlets)("detects ability score set", () => {
    const r = parseMagicItem("wondrous-items:gauntlets-of-ogre-power", gauntlets!);
    expect(r.effects).toEqual([{ type: "abilitySet", ability: "str", value: 19 }]);
  });

  it.skipIf(!weapon)("does not explode variants", () => {
    const r = parseMagicItem("wondrous-items:weapon-1-2-3", weapon!);
    expect(r.data.rarity).toBe("varies");
    expect(r.data.subtype).toBe("weapon");
    expect(r.effects.some((e) => e.type === "note")).toBe(true);
  });
});
