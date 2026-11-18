import type { Element } from "domhandler";
import type { Ability, Choice, Effect } from "../../shared/types/effects";
import { SKILLS } from "../../shared/types/content";
import type { ContentRow, FeatureData, SpeciesData, SubspeciesData } from "../../shared/types/content";
import { clean, flatChildren, loadPage, mapSource, row, slugify, textOf, toMarkdown, toMarkdownAll, warn } from "./common";
import type { $Root } from "./common";

/* ------------------------------------------------------------------ */
/* Shared helpers (also used by background.ts and feat.ts)             */
/* ------------------------------------------------------------------ */

export const ALL_ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_WORDS: Record<string, Ability> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};
const ABILITY_RE = "strength|dexterity|constitution|intelligence|wisdom|charisma";

export function abilitiesIn(text: string): Ability[] {
  const out: Ability[] = [];
  for (const m of text.matchAll(new RegExp(ABILITY_RE, "gi"))) {
    const a = ABILITY_WORDS[m[0].toLowerCase()];
    if (!out.includes(a)) out.push(a);
  }
  return out;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, a: 1, an: 1, any: 1 };
export function numberWord(w: string | undefined, dflt = 1): number {
  if (!w) return dflt;
  const l = w.toLowerCase();
  if (/^\d+$/.test(l)) return parseInt(l, 10);
  return NUMBER_WORDS[l] ?? dflt;
}

/** Skill ids mentioned in a text, in order of appearance */
export function skillsIn(text: string): string[] {
  const found: { id: string; pos: number }[] = [];
  for (const id of Object.keys(SKILLS)) {
    const re = new RegExp(`\\b${id.replace(/-/g, "[ -]")}\\b`, "i");
    const m = re.exec(text);
    if (m) found.push({ id, pos: m.index });
  }
  return found.sort((a, b) => a.pos - b.pos).map((f) => f.id);
}

const LANGUAGE_FIX: Record<string, string> = { elven: "elvish", "thieves-cant": "thieves-cant" };
export function languageId(name: string): string {
  const s = slugify(name);
  return LANGUAGE_FIX[s] ?? s;
}

export const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
];

const SIMPLE_WEAPONS = [
  "club",
  "dagger",
  "greatclub",
  "handaxe",
  "javelin",
  "light hammer",
  "mace",
  "quarterstaff",
  "sickle",
  "spear",
  "light crossbow",
  "dart",
  "shortbow",
  "sling",
];
const MARTIAL_WEAPONS = [
  "battleaxe",
  "flail",
  "glaive",
  "greataxe",
  "greatsword",
  "halberd",
  "lance",
  "longsword",
  "maul",
  "morningstar",
  "pike",
  "rapier",
  "scimitar",
  "shortsword",
  "trident",
  "war pick",
  "warhammer",
  "whip",
  "blowgun",
  "hand crossbow",
  "heavy crossbow",
  "longbow",
  "net",
];
const WEAPON_NAMES = new Set([...SIMPLE_WEAPONS, ...MARTIAL_WEAPONS]);

function singular(w: string): string {
  const s = w.trim().toLowerCase().replace(/^the\s+/, "");
  if (WEAPON_NAMES.has(s)) return s;
  if (s.endsWith("ves")) return s.slice(0, -3) + "f"; // none currently
  if (s.endsWith("s") && !s.endsWith("ss")) return s.slice(0, -1);
  return s;
}

function splitList(text: string): string[] {
  return text
    .split(/\s*,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+/i)
    .map((s) => clean(s))
    .filter(Boolean);
}

const TOOL_WORD = /tools?\b|\bkit\b|supplies|instruments?\b|\bset\b|vehicles?\b|\blute\b|\bflute\b|\bdrum\b/i;

export interface Grants {
  effects: Effect[];
  choices: Choice[];
}

const mkChoice = (
  id: string,
  label: string,
  count: number,
  from: Choice["from"],
  grants?: Effect[],
): Choice => ({ id, label, level: 1, count, from, ...(grants ? { grants } : {}) });

/**
 * Analyse the text of one trait/benefit and derive proficiencies, resistances, hp bonuses
 * and simple choices. `ownerId` is used to build globally unique choice ids (`<ownerId>:<short>`).
 */
