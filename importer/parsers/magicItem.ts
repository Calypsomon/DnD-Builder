import type { Effect } from "../../shared/types/effects";
import type { ContentRow, ItemData, SourceKind } from "../../shared/types/content";
import { abilityFromName, clean, findSource, flatChildren, loadPage, mapSource, row, textOf, toMarkdownAll, warn } from "./common";

export interface MagicIndexEntry {
  /** "wondrous-items:bag-of-holding" */
  slug: string;
  name: string;
  /** Type column as written on the wiki: "Weapon", "Wondrous Item", "Ring", ... */
  type: string;
  attuned: boolean;
  /** Source column, raw wiki abbreviation (DMG, XGE, E:RLW, ...) */
  source: string;
  /** Lowercase rarity taken from the tab the item is listed in ("common" ... "artifact", "unique", "unknown") */
  rarity: string;
}

/**
 * Wiki abbreviations (legend on the wondrous-items page) → abbreviation used in the app
 * (same codes as importer/sources.ts). Unlisted abbreviations are used as-is without colons.
 */
const WIKI_ABBR: Record<string, string> = {
  "E:RLW": "ERLW",
  "D:SDQ": "DSotDQ",
  "PS:AiM": "PAitM",
  PSAIM: "PAitM",
  SAS: "SAiS",
  "BP:GOG": "BGG",
  WBW: "WBtW",
  OoA: "OotA",
  PoA: "PotA",
  "BG:DA": "BGDA",
  "ID:RF": "IDRotF",
};

/** Map an index source abbreviation to {source, sourceKind} */
function mapAbbr(abbr: string): { source: string; sourceKind: SourceKind } {
  const a = clean(abbr).split(/\s*(?:,|\s+and\s+|\/)\s*/)[0]; // "DMG, LLK" lists several books: first wins
  if (!a) return { source: "", sourceKind: "official" };
  if (/^ua$/i.test(a)) return { source: "UA", sourceKind: "ua" };
  if (/^(hb|homebrew)$/i.test(a)) return { source: "HB", sourceKind: "homebrew" };
  const known = Object.entries(WIKI_ABBR).find(([k]) => k.toLowerCase() === a.toLowerCase());
  return { source: known ? known[1] : a.replace(/:/g, ""), sourceKind: "official" };
}

function slugFromHref(href: string | undefined, prefix: string): string | null {
  const m = (href ?? "").match(new RegExp(`/(${prefix}:[^/?#]+)$`));
  return m ? m[1] : null;
}

/** Page title (without the site suffix) */
function pageName($: ReturnType<typeof loadPage>["$"]): string {
  const t = clean($(".page-title").first().text());
  if (t) return t;
  return clean($("title").text()).replace(/\s+-\s+DND 5th Edition.*$/i, "");
}

/** Index page `wondrous-items`: one table per rarity tab (Common, Uncommon, ..., ???). */
export function parseMagicItemIndex(html: string): MagicIndexEntry[] {
  const { $ } = loadPage(html);
  const labels = $(".yui-nav li")
    .map((_, li) => clean($(li).text()).toLowerCase())
    .get();
  const tabs = $(".yui-content > div");
  const out: MagicIndexEntry[] = [];
  const seen = new Set<string>();
  tabs.each((i, tab) => {
    const label = labels[i] ?? "";
    const rarity = label === "???" || !label ? "unknown" : label;
    $(tab)
      .find("table tr")
      .each((_, tr) => {
        const tds = $(tr).find("td");
        if (tds.length < 2) return;
        const a = tds.eq(0).find("a").first();
        const slug = slugFromHref(a.attr("href"), "wondrous-items");
        if (!slug || seen.has(slug)) return;
        seen.add(slug);
        out.push({
          slug,
          name: clean(a.text()),
          type: clean(tds.eq(1).text()),
          attuned: /attun/i.test(tds.eq(2).text()),
          source: clean(tds.eq(3).text()),
          rarity,
        });
      });
  });
  if (!out.length) warn("wondrous-items index: no items found");
  return out;
}

const RARITY_RE = /very rare|uncommon|common|rare|legendary|artifact/gi;

/** Split at the first comma that is not inside parentheses */
function splitTypeLine(line: string): [string, string] {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
  }
  return [line.trim(), ""];
}

/** Sentences of a text (rough split) */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/);
}

