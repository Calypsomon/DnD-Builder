import type { AnyNode, Element } from "domhandler";
import type { Ability, Choice } from "../../shared/types/effects";
import {
  SKILLS,
  type ClassData,
  type ClassOptionData,
  type ClassTableRow,
  type ContentRow,
  type FeatureData,
  type SourceKind,
} from "../../shared/types/content";
import {
  abilityFromName,
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
  toMarkdown,
  toMarkdownAll,
  warn,
  type $Root,
} from "./common";

export interface SubclassRef {
  slug: string;
  name: string;
  source: string;
  sourceKind: SourceKind;
}

export interface ParsedClass {
  cls: ContentRow<ClassData>;
  features: ContentRow<FeatureData>[];
  subclassRefs: SubclassRef[];
  classOptions: ContentRow<ClassOptionData>[];
}

type Spellcasting = NonNullable<ClassData["spellcasting"]>;

const SPELLCASTING: Record<string, Spellcasting> = {
  wizard: { type: "full", ability: "int", mode: "spellbook", ritual: true, preparedFormula: "int + level" },
  cleric: { type: "full", ability: "wis", mode: "prepared", ritual: true, preparedFormula: "wis + level" },
  druid: { type: "full", ability: "wis", mode: "prepared", ritual: true, preparedFormula: "wis + level" },
  bard: { type: "full", ability: "cha", mode: "known", ritual: true },
  sorcerer: { type: "full", ability: "cha", mode: "known", ritual: false },
  warlock: { type: "pact", ability: "cha", mode: "known", ritual: false },
  paladin: { type: "half", ability: "cha", mode: "prepared", ritual: false, preparedFormula: "cha + floor(level / 2)" },
  ranger: { type: "half", ability: "wis", mode: "known", ritual: false },
  artificer: { type: "artificer", ability: "int", mode: "prepared", ritual: true, preparedFormula: "int + ceil(level / 2)" },
};

const DEFAULT_SOURCE: Record<string, string> = { artificer: "TCE" };

/** Lower-case feature name for comparisons: drop "(Optional)", "(x2)", "(1/rest)" ... */
export function normName(s: string): string {
  return clean(s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[.:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split "A, B (x, y), C" at commas outside parentheses */
function splitFeatures(cell: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of cell) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => clean(s)).filter((s) => s && !/^[-—–]$/.test(s));
}

function emptyCell(s: string): string {
  return /^[-—–]$/.test(clean(s)) ? "" : clean(s);
}

/** Parse the class progression table */
export function parseProgressionTable($: $Root, table: AnyNode): ClassTableRow[] {
  const rows = tableRows($, table);
  const hi = rows.findIndex((r) => /^level$/i.test(r[0] ?? ""));
  if (hi < 0) return [];
  const header = rows[hi];
  const iPb = header.findIndex((h) => /proficiency/i.test(h));
  const iFe = header.findIndex((h) => /^features?$/i.test(h));
  const out: ClassTableRow[] = [];
  for (const r of rows.slice(hi + 1)) {
    const level = parseOrdinal(r[0] ?? "");
    if (!level) continue;
    if (r.length !== header.length) warn(`class table row ${level}: ${r.length} cells vs ${header.length} header cells`);
    const columns: Record<string, string> = {};
    header.forEach((h, i) => {
      if (i === 0 || i === iPb || i === iFe) return;
      columns[h] = emptyCell(r[i] ?? "");
    });
    out.push({
      level,
      pb: parseInt((r[iPb] ?? "").replace(/[^\d]/g, ""), 10) || 2,
      features: splitFeatures(r[iFe] ?? ""),
      columns,
    });
  }
  return out;
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function parseArmor(text: string): string[] {
  const t = text.toLowerCase();
  const out: string[] = [];
  if (/all armor/.test(t)) out.push("light", "medium", "heavy");
  else {
    if (/light/.test(t)) out.push("light");
    if (/medium/.test(t)) out.push("medium");
    if (/heavy/.test(t)) out.push("heavy");
  }
  if (/shield/.test(t)) out.push("shields");
  return out;
}

function singular(slug: string): string {
  return slug.endsWith("s") && !slug.endsWith("ss") ? slug.slice(0, -1) : slug;
}

function parseWeapons(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/,|;|\band\b/)) {
    const p = clean(part).toLowerCase();
    if (!p || p === "none") continue;
    if (/simple weapons?$/.test(p)) out.push("simple");
    else if (/martial weapons?/.test(p)) out.push("martial");
    else out.push(singular(slugify(p)));
  }
  return [...new Set(out)];
}