export function analyzeTrait(name: string, text: string, ownerId: string): Grants {
  const effects: Effect[] = [];
  const choices: Choice[] = [];
  const t = clean(text);
  if (/^choose one of the following/i.test(t)) return { effects: [], choices: [] };
  const used = new Set<string>();
  const addChoice = (short: string, label: string, count: number, from: Choice["from"], grants?: Effect[]) => {
    let id = `${ownerId}:${short}`;
    let n = 2;
    while (used.has(id)) id = `${ownerId}:${short}-${n++}`;
    used.add(id);
    choices.push(mkChoice(id, label, count, from, grants));
  };

  // hit points
  const hp = t.match(/hit point maximum increases by (\d+),? and it increases by \1 (?:again )?every time you gain a level/i);
  if (hp) effects.push({ type: "hpPerLevel", value: parseInt(hp[1], 10) });

  // damage resistance
  for (const m of t.matchAll(/you (?:also )?have resistance (?:to|against) ([a-z ,]+?) damage/gi)) {
    const types = DAMAGE_TYPES.filter((d) => new RegExp(`\\b${d}\\b`, "i").test(m[1]));
    if (types.length && !/type/.test(m[1])) effects.push({ type: "damageDefense", kind: "resistance", damageTypes: types });
  }
  for (const m of t.matchAll(/you (?:are|have) immun(?:e|ity) (?:to|against) ([a-z ,]+?) damage/gi)) {
    const types = DAMAGE_TYPES.filter((d) => new RegExp(`\\b${d}\\b`, "i").test(m[1]));
    if (types.length && !/type/.test(m[1])) effects.push({ type: "damageDefense", kind: "immunity", damageTypes: types });
  }

  // proficiencies, per sentence
  const sentences = t.split(/(?<=[.!?])\s+(?=[A-Z])/);
  for (const raw of sentences) {
    const s = raw.replace(/\.$/, "");
    const pm = s.match(/\b(?:proficiency|proficient)\s+(?:in|with)\s+(.*)$/i);
    if (!pm) continue;
    const rest = pm[1];
    if (/double (?:your )?proficiency bonus|expertise/i.test(s)) continue;
    const restLower = rest.toLowerCase();
    if (/saving throws?/.test(restLower)) {
      const ab = abilitiesIn(rest);
      if (ab.length) effects.push({ type: "proficiency", kind: "save", ids: ab });
      continue;
    }
    // skills
    if (/\bskills?\b/.test(restLower)) {
      const choiceM = rest.match(/\b(one|two|three|four)\s+(?:of the following\s+)?skills?\b.*?(?:of your choice|:)/i);
      const listM = rest.match(/\b(one|two|three|four)\s+of the following(?:\s+skills)?/i);
      if (/any combination/.test(restLower)) continue;
      if (listM || (choiceM && /:/.test(rest))) {
        const ids = skillsIn(rest.slice(rest.indexOf(":") >= 0 ? rest.indexOf(":") : 0));
        const count = numberWord((listM ?? choiceM)![1]);
        addChoice("skills", "Skill Proficiency", count, { kind: "skills", ...(ids.length ? { ids } : {}) }, [
          { type: "proficiency", kind: "skill", ids: ["$id"] },
        ]);
      } else if (choiceM || /of your choice/.test(restLower)) {
        const count = numberWord(choiceM?.[1] ?? rest.match(/\b(one|two|three|four)\b/i)?.[1]);
        addChoice("skills", "Skill Proficiency", count, { kind: "skills" }, [
          { type: "proficiency", kind: "skill", ids: ["$id"] },
        ]);
      } else {
        const ids = skillsIn(rest);
        if (ids.length) effects.push({ type: "proficiency", kind: "skill", ids });
      }
      continue;
    }
    // "your choice of two of the following: Acrobatics, ..."
    if (/of the following/.test(restLower) && skillsIn(rest).length >= 2) {
      const ids = skillsIn(rest);
      addChoice("skills", "Skill Proficiency", numberWord(rest.match(/\b(one|two|three|four)\b/i)?.[1]), { kind: "skills", ids }, [
        { type: "proficiency", kind: "skill", ids: ["$id"] },
      ]);
      continue;
    }
    // armor
    if (/\b(armor|shields?)\b/.test(restLower) && !/\bweapons?\b/.test(restLower.replace(/armor and weapon/, ""))) {
      const ids: string[] = [];
      for (const k of ["light", "medium", "heavy"]) if (new RegExp(`\\b${k}\\b`).test(restLower)) ids.push(k);
      if (/shields?/.test(restLower)) ids.push("shields");
      if (ids.length) effects.push({ type: "proficiency", kind: "armor", ids });
      continue;
    }
    // tools
    if (TOOL_WORD.test(rest) && !WEAPON_NAMES.has(singular(rest))) {
      if (/of your choice/i.test(rest)) {
        const countM = rest.match(/\b(one|two|three|four)\b/i);
        const colon = rest.indexOf(":");
        let ids: string[] | undefined;
        if (colon >= 0) {
          ids = splitList(rest.slice(colon + 1).replace(/\.$/, "")).map(slugify).filter(Boolean);
        }
        addChoice("tools", "Tool Proficiency", numberWord(countM?.[1]), { kind: "tools", ...(ids?.length ? { ids } : {}) }, [
          { type: "proficiency", kind: "tool", ids: ["$id"] },
        ]);
      } else if (!/\bwith\b.*\bor\b/.test(rest)) {
        const ids = splitList(rest.replace(/^the\s+/i, ""))
          .filter((i) => TOOL_WORD.test(i))
          .map((i) => slugify(i.replace(/^the\s+/i, "")));
        if (ids.length) effects.push({ type: "proficiency", kind: "tool", ids });
      }
      continue;
    }
    // weapons
    const wIds: string[] = [];
    for (const item of splitList(rest)) {
      const sing = singular(item.replace(/\bweapons?\b/i, "").trim() || item);
      if (/^(simple|martial)$/.test(sing)) wIds.push(sing);
      else if (WEAPON_NAMES.has(sing)) wIds.push(slugify(sing));
    }
    if (wIds.length) effects.push({ type: "proficiency", kind: "weapon", ids: wIds });
  }

  // extra languages
  if (!/^languages?$/i.test(name)) {
    const lm = t.match(/\b(one|two|three)\s+(?:extra |additional |other )?languages?\b[^.]*?(?:of your choice|that you and your)/i);
    if (lm || /\b(?:extra|additional) language of your choice/i.test(t)) {
      addChoice("languages", "Language", numberWord(lm?.[1]), { kind: "languages" }, [
        { type: "proficiency", kind: "language", ids: ["$id"] },
      ]);
    }
  }

  // feats
  if (/\byou gain (?:one|a) feat of your choice/i.test(t)) {
    addChoice("feat", "Feat", 1, { kind: "feats" });
  }

  return { effects, choices };
}

