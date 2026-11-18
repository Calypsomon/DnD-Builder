import type { Element } from "domhandler";
import type { Choice, Effect } from "../../shared/types/effects";
import type { BackgroundData, ContentRow, FeatureData } from "../../shared/types/content";
import { clean, flatChildren, loadPage, mapSource, row, slugify, tableRows, textOf, toMarkdown, toMarkdownAll, warn } from "./common";
import { fixSourceName, languageId, numberWord, skillsIn } from "./lineage";

/** Slugs `background:<x>` linked from the home page */
export function parseBackgroundIndex(homeHtml: string): string[] {
  const { $ } = loadPage(homeHtml);
  const out: string[] = [];
  $("a[href]").each((_, a) => {
    const href = ($(a).attr("href") ?? "").replace(/^\//, "").split(/[?#]/)[0];
    if (/^background:[^/]+$/i.test(href) && !out.includes(href)) out.push(href);
  });
  return out;
}

const LABELS = ["Skill Proficiencies", "Tool Proficiencies", "Languages", "Equipment", "Skills", "Tools"] as const;

function splitLabels(text: string): Record<string, string> {
  const re = new RegExp(`(${LABELS.join("|")}):`, "gi");
  const marks: { label: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(re)) marks.push({ label: m[1].toLowerCase(), start: m.index!, end: m.index! + m[0].length });
  const out: Record<string, string> = {};
  marks.forEach((m, i) => {
    const val = text.slice(m.end, i + 1 < marks.length ? marks[i + 1].start : undefined);
    out[m.label] = clean(val);
  });
  return out;
}

const NOTHING = /^(none|—|-|n\/a|)\.?$/i;

function parseSkills(text: string, bgId: string): { ids: string[]; effects: Effect[]; choices: Choice[] } {
  const effects: Effect[] = [];
  const choices: Choice[] = [];
  const found = skillsIn(text);
  if (NOTHING.test(text)) return { ids: [], effects, choices };
  const choiceRe = /\b(choose|your choice|of your choice|from (?:the following|among|any)|one of|two of|any (?:one|two|three)|any skill)/i;
  if (!choiceRe.test(text)) {
    if (found.length) effects.push({ type: "proficiency", kind: "skill", ids: found });
    return { ids: found, effects, choices };
  }
  // fixed skills + a choice: "Survival, plus one from among Arcana, History, and Religion"
  const plusIdx = text.search(/\b(plus|and (?:one|two)|one other)\b|,\s*(?:one|two)\b/i);
  if (plusIdx > 0) {
    const fixed = skillsIn(text.slice(0, plusIdx));
    const tail = text.slice(plusIdx);
    const tailSkills = skillsIn(tail);
    if (fixed.length) effects.push({ type: "proficiency", kind: "skill", ids: fixed });
    choices.push({
      id: `${bgId}:skills`,
      label: "Skill Proficiencies",
      level: 1,
      count: numberWord(tail.match(/\b(one|two|three)\b/i)?.[1], 1),
      from: { kind: "skills", ...(tailSkills.length >= 2 ? { ids: tailSkills } : {}) },
      grants: [{ type: "proficiency", kind: "skill", ids: ["$id"] }],
    });
    return { ids: fixed, effects, choices };
  }
  // choice present
  const listStyle = /\b(choose|from (?:the following|among)|one of|two of)\b/i.test(text) && found.length >= 3;
  const count = numberWord(text.match(/\b(one|two|three|four|any)\b/i)?.[1], 1);
  if (listStyle) {
    choices.push({
      id: `${bgId}:skills`,
      label: "Skill Proficiencies",
      level: 1,
      count: numberWord(text.match(/\b(one|two|three|four)\b/i)?.[1], 2),
      from: { kind: "skills", ids: found },
      grants: [{ type: "proficiency", kind: "skill", ids: ["$id"] }],
    });
    return { ids: [], effects, choices };
  }
  // "Insight and one Intelligence, Wisdom, or Charisma skill of your choice"
  const idx = text.search(/\b(one|two|any)\b/i);
  const fixed = skillsIn(idx > 0 ? text.slice(0, idx) : "");
  if (fixed.length) effects.push({ type: "proficiency", kind: "skill", ids: fixed });
  choices.push({
    id: `${bgId}:skills`,
    label: "Skill Proficiencies",
    level: 1,
    count,
    from: { kind: "skills" },
    grants: [{ type: "proficiency", kind: "skill", ids: ["$id"] }],
  });
  return { ids: fixed, effects, choices };
}

function parseTools(text: string, bgId: string): { ids: string[]; effects: Effect[]; choices: Choice[] } {
  const effects: Effect[] = [];
  const choices: Choice[] = [];
  const ids: string[] = [];
  if (NOTHING.test(text)) return { ids, effects, choices };
  const parts = text
    .replace(/\.$/, "")
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+(?=(?:one|two|any)\b)/i)
    .map((p) => clean(p))
    .filter((p) => p && !/^(likely|usually|probably|such as|something|as appropriate|depending|typically)\b/i.test(p));
  let n = 0;
  for (const p of parts) {
    if (/\s+or\s+/i.test(p) && !/\b(one|two|three|any|choice)\b/i.test(p)) {
      // "Cartographer's tools or navigator's tools"
      n++;
      choices.push({
        id: n === 1 ? `${bgId}:tools` : `${bgId}:tools-${n}`,
        label: "Tool Proficiency",
        level: 1,
        count: 1,
        from: { kind: "tools", ids: p.split(/\s+or\s+/i).map((x) => slugify(x)) },
        grants: [{ type: "proficiency", kind: "tool", ids: ["$id"] }],
      });
    } else if (/\b(one|two|three|any)\b.*(?:type|kind|of your choice)|of your choice|your choice|choice of|\bone type\b|^(any|one|two)\b/i.test(p)) {
      n++;
      choices.push({
        id: n === 1 ? `${bgId}:tools` : `${bgId}:tools-${n}`,
        label: "Tool Proficiency",
        level: 1,
        count: numberWord(p.match(/\b(one|two|three|any)\b/i)?.[1], 1),
        from: { kind: "tools" },
        grants: [{ type: "proficiency", kind: "tool", ids: ["$id"] }],
      });
    } else {
      const id = slugify(p.replace(/^(?:a|an|the)\s+/i, ""));
      if (id) ids.push(id);
    }
  }
  if (ids.length) effects.push({ type: "proficiency", kind: "tool", ids });
  return { ids, effects, choices };
}

