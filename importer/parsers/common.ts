import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { ContentRow } from "../../shared/types/content";
import { mapSource } from "../sources";

export type $Root = cheerio.CheerioAPI;

/** Warnings collected during parsing; printed into data/import-report.md */
export const warnings: string[] = [];
export function warn(msg: string) {
  warnings.push(msg);
}

/** Load a wiki page and return cheerio + the #page-content element */
export function loadPage(html: string): { $: $Root; content: cheerio.Cheerio<Element> } {
  const $ = cheerio.load(html);
  // remove table of contents boxes and edit buttons
  $("#page-content #toc, #page-content .floatright#toc").remove();
  return { $, content: $("#page-content") as cheerio.Cheerio<Element> };
}

/** Normalize whitespace and typographic characters */
export function clean(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, (m) => (m === "−" ? "-" : "—"))
    .replace(/\s+/g, " ")
    .trim();
}

/** Text of a node, cleaned */
export function textOf($: $Root, el: AnyNode | cheerio.Cheerio<AnyNode>): string {
  return clean($(el as any).text());
}

/** Find the "Source: ..." line in the page content */
export function findSource($: $Root, content: cheerio.Cheerio<Element>): string | null {
  let src: string | null = null;
  content.find("p").each((_, p) => {
    const t = textOf($, p);
    const m = t.match(/^Source:\s*(.+)$/i);
    if (m && !src) src = m[1];
  });
  return src;
}

export { mapSource };

