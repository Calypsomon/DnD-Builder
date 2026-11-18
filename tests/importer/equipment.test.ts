import { describe, expect, it } from "vitest";
import { readCached } from "../../importer/fetch";
import { parseArmor, parseGear, parseTools, parseWeapons } from "../../importer/parsers/equipment";

const weaponsHtml = readCached("weapons");
const armorHtml = readCached("armor");
const gearHtml = readCached("adventuring-gear");
const toolsHtml = readCached("tools");

describe("weapons", () => {
  const rows = weaponsHtml ? parseWeapons(weaponsHtml) : [];
  const get = (id: string) => rows.find((r) => r.id === id)!;

  it.skipIf(!weaponsHtml)("parses at least 37 simple and martial PHB weapons", () => {
    const phb = rows.filter((r) => r.data.category === "weapon" && r.source === "PHB");
    expect(phb.length).toBeGreaterThanOrEqual(37);
  });

  it.skipIf(!weaponsHtml)("parses the longsword", () => {
    const w = get("item:longsword");
    expect(w.data.costCp).toBe(1500);
    expect(w.data.weightLb).toBe(3);
    expect(w.data.category).toBe("weapon");
    expect(w.data.weapon).toMatchObject({ category: "martial", range: "melee", damage: "1d8", damageType: "slashing", versatile: "1d10" });
  });

  it.skipIf(!weaponsHtml)("parses the dagger", () => {
    const w = get("item:dagger").data.weapon!;
    expect(w.properties).toEqual(expect.arrayContaining(["finesse", "light", "thrown"]));
    expect([w.rangeNormal, w.rangeLong]).toEqual([20, 60]);
  });

  it.skipIf(!weaponsHtml)("parses the longbow", () => {
    const w = get("item:longbow").data.weapon!;
    expect(w.range).toBe("ranged");
    expect(w.properties).toEqual(expect.arrayContaining(["ammunition", "heavy", "two-handed"]));
    expect([w.rangeNormal, w.rangeLong]).toEqual([150, 600]);
  });

  it.skipIf(!weaponsHtml)("handles flat damage, ammunition and setting weapons", () => {
    expect(get("item:blowgun").data.weapon).toMatchObject({ damage: "1", damageType: "piercing" });
    expect(get("item:arrows-20").data.category).toBe("ammunition");
    expect(get("item:yklwa").source).toBe("ToA");
  });
});

describe("armor", () => {
  const rows = armorHtml ? parseArmor(armorHtml) : [];
  const get = (id: string) => rows.find((r) => r.id === id)!;

  it.skipIf(!armorHtml)("parses chain mail", () => {
    const a = get("item:chain-mail");
    expect(a.data.armor).toMatchObject({ type: "heavy", baseAc: 16, dexCap: 0, strReq: 13, stealthDisadvantage: true });
    expect(a.data.weightLb).toBe(55);
  });

  it.skipIf(!armorHtml)("parses dex caps", () => {
    expect(get("item:hide").data.armor!.dexCap).toBe(2);
    expect(get("item:leather").data.armor!.dexCap).toBeNull();
    expect(get("item:leather").data.armor!.baseAc).toBe(11);
  });

  it.skipIf(!armorHtml)("parses the shield", () => {
    const s = get("item:shield");
    expect(s.data.category).toBe("shield");
    expect(s.data.armor).toMatchObject({ type: "shield", baseAc: 2 });
  });
});

describe("gear and tools", () => {
  it.skipIf(!gearHtml)("parses packs with contents and gear", () => {
    const rows = parseGear(gearHtml!);
    const pack = rows.find((r) => r.id === "item:burglars-pack")!;
    expect(pack.data.category).toBe("pack");
    expect(pack.data.costCp).toBe(1600);
    expect(pack.data.contents!.length).toBeGreaterThan(8);
    expect(rows.find((r) => r.id === "item:piton")!.data.weightLb).toBe(0.25);
    expect(rows.length).toBeGreaterThan(60);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it.skipIf(!toolsHtml)("parses tools with subtypes", () => {
    const rows = parseTools(toolsHtml!);
    expect(rows.find((r) => r.id === "item:thieves-tools")!.data).toMatchObject({ category: "tool", costCp: 2500, weightLb: 1 });
    expect(rows.find((r) => r.id === "item:lute")!.data.subtype).toBe("musical instrument");
    expect(rows.find((r) => r.id === "item:smiths-tools")!.data.subtype).toBe("artisan's tools");
  });
});
