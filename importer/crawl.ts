import * as cheerio from "cheerio";
import { getPage } from "./fetch";

export const CLASS_SLUGS = [
  "artificer",
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
];

export const STATIC_PAGES = ["weapons", "armor", "adventuring-gear", "tools", "spells", "lineage", "wondrous-items"];

export interface CrawlResult {
  classes: string[];
  /** class slug -> list of "<class>:<x>" slugs linked from the class page (subclasses and option pages) */
  classLinks: Record<string, string[]>;
  lineages: string[];
  backgrounds: string[];
  feats: string[];
  spells: string[];
  magicItems: string[];
}

/** Extract internal page slugs from links inside #page-content (or the whole page) */
export function linksOf(html: string, opts: { selector?: string; prefix?: string; whole?: boolean } = {}): string[] {
  const $ = cheerio.load(html);
  const scope = opts.whole ? $("body") : $("#page-content");
  const found = new Set<string>();
  scope.find(opts.selector ?? "a").each((_, a) => {
    let href = $(a).attr("href") ?? "";
    href = href.replace(/^https?:\/\/dnd5e\.wikidot\.com/, "");
    if (!href.startsWith("/")) return;
    const slug = href.slice(1).split("#")[0].split("?")[0];
    if (!slug || slug.includes("/")) return;
    if (opts.prefix && !slug.startsWith(opts.prefix)) return;
    found.add(slug);
  });
  return [...found];
}

export async function crawl(log: (msg: string) => void = console.log): Promise<CrawlResult> {
  const home = (await getPage("")) ?? "";
  const backgrounds = linksOf(home, { prefix: "background:", whole: true });
  const feats = linksOf(home, { prefix: "feat:", whole: true });
  log(`home: ${backgrounds.length} backgrounds, ${feats.length} feats`);

  const classLinks: Record<string, string[]> = {};
  for (const c of CLASS_SLUGS) {
    const html = (await getPage(c)) ?? "";
    classLinks[c] = linksOf(html, { prefix: `${c}:` });
  }
  log(`classes: ${Object.values(classLinks).flat().length} class sub-pages`);

  for (const p of STATIC_PAGES) await getPage(p);

  const lineages = linksOf((await getPage("lineage")) ?? "", { prefix: "lineage:" });
  const spells = linksOf((await getPage("spells")) ?? "", { prefix: "spell:" });
  const magicItems = linksOf((await getPage("wondrous-items")) ?? "", {
    prefix: "wondrous-items:",
    selector: "table a",
  });
  log(`lineages ${lineages.length}, spells ${spells.length}, magic items ${magicItems.length}`);

  return { classes: CLASS_SLUGS, classLinks, lineages, backgrounds, feats, spells, magicItems };
}

/** Download every page referenced by the crawl result (uses the cache) */
export async function downloadAll(result: CrawlResult, opts: { refresh?: boolean } = {}, log = console.log) {
  const all = [
    ...Object.values(result.classLinks).flat(),
    ...result.lineages,
    ...result.backgrounds,
    ...result.feats,
    ...result.spells,
    ...result.magicItems,
  ];
  let i = 0;
  for (const slug of all) {
    await getPage(slug, opts);
    if (++i % 100 === 0) log(`  ${i}/${all.length} pages`);
  }
  return all.length;
}
