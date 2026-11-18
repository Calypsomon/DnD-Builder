import { describe, expect, it } from "vitest";
import { readCached } from "../../importer/fetch";
import { parseBackground, parseBackgroundIndex } from "../../importer/parsers/background";

describe("background index", () => {
  const home = readCached("");
  it.skipIf(!home)("lists backgrounds", () => {
    const idx = parseBackgroundIndex(home!);
    expect(idx).toContain("background:acolyte");
    expect(idx.length).toBeGreaterThan(50);
  });
});

describe("background:acolyte", () => {
  const html = readCached("background:acolyte");
  it.skipIf(!html)("parses acolyte", () => {
    const { background: b, features } = parseBackground("background:acolyte", html!);
    expect(b.id).toBe("background:acolyte");
    expect(b.name).toBe("Acolyte");
    expect(b.source).toBe("PHB");
    expect(b.data.skills).toEqual(["insight", "religion"]);
    expect(b.effects).toContainEqual({ type: "proficiency", kind: "skill", ids: ["insight", "religion"] });
    const lang = b.choices.find((c) => c.from.kind === "languages")!;
    expect(lang.count).toBe(2);
    expect(features.map((f) => f.name)).toEqual(["Shelter of the Faithful"]);
    expect(features[0].id).toBe("background:acolyte/shelter-of-the-faithful");
    expect(b.data.featureName).toBe("Shelter of the Faithful");
    expect(Object.keys(b.data.characteristics ?? {})).toHaveLength(4);
    expect(b.data.characteristics!["Personality Traits"]).toHaveLength(8);
    expect(b.data.equipmentText).toMatch(/holy symbol/);
  });
});

describe("other backgrounds", () => {
  const crim = readCached("background:criminal");
  it.skipIf(!crim)("criminal: fixed tool + gaming set choice", () => {
    const { background: b } = parseBackground("background:criminal", crim!);
    expect(b.data.tools).toEqual(["thieves-tools"]);
    expect(b.choices.some((c) => c.from.kind === "tools")).toBe(true);
  });
  const fa = readCached("background:faction-agent");
  it.skipIf(!fa)("faction agent: fixed skill + skill choice", () => {
    const { background: b } = parseBackground("background:faction-agent", fa!);
    expect(b.data.skills).toEqual(["insight"]);
    expect(b.choices.some((c) => c.from.kind === "skills" && c.count === 1)).toBe(true);
  });
});
