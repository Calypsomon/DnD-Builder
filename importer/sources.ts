import type { SourceKind } from "../shared/types/content";

/** Book name (as written on the wiki) → abbreviation */
const BOOKS: Record<string, string> = {
  "player's handbook": "PHB",
  "dungeon master's guide": "DMG",
  "monster manual": "MM",
  "xanathar's guide to everything": "XGE",
  "tasha's cauldron of everything": "TCE",
  "sword coast adventurer's guide": "SCAG",
  "explorer's guide to wildemount": "EGW",
  "mordenkainen presents: monsters of the multiverse": "MPMM",
  "monsters of the multiverse": "MPMM",
  "mordenkainen's tome of foes": "MTF",
  "volo's guide to monsters": "VGM",
  "fizban's treasury of dragons": "FTD",
  "eberron: rising from the last war": "ERLW",
  "wayfinder's guide to eberron": "WGTE",
  "guildmasters' guide to ravnica": "GGR",
  "mythic odysseys of theros": "MOT",
  "van richten's guide to ravenloft": "VRGR",
  "strixhaven: a curriculum of chaos": "SCC",
  "spelljammer: adventures in space": "SAiS",
  "astral adventurer's guide": "AAG",
  "the book of many things": "BOMT",
  "bigby presents: glory of the giants": "BGG",
  "planescape: adventures in the multiverse": "PAitM",
  "dragonlance: shadow of the dragon queen": "DSotDQ",
  "the wild beyond the witchlight": "WBtW",
  "acquisitions incorporated": "AI",
  "acquisitions inc.": "AI",
  "icewind dale: rime of the frostmaiden": "IDRotF",
  "elemental evil player's companion": "EEPC",
  "princes of the apocalypse": "PotA",
  "lost laboratory of kwalish": "LLK",
  "one grung above": "OGA",
  "locathah rising": "LR",
  "the tortle package": "TTP",
  "plane shift: amonkhet": "PS:A",
  "plane shift: dominaria": "PS:D",
  "plane shift: innistrad": "PS:I",
  "plane shift: ixalan": "PS:X",
  "plane shift: kaladesh": "PS:K",
  "plane shift: zendikar": "PS:Z",
  "critical role: call of the netherdeep": "CR:CN",
  "tal'dorei campaign setting reborn": "TDCSR",
  "humblewood campaign setting": "HCS",
  "candlekeep mysteries": "CM",
  "curse of strahd": "CoS",
  "tomb of annihilation": "ToA",
  "out of the abyss": "OotA",
  "storm king's thunder": "SKT",
  "ghosts of saltmarsh": "GoS",
  "baldur's gate: descent into avernus": "BGDiA",
  "mulmaster bonds and backgrounds": "AL",
  "state of hillsfar": "AL",
  "hoard of the dragon queen": "HotDQ",
  "adventures with muk": "AwM",
  "unearthed arcana": "UA",
  "homebrew": "HB",
};

/** Abbreviations used directly on the wiki (e.g. magic item tables) that are UA/homebrew */
const UA_ABBR = new Set(["UA"]);
const HOMEBREW_ABBR = new Set(["HB", "Homebrew"]);

export const unknownSources = new Set<string>();

export function normalizeSourceName(raw: string): string {
  return raw
    .replace(/^source:\s*/i, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/,?\s*p(age|g)?\.?\s*\d+.*$/i, "")
    .replace(/\s+-\s+/g, ": ")
    .replace(/guildmaster's guide/i, "guildmasters' guide")
    // several books listed: keep the first
    .replace(/^(guildmasters' guide to ravnica)[ ,].*$/i, "$1")
    .trim();
}

/** Map a wiki source text (book name or abbreviation) to {source, sourceKind} */
export function mapSource(raw: string | null | undefined): { source: string; sourceKind: SourceKind } {
  if (!raw) return { source: "", sourceKind: "official" };
  const name = normalizeSourceName(raw);
  const lower = name.toLowerCase();
  if (/unearthed arcana/i.test(name)) return { source: "UA", sourceKind: "ua" };
  if (/homebrew/i.test(name)) return { source: "HB", sourceKind: "homebrew" };
  if (BOOKS[lower]) return { source: BOOKS[lower], sourceKind: "official" };
  // Starts with a known book name (e.g. "Player's Handbook (2014)")
  for (const [book, abbr] of Object.entries(BOOKS)) {
    if (lower.startsWith(book)) return { source: abbr, sourceKind: abbr === "UA" ? "ua" : "official" };
  }
  // Already an abbreviation
  if (/^[A-Za-z:&.]{2,10}$/.test(name)) {
    if (UA_ABBR.has(name)) return { source: name, sourceKind: "ua" };
    if (HOMEBREW_ABBR.has(name)) return { source: "HB", sourceKind: "homebrew" };
    return { source: name, sourceKind: "official" };
  }
  unknownSources.add(name);
  return { source: name, sourceKind: "official" };
}
