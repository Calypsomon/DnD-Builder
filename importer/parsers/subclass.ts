import type { Element } from "domhandler";
import type { Choice } from "../../shared/types/effects";
import type { ClassData, ContentRow, FeatureData, SourceKind, SubclassData } from "../../shared/types/content";
import {
  clean,
  findSource,
  flatChildren,
  loadPage,
  mapSource,
  parseOrdinal,
  row,
  slugify,
  tableRows,
  textOf,
  toMarkdownAll,
  warn,
  type $Root,
} from "./common";
import { levelFromText, normName } from "./class";

type Ref = { slug: string; name: string; source: string; sourceKind: SourceKind };

const SPELL_HEADING = /^(?:.*\s)?(?:spells|spell list)$/i;

function ordinalStr(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Convert a "Spell Level" (1..9) to the class level at which the class gets slots of that level */
function classLevelForSpellLevel(cls: ContentRow<ClassData>, n: number): number {
  const t = cls.data.table;
  const slotCol = t.find((r) => r.columns["Slot Level"] !== undefined);
  if (slotCol) {
    const r = t.find((x) => (parseOrdinal(x.columns["Slot Level"] ?? "") ?? 0) >= n);
    if (r) return r.level;
  }
  const key = ordinalStr(n);
  const r = t.find((x) => x.columns[key] && x.columns[key] !== "0");
  return r ? r.level : n;
}

function spellSlugsFromCell($: $Root, cell: Element): string[] {
  const links = $(cell).find("a");
  const fromLinks: string[] = [];
  links.each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const m = href.match(/spell:([a-z0-9-]+)/i);
    if (m) fromLinks.push(m[1].toLowerCase());
  });
  if (fromLinks.length) return fromLinks.map((s) => `spell:${s}`);
  return textOf($, cell)
    .split(",")
    .map((s) => slugify(s.replace(/\([^)]*\)/g, "")))
    .filter(Boolean)
    .map((s) => `spell:${s}`);
}

/** Find spell tables on a page ("Cleric Level | Spells") */
function parseSpellTables($: $Root, tables: Element[], cls: ContentRow<ClassData>) {
  const out: NonNullable<import("../../shared/types/content").SubclassData["spells"]> = [];
  const classSlug = cls.id.replace("class:", "");
  for (const t of tables) {
    const trs = $(t).find("tr").toArray() as Element[];
    const hi = trs.findIndex((tr) => {
      const c = $(tr).find("th,td");
      return c.length >= 2 && /^spells?$/i.test(textOf($, c.eq(1))) && /level/i.test(textOf($, c.eq(0)));
    });
    if (hi < 0) continue;
    const spellLevelMode = /^spell level/i.test(textOf($, $(trs[hi]).find("th,td").eq(0)));
    for (const tr of trs.slice(hi + 1)) {
      const c = $(tr).find("th,td");
      if (c.length < 2) continue;
      const n = parseOrdinal(textOf($, c.eq(0)));
      if (!n) continue;
      const spellIds = spellSlugsFromCell($, c.get(1) as Element);
      if (!spellIds.length) continue;
      out.push({
        level: spellLevelMode ? classLevelForSpellLevel(cls, n) : n,
        spellIds,
        alwaysPrepared: classSlug !== "warlock",
      });
    }
  }
  return out;
}