function parseLangs(text: string, bgId: string): { effects: Effect[]; choices: Choice[] } {
  const effects: Effect[] = [];
  const choices: Choice[] = [];
  if (NOTHING.test(text)) return { effects, choices };
  const grants: Effect[] = [{ type: "proficiency", kind: "language", ids: ["$id"] }];
  if (/of your choice|choose|any\b|one other|your choice/i.test(text)) {
    const listM = text.replace(/\.$/, "").match(/\b(?:of|from)\s+([A-Z][A-Za-z' ,]*)$/);
    const named = listM ? listM[1].split(/,\s*(?:or\s+)?|\s+or\s+|\s+and\s+/).map((x) => clean(x)).filter(Boolean) : [];
    const count = numberWord(text.match(/\b(one|two|three|any)\b/i)?.[1], 1);
    choices.push({
      id: `${bgId}:languages`,
      label: "Languages",
      level: 1,
      count,
      from: { kind: "languages", ...(named.length >= 2 ? { ids: named.map(languageId) } : {}) },
      grants,
    });
    return { effects, choices };
  }
  const ids = text
    .replace(/\.$/, "")
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/)
    .map((s) => languageId(s))
    .filter(Boolean);
  if (ids.length) effects.push({ type: "proficiency", kind: "language", ids });
  return { effects, choices };
}

const stripEquip = (s: string) => clean(s.replace(/Value:\S+\s*Weight:[^\s,;)]+/gi, "").replace(/\s+,/g, ","));

export function parseBackground(
  slug: string,
  html: string,
): { background: ContentRow<BackgroundData>; features: ContentRow<FeatureData>[] } {
  const { $, content } = loadPage(html);
  const id = slug.startsWith("background:") ? slug : `background:${slug}`;
  const title = clean($("title").first().text())
    .replace(/\s+-\s+DND 5th Edition.*$/i, "")
    .replace(/^Background:\s*/i, "");

  // ---- walk the flattened page ----
  type Sec = { level: 1 | 2; heading: string; nodes: Element[] };
  const pre: Element[] = [];
  const secs: Sec[] = [];
  const flat = flatChildren($, content);
  const h3AsSection = !flat.some((e) => e.name === "h2");
  let sourceRaw: string | null = null;
  let labels: Record<string, string> = {};
  const isCharTable = (el?: Element) => {
    if (!el || el.name !== "table") return false;
    const h = tableRows($, el)[0] ?? [];
    return /^d\d+$/i.test(h[0] ?? "") && /personality|ideal|bond|flaw|trait/i.test(h[1] ?? "");
  };
  for (const [i, el] of flat.entries()) {
    if (el.name === "h1" || el.name === "h2" || (el.name === "h3" && (h3AsSection || isCharTable(flat[i + 1])))) {
      secs.push({ level: el.name === "h1" ? 1 : 2, heading: textOf($, el), nodes: [] });
      continue;
    }
    // source line / label paragraph can be anywhere; they are not part of the descriptions
    if (el.name === "p") {
      const t = textOf($, el);
      const sm = t.match(/^Sour?ce:\s*(.+)$/i);
      if (sm) {
        sourceRaw ??= sm[1];
        continue;
      }
      if (/Skill Proficiencies:/i.test(t) || (/Languages:/i.test(t) && /Equipment:/i.test(t))) {
        labels = { ...labels, ...splitLabels(t) };
        continue;
      }
    }
    if (secs.length) secs[secs.length - 1].nodes.push(el);
    else pre.push(el);
  }
  const mapped = mapSource(sourceRaw ? fixSourceName(sourceRaw) : null);
  const introEls: Element[] = pre;

  const skillsText = labels["skill proficiencies"] ?? labels["skills"] ?? "";
  const toolsText = labels["tool proficiencies"] ?? labels["tools"] ?? "";
  const langText = labels["languages"] ?? "";
  const equipText = stripEquip(labels["equipment"] ?? "");
  if (!skillsText) warn(`${id}: no skill proficiencies found`);

  const sk = parseSkills(skillsText, id);
  const tl = parseTools(toolsText, id);
  const lg = parseLangs(langText, id);

  // ---- sections ----
  const isChar = (h: string) => /suggested characteristics/i.test(h);
  const isFeatureHeading = (h: string) => /^features?$/i.test(h);
  const hasDTable = (s: Sec) =>
    s.nodes.some((el) => (el.name === "table" ? [el] : $(el).find("table").toArray()).some((t) => {
        const h = tableRows($, t)[0] ?? [];
        return /^d\d+$/i.test(h[0] ?? "") && /personality|ideal|bond|flaw|trait/i.test(h[1] ?? "");
      }));
  const charIdx = secs.findIndex((s) => isChar(s.heading));
  const isCharSec = (s: Sec, i: number) => (charIdx >= 0 && i >= charIdx) || hasDTable(s);
  const beforeChar = secs.filter((s, i) => !isCharSec(s, i));
  const afterChar = secs.filter((s, i) => isCharSec(s, i));
  const bgPrefix = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i");

  const features: ContentRow<FeatureData>[] = [];
  const extraDesc: string[] = [];
  const hasFeatureH2 = beforeChar.some((s) => s.level === 2 && /^feature:/i.test(s.heading));
  let inFeatures = false;
  let inVariants = false;
  const featSecs: Sec[] = [];
  for (const s of beforeChar) {
    if (s.level === 1) {
      inFeatures = isFeatureHeading(s.heading);
      inVariants = /variant/i.test(s.heading);
      if (!inFeatures) extraDesc.push(`### ${s.heading}\n\n${toMarkdownAll($, s.nodes)}`.trim());
      else if (s.nodes.length) {
        /* intro of the Features block is dropped */
      }
      continue;
    }
    const isFeat = hasFeatureH2 ? /^feature:/i.test(s.heading) : inFeatures || (!inVariants && !secs.some((x) => x.level === 1 && isFeatureHeading(x.heading)));
    if (isFeat) featSecs.push(s);
    else extraDesc.push(`### ${s.heading}\n\n${toMarkdownAll($, s.nodes)}`.trim());
  }
  const bgSource = { source: mapped.source, sourceKind: mapped.sourceKind } as const;
  const used = new Set<string>();
  featSecs.forEach((s, i) => {
    const name = s.heading.replace(/^feature:\s*/i, "");
    let fid = `${id}/${slugify(name)}`;
    let n = 2;
    while (used.has(fid)) fid = `${id}/${slugify(name)}-${n++}`;
    used.add(fid);
    features.push(
      row<FeatureData>({
        id: fid,
        name,
        ...bgSource,
        description: toMarkdownAll($, s.nodes),
        data: { ownerType: "background", ownerId: id, level: 1, sort: i },
      }),
    );
  });
  if (!features.length) warn(`${id}: no feature found`);

  // ---- characteristics ----
  const characteristics: Record<string, string[]> = {};
  const addTable = (key: string, table: Element) => {
    const rows = tableRows($, table);
    if (!rows.length) return;
    const body = rows.slice(1).map((r) => (r.length >= 2 ? r.slice(1).join(" ") : r[0])).filter(Boolean);
    if (!body.length) return;
    const header = rows[0];
    const k = key || (header[1] ? `${clean(header[1])}s` : "Table");
    characteristics[k] = body;
  };
  for (const s of afterChar) {
    for (const el of s.nodes) {
      const tables = el.name === "table" ? [el] : $(el).find("table").toArray();
      for (const t of tables) addTable(s.level === 2 && !isChar(s.heading) ? s.heading.replace(bgPrefix, "") : "", t as Element);
    }
  }

  const description = [toMarkdownAll($, introEls), ...extraDesc.filter((x) => x.replace(/^### .*$/m, "").trim())]
    .filter(Boolean)
    .join("\n\n");

  const effects: Effect[] = [...sk.effects, ...tl.effects, ...lg.effects];
  const choices: Choice[] = [...sk.choices, ...tl.choices, ...lg.choices];

  const background = row<BackgroundData>({
    id,
    name: title,
    ...bgSource,
    description,
    effects,
    choices,
    data: {
      skills: sk.ids,
      tools: tl.ids,
      languagesText: langText,
      equipmentText: equipText,
      ...(features[0] ? { featureName: features[0].name } : {}),
      ...(Object.keys(characteristics).length ? { characteristics } : {}),
    },
  });
  void toMarkdown;
  return { background, features };
}
