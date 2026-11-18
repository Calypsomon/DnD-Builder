import { describe, expect, it } from "vitest";
import { readCached } from "../../importer/fetch";
import { parseFeat, parseFeatIndex } from "../../importer/parsers/feat";

describe("feat index", () => {
  const home = readCached("");
  it.skipIf(!home)("lists feats", () => {
    const idx = parseFeatIndex(home!);
    expect(idx).toContain("feat:alert");
    expect(idx.length).toBeGreaterThan(100);
  });
});

describe("feats", () => {
  const alert = readCached("feat:alert");
  it.skipIf(!alert)("alert", () => {
    const f = parseFeat("feat:alert", alert!);
    expect(f.id).toBe("feat:alert");
    expect(f.name).toBe("Alert");
    expect(f.source).toBe("PHB");
    expect(f.data.prerequisite).toBeUndefined();
    expect(f.description).toMatch(/initiative/);
  });
  const res = readCached("feat:resilient");
  it.skipIf(!res)("resilient: any ability choice", () => {
    const f = parseFeat("feat:resilient", res!);
    const c = f.choices.find((x) => x.id === "feat:resilient:asi")!;
    expect(c.from).toEqual({ kind: "abilities", amount: 1, distinct: true });
  });
  const ath = readCached("feat:athlete");
  it.skipIf(!ath)("athlete: str or dex", () => {
    const f = parseFeat("feat:athlete", ath!);
    const c = f.choices.find((x) => x.id === "feat:athlete:asi")!;
    expect(c.from).toMatchObject({ kind: "abilities", ids: ["str", "dex"] });
  });
  const gr = readCached("feat:grappler");
  it.skipIf(!gr)("grappler: prerequisite", () => {
    const f = parseFeat("feat:grappler", gr!);
    expect(f.data.prerequisite).toBe("Strength 13 or higher");
    expect(f.data.prereqAbilities).toEqual([{ abilities: ["str"], min: 13 }]);
  });
  const ham = readCached("feat:heavy-armor-master");
  it.skipIf(!ham)("single-ability increase becomes an effect", () => {
    const f = parseFeat("feat:heavy-armor-master", ham!);
    expect(f.effects).toContainEqual({ type: "abilityIncrease", ability: "str", value: 1, max: 20 });
  });
});