/** Parse an "Ability Score Increase" text into effects/choices. `idPrefix` e.g. "species:half-elf". */
export function parseAbilityIncrease(text: string, idPrefix: string): Grants & { ok: boolean } {
  const t = clean(text);
  const effects: Effect[] = [];
  const pending: { count: number; amount: number; exclude: Ability[]; labelSuffix?: string }[] = [];
  const named: Ability[] = [];

  if (/\bability scores each increase by (\d+)/i.test(t)) {
    const v = parseInt(t.match(/\bability scores each increase by (\d+)/i)![1], 10);
    for (const ability of ALL_ABILITIES) effects.push({ type: "abilityIncrease", ability, value: v });
  }
  const re = new RegExp(
    `((?:${ABILITY_RE})(?:(?:\\s*,\\s*(?:and\\s+)?|\\s+and\\s+)(?:${ABILITY_RE}))*)\\s+scores?\\s+(?:each\\s+)?increases?\\s+by\\s+(\\d+)`,
    "gi",
  );
  for (const m of t.matchAll(re)) {
    for (const ability of abilitiesIn(m[1])) {
      named.push(ability);
      effects.push({ type: "abilityIncrease", ability, value: parseInt(m[2], 10) });
    }
  }
  // MPMM style
  const mp = t.match(/increase one (?:ability )?score by (\d+),? and (?:increase )?(?:another|a different)(?: one| score| ability score)? by (\d+)/i);
  if (mp) {
    pending.push({ count: 1, amount: parseInt(mp[1], 10), exclude: [], labelSuffix: ` (+${mp[1]})` });
    pending.push({ count: 1, amount: parseInt(mp[2], 10), exclude: [], labelSuffix: ` (+${mp[2]})` });
  } else {
    const re2 = /\b(one|two|three)\s+(other\s+|different\s+)?ability scores?\s+of your choice\s+(?:each\s+)?increases?\s+by\s+(\d+)/gi;
    for (const m of t.matchAll(re2)) {
      pending.push({ count: numberWord(m[1]), amount: parseInt(m[3], 10), exclude: m[2] ? named : [] });
    }
  }
  const choices: Choice[] = pending.map((p, i) => {
    const ids = p.exclude.length ? ALL_ABILITIES.filter((a) => !p.exclude.includes(a)) : undefined;
    const id = pending.length === 1 ? `${idPrefix}:asi` : p.labelSuffix ? `${idPrefix}:asi-${p.amount}` : `${idPrefix}:asi-${i + 1}`;
    return mkChoice(id, `Ability Score Increase${p.labelSuffix ?? ""}`, p.count, {
      kind: "abilities",
      amount: p.amount,
      distinct: true,
      ...(ids ? { ids } : {}),
    });
  });
  return { effects, choices, ok: effects.length > 0 || choices.length > 0 };
}

