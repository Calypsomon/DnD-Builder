import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, rulesFromSettings, withRules } from "../../shared/rules/options";
import { newBuild } from "../../shared/types/character";

describe("table rules", () => {
  it("uses defaults without settings", () => {
    expect(rulesFromSettings(undefined)).toEqual(DEFAULT_RULES);
  });
  it("reads the rules setting and the older per-key defaults", () => {
    expect(rulesFromSettings({ rules: { sources: ["official", "ua", "bogus"], featsAllowed: false, optionalFeatures: true } })).toEqual({
      sources: ["official", "ua"],
      featsAllowed: false,
      customizeOrigin: false,
      optionalFeatures: true,
    });
    expect(rulesFromSettings({ defaultSources: ["homebrew"], customizeOrigin: true })).toMatchObject({ sources: ["homebrew"], customizeOrigin: true });
  });
  it("overrides the stored character options", () => {
    const c = { build: newBuild("X") };
    const r = withRules(c, { ...DEFAULT_RULES, optionalFeatures: true });
    expect(r.build.options.optionalFeatures).toBe(true);
    expect(c.build.options.optionalFeatures).toBe(false);
  });
});