function parseTools(text: string): string[] {
  if (/choice|any|one type|choose/i.test(text)) return [];
  const out: string[] = [];
  for (const part of text.split(/,|\band\b/)) {
    const p = clean(part);
    if (!p || /^none$/i.test(p)) continue;
    out.push(slugify(p));
  }
  return out;
}

function parseSkillChoice(text: string): { count: number; from: string[] } {
  const countM = text.match(/choose\s+(?:any\s+)?(one|two|three|four|five|six)/i);
  const count = countM ? WORD_NUM[countM[1].toLowerCase()] : 2;
  if (/choose any/i.test(text)) return { count, from: Object.keys(SKILLS) };
  const lower = text.toLowerCase();
  const from = Object.keys(SKILLS).filter((id) => lower.includes(id.replace(/-/g, " ")));
  return { count, from };
}

interface Section {
  heading: string;
  nodes: Element[];
}

/** Split flat elements at h3 */
function splitAtH3($: $Root, nodes: Element[]): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const n of nodes) {
    if (n.name === "h3") {
      cur = { heading: textOf($, n), nodes: [] };
      out.push(cur);
    } else if (cur) cur.nodes.push(n);
  }
  return out;
}

const LEVEL_TEXT =
  /\b(?:at|starting at|beginning at|when you reach|by|upon reaching|from)\s+(?:level\s+)?(\d+)(?:st|nd|rd|th)?[ -]level|\bat level (\d+)\b|^(\d+)(?:st|nd|rd|th)-level\b|^level (\d+)\+/i;

/** First level mentioned in the first paragraphs of a feature description */
export function levelFromText($: $Root, nodes: Element[]): number | null {
  let seen = 0;
  for (const n of nodes) {
    if (n.name !== "p" && n.name !== "ul") continue;
    const m = textOf($, n).match(LEVEL_TEXT);
    if (m) return parseInt(m[1] ?? m[2] ?? m[3] ?? m[4], 10);
    if (++seen >= 2) break;
  }
  return null;
}

/** Options given as `li` elements with a bold/italic label, e.g. "<strong>Archery (PHB).</strong> text" */
export function liOptions(
  $: $Root,
  nodes: Element[],
  group: string,
  classId: string,
  defaultSource = "PHB",
): ContentRow<ClassOptionData>[] {
  const out: ContentRow<ClassOptionData>[] = [];
  for (const n of nodes) {
    if (n.name !== "ul" && n.name !== "ol") continue;
    $(n)
      .children("li")
      .each((_, li) => {
        const label = $(li).children("strong,em").first();
        if (!label.length) return;
        let raw = textOf($, label).replace(/[.:]+$/, "").trim();
        if (!raw) return;
        let source = defaultSource;
        let kind: SourceKind = "official";
        const m = raw.match(/^(.*?)\s*\(([A-Za-z]{2,6})\)$/);
        if (m) {
          raw = m[1];
          source = m[2];
          if (source === "UA") kind = "ua";
          else if (source === "HB") kind = "homebrew";
        }
        const c = $(li).clone();
        c.children("strong,em").first().remove();
        let prerequisite: string | undefined;
        c.find("li").each((__, sub) => {
          const t = textOf($, sub);
          const pm = t.match(/^Prerequisite:?\s*(.+)$/i);
          if (pm && prerequisite === undefined) {
            prerequisite = pm[1];
            $(sub).remove();
          }
        });
        const desc = toMarkdown($, c.contents());
        const levelReq = prerequisite ? (parseOrdinal(prerequisite) ?? undefined) : undefined;
        const suffix = kind === "official" ? "" : `-${kind === "ua" ? "ua" : "hb"}`;
        out.push(
          row<ClassOptionData>({
            id: `option:${group}:${slugify(raw)}${suffix}`,
            name: raw,
            source,
            sourceKind: kind,
            description: desc,
            data: { group, classIds: [classId], ...(levelReq ? { levelReq } : {}), ...(prerequisite ? { prerequisite } : {}) },
          }),
        );
      });
  }
  return out;
}