/* ------------------------------------------------------------------ */
/* Lineage index                                                       */
/* ------------------------------------------------------------------ */

export function parseLineageIndex(html: string): { slug: string; category: string }[] {
  const { $, content } = loadPage(html);
  const out: { slug: string; category: string }[] = [];
  const seen = new Set<string>();
  let category = "";
  for (const el of flatChildren($, content)) {
    if (el.name === "h1") {
      category = textOf($, el);
      continue;
    }
    $(el)
      .find("a[href]")
      .each((_, a) => {
        const href = ($(a).attr("href") ?? "").replace(/^\//, "").split(/[?#]/)[0];
        if (/^lineage:[^/]+$/i.test(href) && !seen.has(href)) {
          seen.add(href);
          out.push({ slug: href, category });
        }
      });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Lineage page                                                        */
/* ------------------------------------------------------------------ */

interface Trait {
  label: string;
  text: string;
  md: string;
}
interface Block {
  heading: string;
  intro: string[];
  traits: Trait[];
  source?: string;
}

const SKIP_TRAITS = /^(age|alignment|size|speed|languages?|ability score increase|creature type|type)(\b|$)/i;

function cleanLabel(s: string): string {
  return clean(s).replace(/[\s.:]+$/, "").replace(/^[\s.:]+/, "");
}

function labelOf($: $Root, el: Element): { label: string; rest: ReturnType<$Root> } | null {
  const clone = $(el).clone();
  const kids = clone.contents().filter((_, n) => !(n.type === "text" && !clean((n as any).data ?? ""))).first();
  const fe = kids.get(0) as Element | undefined;
  if (!fe || fe.type !== "tag" || !/^(strong|em|b|i)$/.test(fe.name)) return null;
  const label = cleanLabel($(fe).text());
  if (!label) return null;
  kids.remove();
  return { label, rest: clone as any };
}

function parseBlock($: $Root, heading: string, nodes: Element[]): Block {
  const run = (allowP: boolean): Block => {
    const block: Block = { heading, intro: [], traits: [] };
    const addExtra = (md: string, text: string) => {
      const last = block.traits[block.traits.length - 1];
      if (last) {
        last.md += "\n\n" + md;
        last.text += " " + text;
      } else block.intro.push(md);
    };
    for (const el of nodes) {
      if (el.name === "hr") continue;
      if (el.name === "ul" || el.name === "ol") {
        $(el)
          .children("li")
          .each((_, li) => {
            const lab = labelOf($, li);
            if (lab) {
              block.traits.push({
                label: lab.label,
                text: clean(lab.rest.text()).replace(/^[.:\s]+/, ""),
                md: toMarkdown($, lab.rest.contents()).replace(/^[.:\s]+/, ""),
              });
            } else {
              const t = clean($(li).text());
              const last = block.traits[block.traits.length - 1];
              if (last) {
                last.text += " " + t;
                last.md += `
- ${toMarkdown($, $(li).contents())}`;
              } else block.intro.push(`- ${toMarkdown($, $(li).contents())}`);
            }
          });
        continue;
      }
      const text = textOf($, el);
      if (!text) continue;
      const sm = text.match(/^Sour?ce:\s*(.+)$/i);
      if (sm) {
        block.source ??= sm[1];
        continue;
      }
      if (/^See also/i.test(text)) continue;
      if (allowP && el.name === "p") {
        const lab = labelOf($, el);
        if (lab && /[.:]\s*$/.test(clean($(el).children().first().text())) && lab.label.split(/\s+/).length <= 6) {
          block.traits.push({
            label: lab.label,
            text: clean(lab.rest.text()).replace(/^[.:\s]+/, ""),
            md: toMarkdown($, lab.rest.contents()).replace(/^[.:\s]+/, ""),
          });
          continue;
        }
      }
      addExtra(toMarkdown($, el), text);
    }
    return block;
  };
  const first = run(false);
  if (first.traits.length) return first;
  const second = run(true);
  return second.traits.length ? second : first;
}

interface Group {
  h1: string | null;
  pre: Element[];
  subs: { heading: string; nodes: Element[] }[];
}

function groupPage($: $Root, content: ReturnType<typeof loadPage>["content"]): Group[] {
  const groups: Group[] = [];
  let cur: Group = { h1: null, pre: [], subs: [] };
  groups.push(cur);
  for (const el of flatChildren($, content)) {
    if (el.name === "h1") {
      cur = { h1: textOf($, el).replace(/\s+-\s+/g, ": "), pre: [], subs: [] };
      groups.push(cur);
    } else if (el.name === "h2") {
      cur.subs.push({ heading: textOf($, el), nodes: [] });
    } else if (cur.subs.length) cur.subs[cur.subs.length - 1].nodes.push(el);
    else cur.pre.push(el);
  }
  return groups.filter((g) => g.h1 !== null || g.pre.length || g.subs.length);
}

const SOURCE_TYPOS: [RegExp, string][] = [
  [/guildmaster'?s'? guide to ravnica/i, "Guildmasters' Guide to Ravnica"],
  [/mythic odyssey of theros/i, "Mythic Odysseys of Theros"],
  [/elemental evil player'?s guide/i, "Elemental Evil Player's Companion"],
  [/spelljamer: adventures in space(?:: astral adventurer's guide)?/i, "Astral Adventurer's Guide"],
  [/^acquisitions inc\.?$/i, "Acquisitions Incorporated"],
  [/^tal'?dorei campaign setting reborn$/i, "Tal'Dorei Campaign Setting Reborn"],
];

/** Normalise wiki source names: " - " to ": ", typos, trailing page numbers / junk */
export function fixSourceName(s: string): string {
  let t = clean(s)
    .replace(/\s+-\s+/g, ": ")
    .replace(/,?\s*p(?:age|g)?\.?\s*\d+.*$/i, "")
    .replace(/\.$/, "")
    .trim();
  if (t.length > 60) t = t.replace(/\s+(?=You |The |This )[\s\S]*$/, "");
  for (const [re, to] of SOURCE_TYPOS) if (re.test(t)) t = t.replace(re, to);
  return t;
}

function parseSize(text: string): string | undefined {
  const m = text.match(/(?:size is|you are(?: a)?|are)\s+(Tiny|Small|Medium|Large)(?:\s+or\s+(Tiny|Small|Medium|Large))?/i);
  if (!m) return undefined;
  const a = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  if (!m[2]) return a;
  const b = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
  return [a, b].includes("Small") && [a, b].includes("Medium") ? "Medium or Small" : `${a} or ${b}`;
}

type SpeedMap = SpeciesData["speed"];
const SPEED_MODES: Record<string, keyof SpeedMap> = {
  flying: "fly",
  fly: "fly",
  swimming: "swim",
  swim: "swim",
  climbing: "climb",
  climb: "climb",
  burrowing: "burrow",
  burrow: "burrow",
};

function parseSpeeds(text: string): Partial<SpeedMap> {
  const out: Partial<SpeedMap> = {};
  const w = text.match(/(?:base )?walking speed (?:is|of|increases to)\s+(\d+)/i) ?? text.match(/base walking speed of (\d+)/i);
  if (w) out.walk = parseInt(w[1], 10);
  for (const m of text.matchAll(/(flying|swimming|climbing|burrowing|fly|swim|climb|burrow)(?: speed)?(?:ing)? (?:speed )?of (\d+)/gi)) {
    out[SPEED_MODES[m[1].toLowerCase()]] = parseInt(m[2], 10);
  }
  for (const m of text.matchAll(/(flying|swimming|climbing|burrowing) speed equal to your walking speed/gi)) {
    out[SPEED_MODES[m[1].toLowerCase()]] = -1; // marker: equal to walk
  }
  return out;
}

function parseLanguages(text: string, ownerId: string): { ids: string[]; choices: Choice[] } {
  const t = clean(text).replace(/\([^)]*\)/g, "");
  const sentence = t.split(/(?<=\.)\s+/).find((s) => /\b(speak|read|write)\b/i.test(s)) ?? t;
  const ids: string[] = [];
  const re = /(?:write|speak|read)\s+((?:[A-Z][\w']*(?:\s[A-Z][\w']*)*)(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)[A-Z][\w']*(?:\s[A-Z][\w']*)*)*)/g;
  for (const m of sentence.matchAll(re)) {
    for (const item of m[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/)) {
      const id = languageId(item);
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  const choices: Choice[] = [];
  const cm = sentence.match(/\b(one|two|three)\s+(?:extra |additional |other )?languages?\b/i);
  if (cm && /(of your choice|that you and your|additional|extra|other)/i.test(sentence)) {
    choices.push(mkChoice(`${ownerId}:languages`, "Language", numberWord(cm[1]), { kind: "languages" }, [
      { type: "proficiency", kind: "language", ids: ["$id"] },
    ]));
  }
  return { ids, choices };
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

function titleOf($: $Root): string {
  return clean($("title").first().text())
    .replace(/\s+-\s+DND 5th Edition.*$/i, "")
    .replace(/^Lineage:\s*/i, "");
}

const SUB_ALIAS: Record<string, string> = { "dark elf": "drow" };

function subSlug(heading: string, speciesTitle: string): string {
  const norm = (s: string) => clean(s).toLowerCase().replace(/-/g, " ");
  const h = norm(heading);
  if (SUB_ALIAS[h]) return SUB_ALIAS[h];
  const sp = norm(speciesTitle);
  const stripped = clean(h.replace(new RegExp(`\\b${sp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), ""));
  return slugify(stripped || h);
}

interface Variant {
  heading: string | null;
  source: string | null;
  block: Block;
  subs: { block: Block; heading: string; source: string | null; h1: string | null }[];
}

export function parseLineage(
  slug: string,
  html: string,
  category: string,
): {
  species: ContentRow<SpeciesData>[];
  subspecies: ContentRow<SubspeciesData>[];
  features: ContentRow<FeatureData>[];
} {
  const result = {
    species: [] as ContentRow<SpeciesData>[],
    subspecies: [] as ContentRow<SubspeciesData>[],
    features: [] as ContentRow<FeatureData>[],
  };
  const { $, content } = loadPage(html);
  const baseSlug = slugify(slug.replace(/^lineage:/i, ""));
  const title = titleOf($) || baseSlug;

  // ---- group into variants ----
  const groups = groupPage($, content);
  const variants: Variant[] = [];
  let pendingIntro: string[] = [];
  for (const [gi, g] of groups.entries()) {
    let pre = parseBlock($, g.h1 ?? title, g.pre);
    const subs = g.subs.map((s) => parseBlock($, s.heading, s.nodes));
    const hasTraits = pre.traits.length > 0;
    if (!hasTraits && subs.length && subs[0].traits.length) {
      const promote =
        /\b(features|traits)\b/i.test(subs[0].heading) || (variants.length === 0 && g.h1 === null && !g.pre.some((e) => e.name === "ul"));
      if (promote) {
        const s0 = subs.shift()!;
        pre = { heading: pre.heading, intro: [...pre.intro, ...s0.intro], traits: s0.traits, source: s0.source ?? pre.source };
      }
    }
    if (variants.length === 0 && !pre.traits.length && !subs.length && gi < groups.length - 1) {
      // preamble-only block (intro text before the first variant heading)
      pendingIntro.push(...pre.intro);
      continue;
    }
    if (pendingIntro.length && (variants.length === 0 || pre.traits.length)) {
      pre.intro = [...pendingIntro, ...pre.intro];
      pendingIntro = [];
    }
    const isVariant = variants.length === 0 || pre.traits.length > 0;
    const mkSubs = (bs: Block[]) =>
      bs.map((b) => ({ block: b, heading: b.heading, source: b.source ?? null, h1: g.h1 }));
    if (isVariant) {
      variants.push({ heading: g.h1, source: pre.source ?? null, block: pre, subs: mkSubs(subs) });
    } else {
      // h2-only group: subraces of the base species
      const base = variants[0];
      for (const s of mkSubs(subs)) {
        s.source ??= pre.source ?? null;
        base.subs.push(s);
      }
    }
  }
  if (!variants.length) {
    warn(`${slug}: no content found`);
    return result;
  }

  // ---- build rows ----
  const usedSpecies = new Set<string>();
  const usedSub = new Set<string>();
  const baseId = `species:${baseSlug}`;
  let baseData: SpeciesData | null = null;

  const srcFor = (heading: string | null, sourceLine: string | null) => {
    const src = sourceLine ?? heading;
    const mapped = mapSource(src ? fixSourceName(src) : "");
    const kind = category === "Unearthed Arcana" ? "ua" : mapped.sourceKind;
    return { source: mapped.source, sourceKind: kind } as const;
  };

  const makeFeatures = (
    ownerType: "species" | "subspecies",
    ownerId: string,
    traits: Trait[],
    src: { source: string; sourceKind: "official" | "ua" | "homebrew" },
    ownerSub: boolean,
    acc: Grants & { speed: Partial<SpeedMap>; darkvision?: number },
  ) => {
    const used = new Set<string>();
    let sort = 0;
    for (const tr of traits) {
      const low = tr.label.toLowerCase();
      if (SKIP_TRAITS.test(low)) continue;
      const fid = uniqueId(`${ownerId}/${slugify(tr.label)}`, used);
      let g: Grants = { effects: [], choices: [] };
      g = analyzeTrait(tr.label, tr.text, fid);
      if (/darkvision/i.test(low)) {
        const m = tr.text.match(/(\d+)\s*(?:feet|ft)/i);
        if (m) acc.darkvision = Math.max(acc.darkvision ?? 0, parseInt(m[1], 10));
      } else {
        const sp = parseSpeeds(tr.text);
        if (ownerSub) {
          if (sp.walk && /\bwalking speed\b/i.test(tr.text)) acc.speed.walk = sp.walk;
        }
        for (const mode of ["fly", "swim", "climb", "burrow"] as const) {
          if (sp[mode] !== undefined && !acc.speed[mode]) acc.speed[mode] = sp[mode];
        }
      }
      result.features.push(
        row<FeatureData>({
          id: fid,
          name: tr.label,
          ...src,
          description: tr.md,
          effects: g.effects,
          choices: g.choices,
          data: { ownerType, ownerId, level: 1, sort: sort++ },
        }),
      );
    }
  };

  variants.forEach((v, vi) => {
    const variantSlug = v.heading ? slugify(v.heading) : "";
    const speciesId = vi === 0 ? baseId : uniqueId(`${baseId}@${variantSlug || vi}`, usedSpecies);
    if (vi === 0) usedSpecies.add(baseId);
    const src = srcFor(v.heading, v.source);
    const effects: Effect[] = [];
    const choices: Choice[] = [];
    let size: string | undefined;
    const speed: Partial<SpeedMap> = {};
    let darkvision: number | undefined;
    let languages: string[] = [];
    let sawAsi = false;

    for (const tr of v.block.traits) {
      const low = tr.label.toLowerCase();
      if (low.startsWith("ability score")) {
        const a = parseAbilityIncrease(tr.text, speciesId);
        if (a.ok) {
          sawAsi = true;
          effects.push(...a.effects);
          choices.push(...a.choices);
        } else warn(`${slug}: could not parse ASI "${tr.text.slice(0, 80)}"`);
      } else if (low === "size") size ??= parseSize(tr.text);
      else if (low === "speed") Object.assign(speed, parseSpeeds(tr.text));
      else if (/^languages?$/.test(low)) {
        const l = parseLanguages(tr.text, speciesId);
        languages = l.ids;
        choices.push(...l.choices);
      }
    }
    void sawAsi;

    const acc = { effects: [], choices: [], speed, darkvision } as Grants & { speed: Partial<SpeedMap>; darkvision?: number };
    // features (also collects extra movement modes + darkvision)
    makeFeatures("species", speciesId, v.block.traits, src, false, acc);
    darkvision = acc.darkvision;
    if (darkvision) effects.push({ type: "sense", sense: "darkvision", range: darkvision });

    const walk = speed.walk ?? baseData?.speed.walk;
    const finalSpeed: SpeedMap = { walk: walk ?? 30 };
    for (const mode of ["fly", "swim", "climb", "burrow"] as const) {
      const val = speed[mode];
      if (val !== undefined) finalSpeed[mode] = val === -1 ? finalSpeed.walk : val;
    }
    if (!size) size = baseData?.size;
    if (!size || speed.walk === undefined) {
      if (vi === 0 || !baseData) warn(`${slug}: ${v.heading ?? "page"}: missing ${!size ? "size" : "speed"}`);
    }
    if (!languages.length && baseData && vi > 0) languages = [];

    const data: SpeciesData = {
      baseId,
      variantLabel: v.heading ?? (v.source ? fixSourceName(v.source) : ""),
      size: size ?? "Medium",
      speed: finalSpeed,
      ...(darkvision ? { darkvision } : {}),
      languages,
      category,
    };
    if (vi === 0) baseData = data;
    result.species.push(
      row<SpeciesData>({
        id: speciesId,
        name: vi === 0 ? title : `${title} (${v.heading ?? variantSlug})`,
        ...src,
        description: v.block.intro.join("\n\n"),
        effects,
        choices,
        data,
      }),
    );

    // ---- subspecies ----
    for (const s of v.subs) {
      const sSlug = subSlug(s.heading, title) || slugify(s.heading);
      let subId = `subspecies:${speciesId.replace(/^species:/, "")}:${sSlug}`;
      if (usedSub.has(subId) && s.h1) subId = `subspecies:${speciesId.replace(/^species:/, "")}:${sSlug}@${slugify(s.h1)}`;
      subId = uniqueId(subId, usedSub);
      const sSrc = srcFor(s.h1 ?? v.heading, s.source ?? (s.h1 ? null : v.source));
      const sEffects: Effect[] = [];
      const sChoices: Choice[] = [];
      const sSpeed: Partial<SpeedMap> = {};
      for (const tr of s.block.traits) {
        const low = tr.label.toLowerCase();
        if (low.startsWith("ability score")) {
          const a = parseAbilityIncrease(tr.text, subId);
          if (a.ok) {
            sEffects.push(...a.effects);
            sChoices.push(...a.choices);
          } else warn(`${slug}: ${s.heading}: could not parse ASI "${tr.text.slice(0, 80)}"`);
        } else if (/^languages?$/.test(low)) {
          const l = parseLanguages(tr.text, subId);
          const lids = l.ids.filter((i) => i !== "common");
          if (lids.length) sEffects.push({ type: "proficiency", kind: "language", ids: lids });
          sChoices.push(...l.choices);
        } else if (low === "speed") Object.assign(sSpeed, parseSpeeds(tr.text));
      }
      const sAcc = { effects: [], choices: [], speed: sSpeed } as Grants & { speed: Partial<SpeedMap>; darkvision?: number };
      makeFeatures("subspecies", subId, s.block.traits, sSrc, true, sAcc);
      if (sAcc.darkvision) sEffects.push({ type: "sense", sense: "darkvision", range: sAcc.darkvision });
      if (sSpeed.walk) sEffects.push({ type: "speed", mode: "walk", op: "set", value: sSpeed.walk });
      for (const mode of ["fly", "swim", "climb", "burrow"] as const) {
        const val = sSpeed[mode];
        if (val === -1) sEffects.push({ type: "speed", mode, op: "equalWalk" });
        else if (val) sEffects.push({ type: "speed", mode, op: "set", value: val });
      }
      const intro = s.block.intro.join("\n\n");
      if (/\breplace/i.test(intro)) {
        const sent = clean(intro.replace(/[*_]/g, "")).split(/(?<=\.)\s+/).find((x) => /replace/i.test(x));
        if (sent) sEffects.push({ type: "note", text: sent });
      }
      const sData: SubspeciesData = { speciesId };
      // e.g. Variant Human: "...all of which replace the human's Ability Score Increase trait"
      const replaceSent = clean(intro.replace(/[*_]/g, "")).split(/(?<=\.)\s+/).find((x) => /replace/i.test(x) && /ability score/i.test(x));
      if (replaceSent) sData.replacesSpeciesAsi = true;
      if (sSpeed.walk) sData.speedWalk = sSpeed.walk;
      if (sAcc.darkvision) sData.darkvision = sAcc.darkvision;
      result.subspecies.push(
        row<SubspeciesData>({
          id: subId,
          name: sSlug === "variant" ? `Variant ${title}` : s.heading,
          ...sSrc,
          description: intro,
          effects: sEffects,
          choices: sChoices,
          data: sData,
        }),
      );
    }
  });

  void toMarkdownAll;
  return result;
}
