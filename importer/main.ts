/**
 * Importer: dnd5e.wikidot.com → SQLite.
 *   npx tsx importer/main.ts [--refresh] [--only=classes,spells,...] [--offline]
 * --refresh  re-download pages instead of using importer/cache
 * --only     limit to categories: classes, species, backgrounds, feats, spells, items
 * --offline  never download, only use cached pages
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openDb, ROOT, now } from "../server/db/client";
import type { ContentRow, ImportBundle } from "../shared/types/content";
import { emptyBundle } from "../shared/types/content";
import { applyEffects } from "./applyEffects";
import { CLASS_SLUGS } from "./crawl";
import { getPage, readCached, stats } from "./fetch";
import { parseBackground, parseBackgroundIndex } from "./parsers/background";
import { mergeClassOptions, parseClass } from "./parsers/class";
import { OPTION_PAGES, parseOptionPage } from "./parsers/classOptions";
import { slugify, warnings } from "./parsers/common";
import { parseArmor, parseGear, parseTools, parseWeapons } from "./parsers/equipment";
import { parseFeat, parseFeatIndex } from "./parsers/feat";
import { parseLineage, parseLineageIndex } from "./parsers/lineage";
import { parseMagicItem, parseMagicItemIndex } from "./parsers/magicItem";
import { parseSpell, parseSpellIndex } from "./parsers/spell";
import { parseSubclass } from "./parsers/subclass";
import { unknownSources } from "./sources";
import { type ImportStatus, writeStatus } from "./status";
import { writeBundle } from "./writeDb";

const args = process.argv.slice(2);
const refresh = args.includes("--refresh");
const offline = args.includes("--offline");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;
const want = (c: string) => !only || only.has(c);

async function page(slug: string): Promise<string | null> {
  if (offline) return readCached(slug);
  return getPage(slug, { refresh });
}

function safe<T>(label: string, fn: () => T): T | null {
  try {
    return fn();
  } catch (e) {
    warnings.push(`${label}: parser error: ${(e as Error).message}`);
    return null;
  }
}

const status: ImportStatus = {
  state: "running",
  phase: "Starting",
  phaseDone: 0,
  phaseTotal: 0,
  pagesFetched: 0,
  pagesFromCache: 0,
  startedAt: new Date().toISOString(),
  pid: process.pid,
};

function progress(label: string, i: number, n: number) {
  if (i % 50 === 0 || i === n) process.stdout.write(`\r  ${label}: ${i}/${n}   `);
  if (i === n) process.stdout.write("\n");
  Object.assign(status, { phase: label, phaseDone: i, phaseTotal: n, pagesFetched: stats.fetched, pagesFromCache: stats.cached });
  writeStatus(status);
}

function phase(label: string) {
  console.log(label);
  Object.assign(status, { phase: label, phaseDone: 0, phaseTotal: 0, pagesFetched: stats.fetched, pagesFromCache: stats.cached });
  writeStatus(status, true);
}

async function main() {
  const started = now();
  const t0 = Date.now();
  const bundle: ImportBundle = emptyBundle();
  console.log(`Importing from dnd5e.wikidot.com${refresh ? " (refresh)" : ""}${offline ? " (offline)" : ""}`);

  if (want("classes")) {
    phase("Classes & subclasses");
    const options: ContentRow<any>[] = [];
    let i = 0;
    for (const slug of CLASS_SLUGS) {
      const html = await page(slug);
      if (!html) continue;
      const parsed = safe(slug, () => parseClass(slug, html));
      if (!parsed) continue;
      bundle.classes.push(parsed.cls);
      bundle.features.push(...parsed.features);
      options.push(...parsed.classOptions);
      for (const ref of parsed.subclassRefs) {
        const shtml = await page(ref.slug);
        if (!shtml) continue;
        const sub = safe(ref.slug, () => parseSubclass(ref.slug, shtml, parsed.cls, ref));
        if (sub) {
          bundle.subclasses.push(sub.subclass);
          bundle.features.push(...sub.features);
        }
      }
      progress("classes", ++i, CLASS_SLUGS.length);
    }
    for (const op of OPTION_PAGES) {
      const html = await page(op.slug);
      if (html) options.push(...(safe(op.slug, () => parseOptionPage(op.slug, html, op.group, op.classIds)) ?? []));
    }
    bundle.classOptions = mergeClassOptions(options);
  }

  if (want("species")) {
    phase("Species");
    const index = parseLineageIndex((await page("lineage")) ?? "");
    let i = 0;
    for (const { slug, category } of index) {
      const html = await page(slug);
      progress("species", ++i, index.length);
      if (!html) continue;
      const r = safe(slug, () => parseLineage(slug, html, category));
      if (!r) continue;
      bundle.species.push(...r.species);
      bundle.subspecies.push(...r.subspecies);
      bundle.features.push(...r.features);
    }
  }

  const home = want("backgrounds") || want("feats") ? ((await page("")) ?? "") : "";
  if (want("backgrounds")) {
    phase("Backgrounds");
    // skip pages that are not real backgrounds
    const slugs = parseBackgroundIndex(home).filter((s) => !/heroic-chronicle|optional-features/.test(s));
    let i = 0;
    for (const slug of slugs) {
      const html = await page(slug);
      progress("backgrounds", ++i, slugs.length);
      if (!html) continue;
      const r = safe(slug, () => parseBackground(slug, html));
      if (!r) continue;
      bundle.backgrounds.push(r.background);
      bundle.features.push(...r.features);
    }
  }

  if (want("feats")) {
    phase("Feats");
    const slugs = parseFeatIndex(home);
    let i = 0;
    for (const slug of slugs) {
      const html = await page(slug);
      progress("feats", ++i, slugs.length);
      if (!html) continue;
      const r = safe(slug, () => parseFeat(slug, html));
      if (r) bundle.feats.push(r);
    }
  }

  if (want("spells")) {
    phase("Spells");
    const slugs = parseSpellIndex((await page("spells")) ?? "");
    let i = 0;
    for (const slug of slugs) {
      const html = await page(slug);
      progress("spells", ++i, slugs.length);
      if (!html) continue;
      const r = safe(slug, () => parseSpell(slug, html));
      if (r) bundle.spells.push(r);
    }
  }

  if (want("items")) {
    phase("Items");
    const seen = new Set<string>();
    const addItems = (rows: ContentRow<any>[] | null) => {
      for (const r of rows ?? []) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        bundle.items.push(r);
      }
    };
    const w = await page("weapons");
    if (w) addItems(safe("weapons", () => parseWeapons(w)));
    const a = await page("armor");
    if (a) addItems(safe("armor", () => parseArmor(a)));
    const g = await page("adventuring-gear");
    if (g) addItems(safe("adventuring-gear", () => parseGear(g)));
    const t = await page("tools");
    if (t) addItems(safe("tools", () => parseTools(t)));
    const index = parseMagicItemIndex((await page("wondrous-items")) ?? "");
    let i = 0;
    for (const entry of index) {
      const html = await page(entry.slug);
      progress("magic items", ++i, index.length);
      if (!html) continue;
      const r = safe(entry.slug, () => parseMagicItem(entry.slug, html, entry));
      if (r) addItems([r]);
    }
  }

  phase("Saving");
  const applied = applyEffects(bundle);

  const db = openDb();
  const written = writeBundle(db, bundle, only ? [...only] : null);
  // parser warnings that were fixed by a hand-made override are not reported
  const fixed = (w: string) => {
    const m = w.match(/^(\S+): no level for feature "(.+)", using/);
    return !!m && applied.overridden.has(`${m[1]}/${slugify(m[2])}`);
  };
  const allWarnings = [...warnings.filter((w) => !fixed(w)), ...applied.warnings, ...[...unknownSources].map((s) => `Unknown source: ${s}`), ...stats.failed.map((f) => `Fetch failed: ${f}`)];
  db.prepare("INSERT INTO import_runs (started_at, finished_at, pages_fetched, entries_written, warnings) VALUES (?,?,?,?,?)").run(
    started,
    now(),
    stats.fetched,
    written,
    JSON.stringify(allWarnings),
  );
  db.close();

  // report
  const counts = Object.entries(bundle).map(([k, v]) => `| ${k} | ${(v as unknown[]).length} |`);
  const report = [
    "# Import report",
    "",
    `Date: ${new Date().toLocaleString()}  `,
    `Duration: ${Math.round((Date.now() - t0) / 1000)} s · pages downloaded: ${stats.fetched} · from cache: ${stats.cached}  `,
    `Effects layer: ${applied.applied} entries enriched`,
    "",
    "| Table | Rows |",
    "|---|---|",
    ...counts,
    "",
    `## Warnings (${allWarnings.length})`,
    "",
    ...allWarnings.map((w) => `- ${w}`),
  ].join("\n");
  writeFileSync(resolve(ROOT, "data/import-report.md"), report, "utf8");
  console.log(`\nDone in ${Math.round((Date.now() - t0) / 1000)} s. ${written} rows written, ${allWarnings.length} warnings (see data/import-report.md).`);
}

main()
  .then(() =>
    writeStatus({ ...status, state: "done", phase: "Done", finishedAt: new Date().toISOString(), pagesFetched: stats.fetched, pagesFromCache: stats.cached }, true),
  )
  .catch((e) => {
    console.error(e);
    writeStatus({ ...status, state: "error", error: (e as Error).message, finishedAt: new Date().toISOString() }, true);
    process.exit(1);
  });