/** "1st" → 1, "20th" → 20, "3rd-level" → 3; returns null when not found */
export function parseOrdinal(text: string): number | null {
  const m = text.match(/(\d+)\s*(st|nd|rd|th)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/** "1,500 gp" → 150000 (copper). Returns undefined for "—" or empty. */
export function parseCost(text: string): number | undefined {
  const m = clean(text).replace(/,/g, "").match(/([\d.]+)\s*(cp|sp|ep|gp|pp)/i);
  if (!m) return undefined;
  const factor = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 }[m[2].toLowerCase() as "cp"]!;
  return Math.round(parseFloat(m[1]) * factor);
}

/** "2 lb.", "1/2 lb.", "1 1/2 lb." → number of pounds */
export function parseWeight(text: string): number | undefined {
  const t = clean(text).replace(/,/g, "");
  const dec = t.match(/(\d*\.\d+)\s*lb/i);
  if (dec) return parseFloat(dec[1]);
  const m = t.match(/(?:(\d+)\s+)?(\d+)(?:\/(\d+))?\s*lb/i);
  if (!m) return undefined;
  const whole = m[1] ? parseInt(m[1], 10) : 0;
  const num = parseInt(m[2], 10);
  const den = m[3] ? parseInt(m[3], 10) : 1;
  return whole + num / den;
}

/** Name → slug: "Sleight of Hand" → "sleight-of-hand" */
export function slugify(name: string): string {
  return clean(name)
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Treat "—", "-", "–", "None" as empty */
export function isEmptyValue(text: string): boolean {
  return /^(—|-|–|none|n\/a)?$/i.test(clean(text));
}

const ABILITY_NAMES: Record<string, "str" | "dex" | "con" | "int" | "wis" | "cha"> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};
export function abilityFromName(name: string) {
  return ABILITY_NAMES[clean(name).toLowerCase()];
}

/** Convert an HTML element (and children) to light markdown */
export function toMarkdown($: $Root, el: AnyNode | cheerio.Cheerio<AnyNode>): string {
  const out: string[] = [];
  const render = (node: AnyNode): string => {
    if (node.type === "text") return (node as any).data as string;
    if (node.type !== "tag") return "";
    const e = node as Element;
    const inner = () => e.children.map(render).join("");
    switch (e.name) {
      case "strong":
      case "b": {
        const t = inner().trim();
        return t ? `**${t}** ` : "";
      }
      case "em":
      case "i": {
        const t = inner().trim();
        return t ? `*${t}* ` : "";
      }
      case "br":
        return "\n";
      case "p":
        return `\n\n${inner().trim()}\n\n`;
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return `\n\n### ${clean(inner())}\n\n`;
      case "li":
        return `\n- ${inner().trim()}`;
      case "ul":
      case "ol":
        return `\n${inner()}\n\n`;
      case "table": {
        const rows: string[][] = [];
        $(e)
          .find("tr")
          .each((_, tr) => {
            rows.push(
              $(tr)
                .find("th,td")
                .map((__, c) => clean($(c).text()).replace(/\|/g, "/"))
                .get(),
            );
          });
        if (!rows.length) return "";
        const width = Math.max(...rows.map((r) => r.length));
        // single-cell title rows become captions
        const lines: string[] = [];
        let headerDone = false;
        for (const r of rows) {
          if (r.length === 1 && width > 1) {
            lines.push(`\n**${r[0]}**\n`);
            continue;
          }
          while (r.length < width) r.push("");
          lines.push(`| ${r.join(" | ")} |`);
          if (!headerDone) {
            lines.push(`|${r.map(() => "---").join("|")}|`);
            headerDone = true;
          }
        }
        return `\n\n${lines.join("\n")}\n\n`;
      }
      case "script":
      case "style":
        return "";
      default:
        return inner();
    }
  };
  const nodes = (($ as any)(el) as cheerio.Cheerio<AnyNode>).toArray();
  for (const n of nodes) out.push(render(n));
  return out
    .join("")
    .replace(/ /g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Markdown of a list of sibling elements */
export function toMarkdownAll($: $Root, els: AnyNode[]): string {
  return els
    .map((e) => toMarkdown($, e))
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split the children of a container into sections at headings of the given tags.
 * Returns [{heading, level, nodes}] where nodes are the elements until the next heading of the same or higher rank.
 */
export function sections(
  $: $Root,
  container: cheerio.Cheerio<Element>,
  headingTags: string[],
): { heading: string; tag: string; nodes: Element[] }[] {
  const result: { heading: string; tag: string; nodes: Element[] }[] = [];
  let current: { heading: string; tag: string; nodes: Element[] } | null = null;
  // flatten bootstrap wrappers (div.feature > div.row > div.col-*)
  const flat: Element[] = [];
  const walk = (el: Element) => {
    if (el.name === "div" && /\b(feature|row|col-[a-z]+-\d+)\b/.test($(el).attr("class") ?? "")) {
      $(el)
        .children()
        .each((_, c) => walk(c as Element));
    } else flat.push(el);
  };
  container.children().each((_, c) => walk(c as Element));
  for (const el of flat) {
    if (headingTags.includes(el.name)) {
      current = { heading: textOf($, el), tag: el.name, nodes: [] };
      result.push(current);
    } else if (current) current.nodes.push(el);
  }
  return result;
}

/** All direct-ish content elements (flattening bootstrap wrappers) */
export function flatChildren($: $Root, container: cheerio.Cheerio<Element>): Element[] {
  const flat: Element[] = [];
  const walk = (el: Element) => {
    if (el.name === "div" && /\b(feature|row|col-[a-z]+-\d+)\b/.test($(el).attr("class") ?? "")) {
      $(el)
        .children()
        .each((_, c) => walk(c as Element));
    } else flat.push(el);
  };
  container.children().each((_, c) => walk(c as Element));
  return flat;
}

/** Parse a wiki table into rows of cell texts (all rows, including header rows) */
export function tableRows($: $Root, table: AnyNode): string[][] {
  const rows: string[][] = [];
  $(table)
    .find("tr")
    .each((_, tr) => {
      rows.push(
        $(tr)
          .find("th,td")
          .map((__, c) => clean($(c).text()))
          .get(),
      );
    });
  return rows;
}

/** Build a content row with defaults */
export function row<T>(partial: Partial<ContentRow<T>> & { id: string; name: string; data: T }): ContentRow<T> {
  return {
    source: "",
    sourceKind: "official",
    origin: "wiki",
    description: "",
    effects: [],
    choices: [],
    ...partial,
  };
}

/** Parse "*Label.* value *Label2:* value2" style label/value pairs from a paragraph */
export function labelValues($: $Root, el: AnyNode): Record<string, string> {
  const out: Record<string, string> = {};
  const html = $(el).html() ?? "";
  // split at <em> or <strong> labels
  const parts = html.split(/<(?:em|strong)>/i);
  for (const part of parts.slice(1)) {
    const [labelHtml, ...rest] = part.split(/<\/(?:em|strong)>/i);
    const label = clean(cheerio.load(`<x>${labelHtml}</x>`)("x").text()).replace(/[:.]\s*$/, "");
    const value = clean(cheerio.load(`<x>${rest.join("")}</x>`)("x").text()).replace(/^[:.]\s*/, "");
    if (label) out[label] = value;
  }
  return out;
}
