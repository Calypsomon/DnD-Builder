import type { ContentRow, SpellData } from "../../shared/types/content";
import { clean, findSource, flatChildren, labelValues, loadPage, mapSource, parseOrdinal, row, slugify, textOf, toMarkdownAll, warn } from "./common";

/** Index page `spells`: slugs (`spell:<x>`) from all level tabs. */
export function parseSpellIndex(html: string): string[] {
  const { $ } = loadPage(html);
  const slugs: string[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, a) => {
    const m = ($(a).attr("href") ?? "").match(/\/(spell:[^/?#]+)$/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      slugs.push(m[1]);
    }
  });
  if (!slugs.length) warn("spells index: no spells found");
  return slugs;
}

/** "(material text with (nested) parens)" after the M component → inner text */
function materialOf(components: string): string | undefined {
  const start = components.indexOf("(");
  if (start < 0) return undefined;
  let depth = 0;
  for (let i = start; i < components.length; i++) {
    if (components[i] === "(") depth++;
    else if (components[i] === ")" && --depth === 0) return clean(components.slice(start + 1, i));
  }
  return clean(components.slice(start + 1)); // unbalanced: take the rest
}

/** Page `/spell:<x>` → one spell row. */
export function parseSpell(slug: string, html: string): ContentRow<SpellData> {
  const { $, content } = loadPage(html);
  const bare = slug.replace(/^spell:/, "");
  const name = clean($(".page-title").first().text()) || clean($("title").text()).replace(/\s+-\s+DND 5th Edition.*$/i, "") || bare;
  const { source, sourceKind } = mapSource(findSource($, content));

  const els = flatChildren($, content);
  const paras = els.filter((e) => e.name === "p");

  // "3rd-level evocation (ritual)" / "Evocation cantrip" (optionally "(dunamancy)" etc.)
  let level = -1;
  let school = "";
  let ritual = false;
  let levelEl: (typeof els)[number] | undefined;
  for (const p of paras) {
    const t = textOf($, p);
    const lm = t.match(/^(\d+(?:st|nd|rd|th))-level\s+([A-Za-z]+)/i);
    const cm = t.match(/^([A-Za-z]+)\s+cantrip/i);
    if (lm || cm) {
      levelEl = p;
      level = lm ? (parseOrdinal(lm[1]) ?? -1) : 0;
      school = (lm ? lm[2] : cm![1]).toLowerCase();
      ritual = /\(\s*ritual/i.test(t) || /ritual/i.test(t.replace(/^[^()]*/, ""));
      break;
    }
  }
  if (level < 0 || !school) warn(`spell ${slug}: level/school line not found`);

  // Casting Time / Range / Components / Duration paragraph
  // (usually one paragraph with <br>s, but some pages use one paragraph per label)
  const labelEls = paras.filter((p) => /^(Casting Time|Range|Components|Duration)/i.test(textOf($, p)));
  const labelEl = labelEls[labelEls.length - 1];
  const lv: Record<string, string> = {};
  for (const p of labelEls) Object.assign(lv, labelValues($, p));
  const castingTime = lv["Casting Time"] ?? "";
  const range = lv["Range"] ?? "";
  const componentsText = lv["Components"] ?? "";
  const duration = lv["Duration"] ?? "";
  if (!castingTime || !duration) warn(`spell ${slug}: casting time / duration missing`);
  const head = componentsText.replace(/\(.*$/, "");
  const components: SpellData["components"] = { v: /\bV\b/.test(head), s: /\bS\b/.test(head), m: /\bM\b/.test(head) };
  if (components.m) {
    const material = materialOf(componentsText);
    if (material) components.material = material;
  }
  if (/ritual/i.test(castingTime)) ritual = true;

  // description / higher levels / spell lists
  let higherLevels: string | undefined;
  let lists: string[] = [];
  const descEls: typeof els = [];
  const labelIdx = labelEl ? els.indexOf(labelEl) : levelEl ? els.indexOf(levelEl) : -1;
  els.forEach((el, i) => {
    if (i <= labelIdx) return;
    if ($(el).hasClass("content-separator")) return;
    const t = textOf($, el);
    if (el.name === "p" && /^Source:/i.test(t)) return;
    if (el.name === "p" && /^Spell Lists?\b/i.test(t)) {
      const classes = t.replace(/^Spell Lists?\.?\s*/i, "").split(",");
      lists = [...new Set(classes.map((c) => slugify(c.replace(/\(.*?\)/g, ""))).filter((c) => c && c !== "none").map((c) => `class:${c}`))];
      return;
    }
    if (el.name === "p" && /^At Higher Levels?\b/i.test(t)) {
      higherLevels = t.replace(/^At Higher Levels?\.?\s*/i, "");
      return;
    }
    descEls.push(el);
  });
  const description = toMarkdownAll($, descEls);
  if (!description) warn(`spell ${slug}: empty description`);

  return row<SpellData>({
    id: `spell:${bare}`,
    name,
    source,
    sourceKind,
    description,
    data: {
      level,
      school,
      castingTime,
      range,
      components,
      duration,
      concentration: /^concentration/i.test(duration),
      ritual,
      ...(higherLevels ? { higherLevels } : {}),
      lists,
    },
  });
}
