import type { AnyNode, Element } from "domhandler";
import type { ArmorStats, ContentRow, ItemData, SourceKind, WeaponStats } from "../../shared/types/content";
import {
  type $Root,
  clean,
  isEmptyValue,
  loadPage,
  mapSource,
  parseCost,
  parseWeight,
  row,
  slugify,
  tableRows,
  textOf,
  toMarkdownAll,
  warn,
} from "./common";

/* ------------------------------------------------------------------ */
/* shared helpers                                                       */
/* ------------------------------------------------------------------ */

/** A block in document order: heading, "Source:" line or table. */
type Block =
  | { kind: "heading"; tag: string; text: string }
  | { kind: "source"; text: string }
  | { kind: "table"; el: Element };

/**
 * Walk the page content in document order and emit headings, source lines and tables.
 * Descends into wrappers (tab views, bootstrap divs) but not into tables.
 * "Source: ..." may be a <p> or a bare text node followed by <br>.
 */
function blocks($: $Root, root: AnyNode): Block[] {
  const out: Block[] = [];
  const walk = (node: AnyNode) => {
    if (node.type === "text") {
      const m = clean((node as any).data as string).match(/^Source:\s*(.+)$/i);
      if (m) out.push({ kind: "source", text: m[1] });
      return;
    }
    if (node.type !== "tag") return;
    const e = node as Element;
    if (e.name === "table") {
      out.push({ kind: "table", el: e });
    } else if (/^h[1-6]$/.test(e.name)) {
      out.push({ kind: "heading", tag: e.name, text: textOf($, e) });
    } else if (e.name === "p") {
      const m = textOf($, e).match(/^Source:\s*(.+)$/i);
      if (m) out.push({ kind: "source", text: m[1] });
    } else if (e.name !== "script" && e.name !== "style") {
      e.children.forEach(walk);
    }
  };
  (root as Element).children.forEach(walk);
  return out;
}

/** Weight in pounds; handles "0.25 lb.", "1½ lb.", "1/4 lb", "5 lb.(full)" (common.parseWeight mishandles decimals). */
function weightOf(text: string): number | undefined {
  const t = clean(text).replace(/½/g, " 1/2").replace(/¼/g, " 1/4");
  const dec = t.match(/(\d+\.\d+)\s*lb/i);
  if (dec) return parseFloat(dec[1]);
  return parseWeight(t);
}

/** Wiki name cell "Hoopak * A hoopak is ..." → name + description (bullets separated by " * "). */
function splitNameCell(text: string): { name: string; description: string } {
  const idx = text.indexOf("*");
  if (idx < 0) return { name: text.trim(), description: "" };
  const name = text.slice(0, idx).trim();
  const description = text
    .slice(idx + 1)
    .split(/\s\*\s+/)
    .map((s) => s.replace(/^\*\s*/, "").trim())
    .filter(Boolean)
    .join("\n\n");
  return { name, description };
}

/** Index of the first header cell matching the regex (or -1) */
function col(header: string[], re: RegExp): number {
  return header.findIndex((h) => re.test(h));
}

function cell(r: string[], i: number): string {
  return i >= 0 && i < r.length ? r[i] : "";
}

/* ------------------------------------------------------------------ */
/* weapons                                                              */
/* ------------------------------------------------------------------ */

/** Split "Light, thrown (20/60), versatile (1d8)" at top-level commas */
function splitProps(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => clean(p)).filter((p) => p && !isEmptyValue(p));
}

function parseWeaponProps(text: string, w: WeaponStats) {
  for (const p of splitProps(text)) {
    const lower = p.toLowerCase();
    const name = lower.replace(/\(.*$/, "").trim();
    const paren = lower.match(/\(([^)]*)\)/)?.[1] ?? "";
    const rng = paren.match(/(\d+)\s*\/\s*(\d+)/);
    if (name === "range") {
      // "ammunition, range (80/320)": the range belongs to the preceding ammunition property
      if (rng) {
        w.rangeNormal = +rng[1];
        w.rangeLong = +rng[2];
      }
      continue;
    }
    if (!w.properties.includes(name)) w.properties.push(name);
    if (rng && (name === "thrown" || name === "ammunition")) {
      w.rangeNormal = +rng[1];
      w.rangeLong = +rng[2];
    }
    if (name === "versatile") {
      const v = paren.match(/\d+d\d+|\d+/);
      if (v) w.versatile = v[0];
    }
  }
}