export function parseSubclass(
  slug: string,
  html: string,
  cls: ContentRow<ClassData>,
  ref: Ref,
): { subclass: ContentRow<SubclassData>; features: ContentRow<FeatureData>[] } {
  const { $, content } = loadPage(html);
  const classSlug = cls.id.replace("class:", "");
  const subId = `subclass:${slug.includes(":") ? slug : `${classSlug}:${slug}`}`;
  const nodes = flatChildren($, content);

  // source
  const srcLine = findSource($, content);
  let { source, sourceKind } = srcLine ? mapSource(srcLine) : { source: ref.source, sourceKind: ref.sourceKind };
  if (!srcLine || !source) ({ source, sourceKind } = ref);
  if (ref.sourceKind === "ua") {
    source = "UA";
    sourceKind = "ua";
  }

  // heading tag
  const tag = ["h3", "h2", "h4"].find((t) => nodes.some((n) => n.name === t));
  type Sec = { heading: string; nodes: Element[] };
  const intro: Element[] = [];
  const sects: Sec[] = [];
  if (tag) {
    let cur: Sec | null = null;
    for (const n of nodes) {
      if (n.name === tag) {
        cur = { heading: textOf($, n), nodes: [] };
        sects.push(cur);
      } else if (cur) cur.nodes.push(n);
      else if (n.name !== "h1" && n.name !== "h2" && n.name !== "h3") intro.push(n);
    }
  } else {
    sects.push({ heading: ref.name, nodes: nodes.filter((n) => !/^Source:/i.test(textOf($, n))) });
  }
  const isSource = (n: Element) => n.name === "p" && /^Source:/i.test(textOf($, n));
  const description = tag ? toMarkdownAll($, intro.filter((n) => !isSource(n))) : "";

  // spells
  const allTables = $("#page-content table").toArray() as Element[];
  const spells = parseSpellTables($, allTables, cls);

  // levels
  const label = cls.data.subclassLabel;
  const subLevels = new Set<number>([cls.data.subclassLevel]);
  for (const r of cls.data.table)
    for (const f of r.features) {
      const m = clean(f).match(/^(.*?)\s+feature$/i);
      if (m && (normName(m[1]) === normName(label) || /feature/i.test(f))) subLevels.add(r.level);
    }
  const classLevels = [...subLevels].sort((a, b) => a - b);

  const detected: (number | null)[] = sects.map((s) => {
    if (SPELL_HEADING.test(s.heading)) return cls.data.subclassLevel;
    if (/^tenets|^the (code|creed)|^restrictions?|^oath of/i.test(s.heading)) return cls.data.subclassLevel;
    return levelFromText($, s.nodes);
  });
  const used = new Set(detected.filter((x): x is number => x != null));
  const levels: number[] = [];
  let prev = cls.data.subclassLevel;
  detected.forEach((d, i) => {
    if (d != null) {
      levels.push(d);
      prev = d;
      return;
    }
    const cand = classLevels.find((l) => !used.has(l) && l >= prev);
    if (cand != null) {
      used.add(cand);
      levels.push(cand);
      prev = cand;
    } else {
      warn(`${subId}: no level for feature "${sects[i].heading}", using ${prev}`);
      levels.push(prev);
    }
  });

  const usedIds = new Set<string>();
  const features = sects.map((s, i) => {
    const name = s.heading.replace(/\s*\(Optional\)\s*/i, "").trim();
    let id = `${subId}/${slugify(name)}`;
    if (usedIds.has(id)) {
      let n = 2;
      while (usedIds.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    usedIds.add(id);
    const level = levels[i];
    const choices: Choice[] = [];
    if (subId === "subclass:fighter:battle-master") {
      if (slugify(name) === "combat-superiority") {
        const from = { kind: "classOptions" as const, group: "maneuver", classId: "class:fighter" };
        choices.push({ id: `${id}:choice`, label: "Maneuvers", level, count: 3, from });
        [7, 10, 15].forEach((l, k) => choices.push({ id: `${id}:choice-${k + 2}`, label: "Maneuvers", level: l, count: 2, from }));
      } else if (slugify(name) === "student-of-war") {
        choices.push({
          id: `${id}:choice`,
          label: "Artisan's Tools",
          level,
          count: 1,
          from: { kind: "tools" },
          grants: [{ type: "proficiency", kind: "tool", ids: ["$id"] }],
        });
      }
    }
    return row<FeatureData>({
      id,
      name,
      source,
      sourceKind,
      description: toMarkdownAll($, s.nodes.filter((n) => !isSource(n))),
      data: { ownerType: "subclass", ownerId: subId, level, sort: i },
      choices,
    });
  });

  const subclass = row<SubclassData>({
    id: subId,
    name: ref.name,
    source,
    sourceKind,
    description,
    data: { classId: cls.id, ...(spells.length ? { spells } : {}) },
  });
  return { subclass, features };
}
