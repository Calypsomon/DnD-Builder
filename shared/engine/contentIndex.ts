import type {
  ContentBundle,
  ContentRow,
  ContentTable,
  FeatureData,
  SubclassData,
  SubspeciesData,
} from "../types/content";
import { CONTENT_TABLES } from "../types/content";
import type { CharacterBuild } from "../types/character";

export interface ContentIndex {
  bundle: ContentBundle;
  byId: Map<string, ContentRow<any>>;
  tableOf: Map<string, ContentTable>;
  featuresByOwner: Map<string, ContentRow<FeatureData>[]>;
  subclassesByClass: Map<string, ContentRow<SubclassData>[]>;
  subspeciesBySpecies: Map<string, ContentRow<SubspeciesData>[]>;
}

function push<K, V>(map: Map<K, V[]>, key: K, v: V) {
  const list = map.get(key);
  if (list) list.push(v);
  else map.set(key, [v]);
}

export function indexContent(bundle: ContentBundle): ContentIndex {
  const idx: ContentIndex = {
    bundle,
    byId: new Map(),
    tableOf: new Map(),
    featuresByOwner: new Map(),
    subclassesByClass: new Map(),
    subspeciesBySpecies: new Map(),
  };
  for (const t of CONTENT_TABLES) {
    for (const row of bundle[t] as ContentRow<any>[]) {
      idx.byId.set(row.id, row);
      idx.tableOf.set(row.id, t);
    }
  }
  for (const f of bundle.features) push(idx.featuresByOwner, f.data.ownerId, f);
  for (const list of idx.featuresByOwner.values()) list.sort((a, b) => a.data.level - b.data.level || a.data.sort - b.data.sort);
  for (const s of bundle.subclasses) push(idx.subclassesByClass, s.data.classId, s);
  for (const s of bundle.subspecies) push(idx.subspeciesBySpecies, s.data.speciesId, s);
  return idx;
}

/** Whether a content row is visible under the character's source filter (custom content is always visible) */
export function visible(row: ContentRow<any>, build: Pick<CharacterBuild, "options">): boolean {
  if (row.stale) return false;
  if (row.origin === "custom") return true;
  return build.options.sources.includes(row.sourceKind);
}