/** Merge rows with the same id; classIds are united */
export function mergeClassOptions(rows: ContentRow<ClassOptionData>[]): ContentRow<ClassOptionData>[] {
  const map = new Map<string, ContentRow<ClassOptionData>>();
  for (const r of rows) {
    const ex = map.get(r.id);
    if (!ex) {
      map.set(r.id, { ...r, data: { ...r.data, classIds: [...r.data.classIds] } });
      continue;
    }
    for (const c of r.data.classIds) if (!ex.data.classIds.includes(c)) ex.data.classIds.push(c);
    if (!ex.description && r.description) ex.description = r.description;
  }
  return [...map.values()];
}

function hrefSlug(href: string): string {
  return href
    .replace(/^https?:\/\/dnd5e\.wikidot\.com/, "")
    .replace(/^\//, "")
    .split("#")[0]
    .split("?")[0];
}

function parseSubclassRefs($: $Root, table: AnyNode, classSlug: string): SubclassRef[] {
  const out: SubclassRef[] = [];
  let mode: SourceKind | null = null;
  $(table)
    .find("tr")
    .each((i, tr) => {
      const cells = $(tr).find("th,td");
      if (cells.length === 1) {
        const t = textOf($, cells.first());
        mode = /homebrew/i.test(t) ? "homebrew" : "ua";
        return;
      }
      if (i === 0 || cells.length < 2) return;
      const a = cells.eq(0).find("a").first();
      const href = a.attr("href");
      if (!href) {
        warn(`${classSlug}: subclass row without link: ${textOf($, cells.eq(0))}`);
        return;
      }
      const slug = hrefSlug(href);
      if (!slug.startsWith(`${classSlug}:`)) return;
      const srcText = textOf($, cells.eq(1));
      const mapped = mapSource(srcText);
      let kind: SourceKind = mode ?? mapped.sourceKind;
      let source = mapped.source;
      if (kind === "ua") source = "UA";
      if (kind === "homebrew") source = "HB";
      out.push({ slug, name: textOf($, cells.eq(0)), source, sourceKind: kind });
    });
  return out;
}

export function parseClass(slug: string, html: string): ParsedClass {
  const { $, content } = loadPage(html);
  const classId = `class:${slug}`;
  const nodes = flatChildren($, content);

  // ---------- intro / progression table ----------
  const tableEl = nodes.find((n) => n.name === "table") as Element | undefined;
  const tableIdx = tableEl ? nodes.indexOf(tableEl) : -1;
  const h1Idx = nodes.findIndex((n) => n.name === "h1");
  const introNodes = nodes.slice(0, tableIdx >= 0 ? tableIdx : 0);
  let multiclassRequirement = "";
  const introKeep: Element[] = [];
  for (const n of introNodes) {
    const t = textOf($, n);
    if (/multiclass/i.test(t) && /score/i.test(t)) multiclassRequirement = t.replace(/^\*|\*$/g, "");
    else if (!/^Source:/i.test(t)) introKeep.push(n);
  }
  const table: ClassTableRow[] = tableEl ? parseProgressionTable($, tableEl) : [];
  if (table.length !== 20) warn(`${slug}: progression table has ${table.length} rows`);

  // ---------- Hit points / proficiencies / equipment (h5 groups before the first h3) ----------
  const firstH3 = nodes.findIndex((n) => n.name === "h3");
  const preNodes = nodes.slice(h1Idx >= 0 ? h1Idx + 1 : 0, firstH3 >= 0 ? firstH3 : nodes.length);
  const groups: Record<string, Element[]> = {};
  let g = "";
  for (const n of preNodes) {
    if (/^h[4-6]$/.test(n.name)) {
      g = textOf($, n).toLowerCase();
      groups[g] = [];
    } else if (g) groups[g].push(n);
  }
  const hpText = (groups["hit points"] ?? []).map((n) => textOf($, n)).join(" ");
  const hitDie = parseInt(hpText.match(/1d(\d+)/)?.[1] ?? "8", 10) as ClassData["hitDie"];
  const profEls = groups["proficiencies"] ?? [];
  const profFull = profEls.map((n) => textOf($, n)).join(" ");
  const lv: Record<string, string> = {};
  {
    const re = /(Armor|Weapons|Tools|Saving Throws|Skills):/g;
    const ms = [...profFull.matchAll(re)];
    ms.forEach((m, i) => {
      lv[m[1]] = clean(profFull.slice(m.index! + m[0].length, ms[i + 1]?.index ?? profFull.length));
    });
  }
  const pick = (k: string) => {
    const key = Object.keys(lv).find((x) => x.toLowerCase().startsWith(k));
    return key ? lv[key] : "";
  };
  const proficiencyText = {
    armor: pick("armor"),
    weapons: pick("weapons"),
    tools: pick("tools"),
    saves: pick("saving"),
    skills: pick("skills"),
  };
  if (!proficiencyText.saves) warn(`${slug}: no saving throws found`);
  const saves = proficiencyText.saves
    .split(/,|\band\b/)
    .map((s) => abilityFromName(s))
    .filter(Boolean) as Ability[];
  const eqNodes = Object.entries(groups).find(([k]) => k === "equipment")?.[1] ?? [];
  const startingEquipment = {
    text: toMarkdownAll($, eqNodes),
    options: eqNodes.flatMap((n) =>
      $(n)
        .find("li")
        .map((_, li) => textOf($, li))
        .get(),
    ),
  };

  // ---------- feature sections ----------
  const sects = splitAtH3($, nodes);
  const isSubclassSection = (s: Section) =>
    s.nodes.some((n) => n.name === "table" && /^source$/i.test(tableRows($, n).find((r) => r.length >= 2)?.[1] ?? ""));
  const subSect = sects.find(isSubclassSection);
  let subclassRefs: SubclassRef[] = [];
  let subclassLabel = "";
  if (subSect) {
    subclassLabel = subSect.heading.replace(/\(Optional\)/i, "").trim();
    const t = subSect.nodes.find((n) => n.name === "table" && /^source$/i.test(tableRows($, n).find((r) => r.length >= 2)?.[1] ?? ""));
    subclassRefs = parseSubclassRefs($, t!, slug);
  } else warn(`${slug}: no subclass section found`);

  // feature name → levels from the table
  const tableLevels = new Map<string, number[]>();
  const tableOptional = new Set<string>();
  for (const r of table)
    for (const f of r.features) {
      const k = normName(f);
      const arr = tableLevels.get(k) ?? [];
      if (!arr.includes(r.level)) arr.push(r.level);
      tableLevels.set(k, arr);
      if (/\(optional\)/i.test(f)) tableOptional.add(k);
    }

  const subLvls = tableLevels.get(normName(subclassLabel));
  let subclassLevel = subLvls?.[0] ?? 0;
  if (!subclassLevel && subSect) subclassLevel = levelFromText($, subSect.nodes) ?? 0;
  if (!subclassLevel) {
    warn(`${slug}: subclass level not found`);
    subclassLevel = 3;
  }
  const asiLevels = table.filter((r) => r.features.some((f) => normName(f) === "ability score improvement")).map((r) => r.level);

  const features: ContentRow<FeatureData>[] = [];
  const options: ContentRow<ClassOptionData>[] = [];
  const usedIds = new Set<string>();
  sects.forEach((s, idx) => {
    const optional = /\(optional\)/i.test(s.heading);
    const name = s.heading.replace(/\s*\(Optional\)\s*/i, "").trim();
    const key = normName(name);
    let id = `${classId}/${slugify(name)}`;
    if (usedIds.has(id)) {
      let n = 2;
      while (usedIds.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    usedIds.add(id);
    const levels = tableLevels.get(key);
    let level = levels?.[0] ?? levelFromText($, s.nodes) ?? 0;
    if (!level) {
      warn(`${classId}: no level for feature "${name}", using 1`);
      level = 1;
    }
    const nodesForDesc = s.nodes.filter((n) => !(s === subSect && n.name === "table" && isSubclassSection({ heading: "", nodes: [n] })));
    const choices: Choice[] = [];

    if (key === "fighting style") {
      choices.push({
        id: `${id}:choice`,
        label: "Fighting Style",
        level,
        count: 1,
        from: { kind: "classOptions", group: "fighting-style", classId },
      });
      options.push(...liOptions($, s.nodes, "fighting-style", classId));
    } else if (key === "expertise") {
      const lvls = levels && levels.length ? levels : [level];
      lvls.slice(0, 2).forEach((l, i) =>
        choices.push({
          id: `${id}:choice${i ? `-${i + 1}` : ""}`,
          label: "Expertise",
          level: l,
          count: 2,
          from: { kind: "skills" },
          grants: [{ type: "expertise", skills: ["$id"] }],
        }),
      );
    } else if (key === "eldritch invocations") {
      choices.push({
        id: `${id}:choice`,
        label: "Eldritch Invocations",
        level,
        count: "table:Invocations Known",
        from: { kind: "classOptions", group: "invocation", classId },
      });
    } else if (key === "pact boon") {
      choices.push({
        id: `${id}:choice`,
        label: "Pact Boon",
        level,
        count: 1,
        from: { kind: "classOptions", group: "pact-boon", classId },
      });
      options.push(...liOptions($, s.nodes, "pact-boon", classId));
    } else if (key === "metamagic") {
      choices.push({
        id: `${id}:choice`,
        label: "Metamagic",
        level,
        count: 2,
        from: { kind: "classOptions", group: "metamagic", classId },
      });
      for (const [i, l] of [10, 17].entries())
        choices.push({
          id: `${id}:choice-${i + 2}`,
          label: "Metamagic",
          level: l,
          count: 1,
          from: { kind: "classOptions", group: "metamagic", classId },
        });
      options.push(...liOptions($, s.nodes, "metamagic", classId));
    } else if (key === "infuse item") {
      choices.push({
        id: `${id}:choice`,
        label: "Infusions",
        level,
        count: "table:Infusions Known",
        from: { kind: "classOptions", group: "infusion", classId },
      });
    }

    features.push(
      row<FeatureData>({
        id,
        name,
        source: DEFAULT_SOURCE[slug] ?? "PHB",
        description: toMarkdownAll($, nodesForDesc),
        data: {
          ownerType: "class",
          ownerId: classId,
          level,
          sort: idx,
          ...(optional || tableOptional.has(key) ? { optional: true } : {}),
        },
        choices,
      }),
    );
  });

  // pact boon options use nested lists: liOptions handles `ul > li > strong` + nested ul
  const src = findSource($, content);
  const mapped = src ? mapSource(src) : { source: DEFAULT_SOURCE[slug] ?? "PHB", sourceKind: "official" as SourceKind };

  const cls = row<ClassData>({
    id: classId,
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    source: mapped.source,
    sourceKind: mapped.sourceKind,
    description: toMarkdownAll($, introKeep),
    data: {
      hitDie,
      saves,
      proficiencies: {
        armor: parseArmor(proficiencyText.armor),
        weapons: parseWeapons(proficiencyText.weapons),
        tools: parseTools(proficiencyText.tools),
      },
      proficiencyText,
      skillChoice: parseSkillChoice(proficiencyText.skills),
      startingEquipment,
      ...(SPELLCASTING[slug] ? { spellcasting: SPELLCASTING[slug] } : {}),
      table,
      subclassLevel,
      subclassLabel,
      asiLevels,
      multiclassRequirement,
    },
  });

  return { cls, features, subclassRefs, classOptions: mergeClassOptions(options) };
}