/** "Protection (Rare). You gain ..." - one entry of a variant list, not the item itself */
const VARIANT_LABEL_RE = /^[A-Z][\w' -]*\((?:very rare|rare|uncommon|common|legendary)[^)]*\)\./i;

/** Detect simple, unconditional bonuses in the item text and turn them into effects. */
function detectEffects(text: string, ctx: { attunement: boolean; multiRarity: boolean; rarityText: string; hasTable: boolean }): Effect[] {
  const effects: Effect[] = [];
  const when = ctx.attunement ? "itemAttuned" : "itemEquipped";
  for (const s of sentences(text)) {
    // weapon attack/damage bonus ("+1 bonus to attack and damage rolls")
    const wb = s.match(/\+(\d+) bonus to (?:both )?attack and damage rolls/i);
    if (wb) {
      effects.push({ type: "note", text: `+${wb[1]} bonus to attack and damage rolls` });
      continue;
    }
    // ability score set ("Your Strength score is 19 while you wear this ...")
    const ab = s.match(/^Your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) score is (\d+) while you (?:wear|wield|hold|carry)/i);
    if (ab) {
      const ability = abilityFromName(ab[1]);
      if (ability) effects.push({ type: "abilitySet", ability, value: +ab[2] });
      continue;
    }
    // AC / saving throw bonus; conditional sentences ("... if you are wearing no armor") become notes
    const ac = s.match(/\+(\d+) bonus to (?:your )?(?:AC|Armor Class)(?: and (?:to )?saving throws)?/i);
    const save = s.match(/\+(\d+) bonus to (?:AC and )?(?:all )?saving throws/i);
    if (ac || save) {
      // (items with variant tables, e.g. ioun stones, only get a note as well)
      if (ctx.hasTable || VARIANT_LABEL_RE.test(s) || /\b(if|unless|only|against)\b/i.test(s)) {
        effects.push({ type: "note", text: s.trim() });
        continue;
      }
      if (ac) effects.push({ type: "bonus", target: "ac", value: +ac[1], when });
      if (save) effects.push({ type: "bonus", target: "save.all", value: +save[1], when });
    }
  }
  if (ctx.multiRarity) {
    effects.push({ type: "note", text: `Variant item: ${ctx.rarityText}` });
  }
  return effects;
}

/** Page `/wondrous-items:<x>` → one magic item row. */
export function parseMagicItem(slug: string, html: string, index?: MagicIndexEntry): ContentRow<ItemData> {
  const { $, content } = loadPage(html);
  const bare = slug.replace(/^wondrous-items:/, "");
  const name = pageName($) || index?.name || bare;

  // source: prefer the index abbreviation, else the page's "Source: ..." line
  const pageSource = findSource($, content);
  const mapped = index?.source ? mapAbbr(index.source) : mapSource(pageSource);
  const src = mapped.source ? mapped : mapSource(pageSource);

  // the italic type line: <p><em>Wondrous item, uncommon (requires attunement)</em></p>
  const children = flatChildren($, content);
  let typeIdx = -1;
  let line = "";
  children.forEach((el, i) => {
    if (typeIdx >= 0 || el.name !== "p") return;
    const t = textOf($, el);
    const em = clean($(el).children("em, i").first().text());
    // a few pages have the type line as plain (non italic) text
    const plain = /^(weapon|armor|wondrous item|ring|potion|staff|wand|rod|scroll|shield)\b.*,/i.test(t) && t.length < 120;
    if ((em && em === t && t.length < 200) || plain) {
      typeIdx = i;
      line = t;
    }
  });
  if (typeIdx < 0) warn(`magic item ${slug}: type line not found`);

  const attMatch = line.match(/\(\s*(requires attunement[^)]*)\)/i);
  const attunement = !!attMatch || !!index?.attuned;
  const lineNoAtt = line.replace(/\(\s*requires attunement[^)]*\)/i, "").replace(/\s+/g, " ").trim();
  const [magicType, rest] = splitTypeLine(lineNoAtt);

  // rarity: "rare", "uncommon (+1), rare (+2), or very rare (+3)", "rarity varies"
  const rarities = [...new Set((rest.match(RARITY_RE) ?? []).map((r) => r.toLowerCase()))];
  let rarity: string;
  if (/\?\?\?|unknown/i.test(rest)) rarity = "unknown";
  else if (/varies/i.test(rest)) rarity = index && index.rarity !== "unknown" ? index.rarity : "varies";
  else if (rarities.length > 1) rarity = "varies";
  else rarity = rarities[0] ?? (index?.rarity && index.rarity !== "unknown" ? index.rarity : "");
  if (!rarity) warn(`magic item ${slug}: no rarity found ("${line}")`);

  const typeWord = (magicType || index?.type || "").toLowerCase().match(/[a-z]+/)?.[0] ?? "";
  const subtype = typeWord || undefined;

  const bodyEls = children.filter((el, i) => i > typeIdx && !(el.name === "p" && /^Source:/i.test(textOf($, el))) && !$(el).hasClass("content-separator"));
  const description = toMarkdownAll($, bodyEls);
  const bodyText = bodyEls.map((el) => textOf($, el)).join(" ");

  const effects = detectEffects(bodyText, { attunement, multiRarity: rarities.length > 1, rarityText: rest, hasTable: bodyEls.some((el) => el.name === "table") });

  return row<ItemData>({
    id: `magic:${bare}`,
    name,
    source: src.source,
    sourceKind: src.sourceKind,
    description,
    effects,
    data: {
      category: "magic",
      subtype,
      rarity,
      attunement,
      ...(attMatch ? { attunementText: clean(attMatch[1]) } : {}),
      magicType: magicType || index?.type || undefined,
    },
  });
}