/** Parse the weapons page (PHB tables, ammunition and setting specific weapons). */
export function parseWeapons(html: string): ContentRow<ItemData>[] {
  const { $, content } = loadPage(html);
  const rows: ContentRow<ItemData>[] = [];
  const seen = new Set<string>();
  let source = "PHB";
  let sourceKind: SourceKind = "official";

  for (const b of blocks($, content.get(0)!)) {
    if (b.kind === "heading") {
      // a new top-level section resets the source back to PHB
      if (b.tag === "h1") {
        source = "PHB";
        sourceKind = "official";
      }
      continue;
    }
    if (b.kind === "source") {
      ({ source, sourceKind } = mapSource(b.text));
      continue;
    }
    // A table can hold several sections: a single-cell title row ("Simple Ranged Weapons"),
    // a header row (Name | Cost | ...), then data rows. The ammunition table has only a header row.
    let category: "simple" | "martial" | null = null;
    let range: "melee" | "ranged" = "melee";
    let header: string[] | null = null;
    let active = false;
    for (const r of tableRows($, b.el)) {
      if (r.length === 1) {
        const tm = r[0].match(/(simple|martial)\s+(melee|ranged)/i);
        active = !!tm;
        header = null;
        if (tm) {
          category = tm[1].toLowerCase() as "simple" | "martial";
          range = tm[2].toLowerCase() as "melee" | "ranged";
        }
        continue;
      }
      if (/^(name|ammunition)$/i.test(r[0]) && col(r, /cost/i) >= 0) {
        header = r;
        if (/^ammunition$/i.test(r[0])) {
          category = null;
          active = true;
        }
        continue;
      }
      if (!active || !header) continue;
      const iCost = col(header, /cost/i);
      const iDmg = col(header, /damage/i);
      const iWeight = col(header, /weight/i);
      const iProps = col(header, /properties/i);
      const { name, description } = splitNameCell(r[0]);
      if (!name) continue;
      const id = `item:${slugify(name)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const data: ItemData = { category: "ammunition", costCp: parseCost(cell(r, iCost)), weightLb: weightOf(cell(r, iWeight)) };
      let desc = description;
      if (category) {
        // "1d6 piercing (melee) or 1d4 bludgeoning (ranged)" -> first damage only
        const dm = cell(r, iDmg).match(/(\d+d\d+|\d+)\s+([A-Za-z]+)/);
        const weapon: WeaponStats = {
          category,
          range,
          damage: dm ? dm[1] : "",
          damageType: dm ? dm[2].toLowerCase() : "",
          properties: [],
        };
        parseWeaponProps(cell(r, iProps), weapon);
        data.category = "weapon";
        data.subtype = `${category}-${range}`;
        data.weapon = weapon;
        desc ||= `${category[0].toUpperCase()}${category.slice(1)} ${range} weapon.`;
      } else desc ||= "Ammunition.";
      rows.push(row({ id, name, source, sourceKind, description: desc, data }));
    }
  }
  if (!rows.length) warn("weapons: no weapon rows found");
  return rows;
}

/* ------------------------------------------------------------------ */
/* armor                                                                */
/* ------------------------------------------------------------------ */

/** Parse the armor page (light, medium, heavy, shield tables). */
export function parseArmor(html: string): ContentRow<ItemData>[] {
  const { $, content } = loadPage(html);
  const rows: ContentRow<ItemData>[] = [];
  const seen = new Set<string>();
  let current: ArmorStats["type"] | null = null;

  for (const b of blocks($, content.get(0)!)) {
    if (b.kind === "heading") {
      const t = b.text.toLowerCase();
      current = /light armor/.test(t) ? "light" : /medium armor/.test(t) ? "medium" : /heavy armor/.test(t) ? "heavy" : /^shield/.test(t) ? "shield" : null;
      continue;
    }
    if (b.kind !== "table" || !current) continue;
    const trs = tableRows($, b.el);
    const header = trs[0] ?? [];
    const iAc = col(header, /armor class|^ac/i);
    if (iAc < 0) continue; // e.g. the don/doff table
    const iStr = col(header, /strength/i);
    const iStealth = col(header, /stealth/i);
    const iWeight = col(header, /weight/i);
    const iCost = col(header, /cost/i);
    for (const r of trs.slice(1)) {
      const { name, description } = splitNameCell(r[0] ?? "");
      if (!name) continue;
      const id = `item:${slugify(name)}`;
      if (seen.has(id)) continue;
      const ac = cell(r, iAc);
      let baseAc: number;
      let dexCap: number | null;
      let type: ArmorStats["type"] = current;
      const plus = ac.match(/^\+\s*(\d+)/);
      const withDex = ac.match(/^(\d+)\s*\+\s*dex/i);
      if (plus) {
        baseAc = +plus[1];
        dexCap = 0;
        type = "shield";
      } else if (withDex) {
        baseAc = +withDex[1];
        const cap = ac.match(/max\s*(\d+)/i);
        dexCap = cap ? +cap[1] : null;
      } else if (/^\d+$/.test(ac)) {
        baseAc = +ac;
        dexCap = 0;
      } else {
        warn(`armor: cannot parse AC "${ac}" for ${name}`);
        continue;
      }
      const stats: ArmorStats = { type, baseAc, dexCap, stealthDisadvantage: /disadvantage/i.test(cell(r, iStealth)) };
      const str = cell(r, iStr).match(/(\d+)/);
      if (str) stats.strReq = +str[1];
      seen.add(id);
      rows.push(
        row({
          id,
          name,
          source: "PHB",
          description: description || (type === "shield" ? "Shield." : `${type[0].toUpperCase()}${type.slice(1)} armor.`),
          data: {
            category: type === "shield" ? "shield" : "armor",
            subtype: type,
            costCp: parseCost(cell(r, iCost)),
            weightLb: weightOf(cell(r, iWeight)),
            armor: stats,
          },
        }),
      );
    }
  }
  if (!rows.length) warn("armor: no armor rows found");
  return rows;
}

/* ------------------------------------------------------------------ */
/* adventuring gear                                                     */
/* ------------------------------------------------------------------ */

const AMMO_RE = /^(arrows|crossbow bolts|sling bullets|blowgun needles|bolts)\b/i;

/** Split a pack's contents text into single entries ("1,000 ball bearings" keeps its comma). */
function splitContents(text: string): string[] {
  const t = text.replace(/\.\s*The pack also has (.+?) strapped to the side of it\.?/i, ", $1").replace(/\.$/, "");
  return t
    .split(/,(?!\d{3})/)
    .map((s) => s.replace(/^\s*and\s+/i, "").trim())
    .filter(Boolean);
}

/** Parse the adventuring gear page: equipment packs, common/usable items, clothes, foci, containers. */
export function parseGear(html: string): ContentRow<ItemData>[] {
  const { $, content } = loadPage(html);
  const rows: ContentRow<ItemData>[] = [];
  const seen = new Set<string>();
  let source = "PHB";
  let sourceKind: SourceKind = "official";
  let group = "";

  for (const b of blocks($, content.get(0)!)) {
    if (b.kind === "heading") {
      group = b.text;
      continue;
    }
    if (b.kind === "source") {
      ({ source, sourceKind } = mapSource(b.text));
      continue;
    }
    const trs = tableRows($, b.el);
    const header = trs[0] ?? [];
    const iCost = col(header, /^cost/i);
    if (iCost < 0 || header.length < 2) continue;
    const iWeight = col(header, /weight/i);
    const iContents = col(header, /contents/i);
    const isPack = iContents >= 0;
    for (const r of trs.slice(1)) {
      if (r.length < 2) continue;
      const { name, description } = splitNameCell(r[0]);
      if (!name) continue;
      const id = `item:${slugify(name)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const data: ItemData = {
        category: isPack ? "pack" : AMMO_RE.test(name) ? "ammunition" : "gear",
        subtype: slugify(header[0] || group) || undefined,
        costCp: parseCost(cell(r, iCost)),
        weightLb: weightOf(cell(r, iWeight)),
      };
      let desc = description;
      if (isPack) {
        data.contents = splitContents(cell(r, iContents));
        desc ||= `Contains: ${cell(r, iContents)}`;
      }
      rows.push(row({ id, name, source, sourceKind, description: desc, data }));
    }
  }
  if (!rows.length) warn("adventuring-gear: no gear rows found");
  return rows;
}

/* ------------------------------------------------------------------ */
/* tools                                                                */
/* ------------------------------------------------------------------ */

/**
 * Parse the tools page: one table (Tool Set | Cost | Weight) with group rows
 * (Artisan's tools, Gaming set, Musical instrument, Miscellaneous) that have empty cost cells.
 * Descriptions come from the headed sections (PHB, then XGE) below the table.
 */
export function parseTools(html: string): ContentRow<ItemData>[] {
  const { $, content } = loadPage(html);
  const rows: ContentRow<ItemData>[] = [];
  const seen = new Set<string>();

  // heading slug → markdown of the elements until the next heading (PHB and XGE sections are concatenated)
  const descs = new Map<string, string>();
  content.find("h1,h2,h3,h4,h5,h6").each((_, h) => {
    const key = slugify($(h).text());
    const nodes: Element[] = [];
    for (let n = $(h).next(); n.length && !/^h[1-6]$/.test(n.get(0)!.tagName); n = n.next()) {
      if (["p", "ul", "table"].includes(n.get(0)!.tagName)) nodes.push(n.get(0)!);
    }
    const md = toMarkdownAll($, nodes);
    if (md) descs.set(key, descs.has(key) ? `${descs.get(key)}\n\n${md}` : md);
  });
  const descFor = (name: string, group: string) => {
    const s = slugify(name);
    const g = slugify(group);
    return descs.get(s) ?? descs.get(`${s}s`) ?? (g ? (descs.get(g) ?? descs.get(`${g}s`) ?? "") : "");
  };

  for (const b of blocks($, content.get(0)!)) {
    if (b.kind !== "table") continue;
    const trs = tableRows($, b.el);
    const header = trs[0] ?? [];
    if (!/tool set/i.test(header[0] ?? "") || col(header, /^cost/i) < 0) continue;
    let group = "";
    for (const r of trs.slice(1)) {
      const name = clean(r[0] ?? "");
      if (!name) continue;
      if (isEmptyValue(cell(r, 1)) && isEmptyValue(cell(r, 2))) {
        group = name.toLowerCase(); // group header row, e.g. "Artisan's tools"
        continue;
      }
      const id = `item:${slugify(name)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(
        row({
          id,
          name,
          source: "PHB",
          description: descFor(name, group),
          data: { category: "tool", subtype: group || "tool", costCp: parseCost(cell(r, 1)), weightLb: weightOf(cell(r, 2)) },
        }),
      );
    }
  }
  if (!rows.length) warn("tools: no tool rows found");
  return rows;
}
