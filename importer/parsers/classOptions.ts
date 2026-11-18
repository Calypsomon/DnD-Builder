import type { ClassOptionData, ContentRow, SourceKind } from "../../shared/types/content";
import { flatChildren, loadPage, mapSource, parseOrdinal, row, slugify, textOf, toMarkdownAll, warn } from "./common";
import type { Element } from "domhandler";

/** Verified standalone option pages (all other options are inline on class pages: fighting styles, metamagic, pact boons). */
export const OPTION_PAGES: { slug: string; group: string; classIds: string[] }[] = [
  { slug: "fighter:battle-master:maneuvers", group: "maneuver", classIds: ["class:fighter"] },
  { slug: "warlock:eldritch-invocations", group: "invocation", classIds: ["class:warlock"] },
  { slug: "artificer:infusions", group: "infusion", classIds: ["class:artificer"] },
];

const DEFAULT_SOURCE: Record<string, string> = { infusion: "TCE" };

export function parseOptionPage(
  slug: string,
  html: string,
  group: string,
  classIds: string[],
): ContentRow<ClassOptionData>[] {
  const { $, content } = loadPage(html);
  const nodes = flatChildren($, content);
  const counts = ["h2", "h3", "h4"].map((t) => [t, nodes.filter((n) => n.name === t).length] as const);
  const tag = counts.sort((a, b) => b[1] - a[1])[0];
  if (!tag || !tag[1]) {
    warn(`${slug}: no option headings found`);
    return [];
  }
  const out: ContentRow<ClassOptionData>[] = [];
  const used = new Set<string>();
  let cur: { heading: string; nodes: Element[] } | null = null;
  const secs: { heading: string; nodes: Element[] }[] = [];
  for (const n of nodes) {
    if (n.name === tag[0]) {
      cur = { heading: textOf($, n), nodes: [] };
      secs.push(cur);
    } else if (cur) cur.nodes.push(n);
  }
  for (const s of secs) {
    let name = s.heading;
    let source = DEFAULT_SOURCE[group] ?? "PHB";
    let kind: SourceKind = "official";
    const tagM = name.match(/^(.*?)\s*\(([A-Za-z]{2,6})\)$/);
    let tagged = false;
    if (tagM) {
      name = tagM[1];
      source = tagM[2];
      kind = source === "UA" ? "ua" : source === "HB" ? "homebrew" : "official";
      tagged = true;
    }
    // Source / Prerequisite line(s)
    let prerequisite: string | undefined;
    const body: Element[] = [];
    let extra = "";
    for (const n of s.nodes) {
      const t = n.name === "p" ? textOf($, n) : "";
      if (n.name === "p" && /^(Source:|Prerequisite:)/i.test(t) && prerequisite === undefined && !body.length) {
        const sm = t.match(/Source:\s*(.+?)(?=\s*Prerequisite:|\s*Item:|$)/i);
        if (sm && !tagged) {
          const m = mapSource(sm[1]);
          source = m.source;
          kind = m.sourceKind;
        }
        const pm = t.match(/Prerequisite:\s*(.+?)(?=\s*Item:|$)/i);
        if (pm) prerequisite = pm[1].trim();
        const im = t.match(/(Item:.*)$/i);
        if (im) extra = im[1];
        continue;
      }
      body.push(n);
    }
    const levelReq = prerequisite ? (parseOrdinal(prerequisite) ?? undefined) : undefined;
    const suffix = kind === "official" ? "" : kind === "ua" ? "-ua" : "-hb";
    let id = `option:${group}:${slugify(name)}${suffix}`;
    if (used.has(id)) {
      let k = 2;
      while (used.has(`${id}-${k}`)) k++;
      id = `${id}-${k}`;
    }
    used.add(id);
    const desc = [extra, toMarkdownAll($, body)].filter(Boolean).join("\n\n");
    out.push(
      row<ClassOptionData>({
        id,
        name,
        source,
        sourceKind: kind,
        description: desc,
        data: {
          group,
          classIds: [...classIds],
          ...(levelReq ? { levelReq } : {}),
          ...(prerequisite ? { prerequisite } : {}),
        },
      }),
    );
  }
  return out;
}
