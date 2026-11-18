import type { CharacterBuild } from "../types/character";

/** Table rules from the Settings page. They apply to every character. */
export type RuleOptions = CharacterBuild["options"];

export const DEFAULT_RULES: RuleOptions = {
  sources: ["official"],
  featsAllowed: true,
  customizeOrigin: false,
  optionalFeatures: false,
};

const SOURCE_KINDS = ["official", "ua", "homebrew"] as const;

/** Reads the `rules` setting; falls back to the older per-key defaults. */
export function rulesFromSettings(settings: Record<string, unknown> | undefined): RuleOptions {
  const s = settings ?? {};
  const raw = (s.rules && typeof s.rules === "object" ? s.rules : { sources: s.defaultSources, featsAllowed: s.featsAllowed, customizeOrigin: s.customizeOrigin }) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const sources = Array.isArray(raw.sources) ? (raw.sources.filter((x) => (SOURCE_KINDS as readonly unknown[]).includes(x)) as RuleOptions["sources"]) : DEFAULT_RULES.sources;
  return {
    sources,
    featsAllowed: bool(raw.featsAllowed, DEFAULT_RULES.featsAllowed),
    customizeOrigin: bool(raw.customizeOrigin, DEFAULT_RULES.customizeOrigin),
    optionalFeatures: bool(raw.optionalFeatures, DEFAULT_RULES.optionalFeatures),
  };
}

/** The character as the rules engine sees it: build options replaced by the table rules. */
export function withRules<T extends { build: CharacterBuild }>(character: T, rules: RuleOptions): T {
  return { ...character, build: { ...character.build, options: { ...rules } } };
}
