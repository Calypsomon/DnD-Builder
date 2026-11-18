import type { Ability, Choice, Effect } from "../../shared/types/effects";
import type { ContentRow, FeatData } from "../../shared/types/content";
import { clean, flatChildren, loadPage, mapSource, row, textOf, toMarkdownAll, warn } from "./common";
import { abilitiesIn, ALL_ABILITIES, fixSourceName, numberWord } from "./lineage";

/** Slugs `feat:<x>` linked from the home page */
export function parseFeatIndex(homeHtml: string): string[] {
  const { $ } = loadPage(homeHtml);
  const out: string[] = [];
  $("a[href]").each((_, a) => {
    const href = ($(a).attr("href") ?? "").replace(/^\//, "").split(/[?#]/)[0];
    if (/^feat:[^/]+$/i.test(href) && !out.includes(href)) out.push(href);
  });
  return out;
}

const AB = "strength|dexterity|constitution|intelligence|wisdom|charisma";

function parsePrereqAbilities(text: string): FeatData["prereqAbilities"] {
  const out: { abilities: Ability[]; min: number }[] = [];
  const re = new RegExp(`((?:${AB})(?:\\s*(?:,|or|and|,\\s*or)\\s*(?:${AB}))*)\\s+(?:score\\s+of\\s+)?(\\d+)(?:\\s+or\\s+higher)?`, "gi");
  for (const m of text.matchAll(re)) {
    const min = parseInt(m[2], 10);
    if (/\band\b/i.test(m[1]) && !/\bor\b/i.test(m[1])) {
      for (const a of abilitiesIn(m[1])) out.push({ abilities: [a], min });
    } else out.push({ abilities: abilitiesIn(m[1]), min });
  }
  return out.length ? out : undefined;
}

export function parseFeat(slug: string, html: string): ContentRow<FeatData> {
  const { $, content } = loadPage(html);
  const id = slug.startsWith("feat:") ? slug : `feat:${slug}`;
  const name = clean($("title").first().text())
    .replace(/\s+-\s+DND 5th Edition.*$/i, "")
    .replace(/^Feat:\s*/i, "");

  let sourceRaw: string | null = null;
  let prerequisite: string | undefined;
  const bodyEls = [];
  for (const el of flatChildren($, content)) {
    const t = textOf($, el);
    if (el.name === "p") {
      const sm = t.match(/^Sour?ce:\s*(.+)$/i);
      if (sm && !sourceRaw) {
        sourceRaw = sm[1];
        continue;
      }
      const pm = t.match(/^Prerequisites?:\s*(.+)$/i);
      if (pm && prerequisite === undefined) {
        prerequisite = pm[1];
        continue;
      }
    }
    if (el.name === "hr" || !t && el.name !== "table") continue;
    bodyEls.push(el);
  }
  const mapped = mapSource(sourceRaw ? fixSourceName(sourceRaw) : null);
  const description = toMarkdownAll($, bodyEls);
  const plain = clean(bodyEls.map((e) => textOf($, e)).join(" "));

  const effects: Effect[] = [];
  const choices: Choice[] = [];
  const choiceId = `${id}:asi`;

  // "Increase your Strength or Dexterity score by 1, to a maximum of 20."
  const re = new RegExp(
    `increase your ((?:${AB})(?:\\s*(?:,|or|,\\s*or)\\s*(?:${AB}))*)\\s+score\\s+by\\s+(\\d+)(?:,?\\s*to a maximum of (\\d+))?`,
    "i",
  );
  const m = plain.match(re);
  if (m) {
    const abs = abilitiesIn(m[1]);
    const amount = parseInt(m[2], 10);
    const max = m[3] ? parseInt(m[3], 10) : 20;
    if (abs.length === 1) effects.push({ type: "abilityIncrease", ability: abs[0], value: amount, max });
    else
      choices.push({
        id: choiceId,
        label: "Ability Score Increase",
        level: 1,
        count: 1,
        from: { kind: "abilities", amount, distinct: true, ids: abs },
      });
  } else {
    const m2 = plain.match(/increase (?:one ability score of your choice|the chosen ability score|one of your ability scores) by (\d+)/i);
    if (m2) {
      const grants: Effect[] | undefined = /proficiency in saving throws using the chosen ability/i.test(plain)
        ? [{ type: "proficiency", kind: "save", ids: ["$id"] }]
        : undefined;
      choices.push({
        id: choiceId,
        label: "Ability Score Increase",
        level: 1,
        count: numberWord("one"),
        from: { kind: "abilities", amount: parseInt(m2[1], 10), distinct: true },
        ...(grants ? { grants } : {}),
      });
    }
  }
  void ALL_ABILITIES;

  const data: FeatData = {};
  if (prerequisite) {
    data.prerequisite = prerequisite;
    const pa = parsePrereqAbilities(prerequisite);
    if (pa) data.prereqAbilities = pa;
  }
  if (!sourceRaw) warn(`${id}: no source line`);

  return row<FeatData>({
    id,
    name,
    source: mapped.source,
    sourceKind: mapped.sourceKind,
    description,
    effects,
    choices,
    data,
  });
}
