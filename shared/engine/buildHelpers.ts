import type { CharacterBuild } from "../types/character";

/** Class ids in the order they were first taken */
export function classOrder(b: CharacterBuild): string[] {
  const out: string[] = [];
  for (const l of b.levels) if (!out.includes(l.classId)) out.push(l.classId);
  if (!out.length && b.classId) out.push(b.classId);
  return out;
}

/** The first class (determines saving throws and full proficiencies) */
export function firstClassId(b: CharacterBuild): string | null {
  return b.levels[0]?.classId ?? b.classId ?? null;
}

/** For every character level: which class it went to and the resulting level in that class */
export function levelMap(b: CharacterBuild): { charLevel: number; classId: string; classLevel: number }[] {
  const counts: Record<string, number> = {};
  return b.levels.map((l, i) => {
    counts[l.classId] = (counts[l.classId] ?? 0) + 1;
    return { charLevel: i + 1, classId: l.classId, classLevel: counts[l.classId] };
  });
}

export function classLevels(b: CharacterBuild): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of b.levels) out[l.classId] = (out[l.classId] ?? 0) + 1;
  return out;
}

/** Character level at which a class reached the given class level */
export function charLevelOf(b: CharacterBuild, classId: string, classLevel: number): number | null {
  return levelMap(b).find((m) => m.classId === classId && m.classLevel === classLevel)?.charLevel ?? null;
}

/** Subclass chosen for a class (supports the older single `subclassId` field) */
export function subclassOf(b: CharacterBuild, classId: string): string | null {
  return b.subclasses?.[classId] ?? (classId === firstClassId(b) ? b.subclassId : null) ?? null;
}

/** Spells known/prepared for one class (older builds stored them in `spells` for the first class) */
export function spellsOf(b: CharacterBuild, classId: string): { known: string[]; prepared: string[] } {
  const own = b.classSpells?.[classId];
  if (own) return own;
  if (classId === firstClassId(b)) return b.spells;
  return { known: [], prepared: [] };
}

/** Mutable spell lists for a class; migrates the old single-class storage on first write */
export function editableSpells(b: CharacterBuild, classId: string): { known: string[]; prepared: string[] } {
  b.classSpells ??= {};
  if (!b.classSpells[classId]) {
    const legacy = classId === firstClassId(b) ? b.spells : { known: [], prepared: [] };
    b.classSpells[classId] = { known: [...legacy.known], prepared: [...legacy.prepared] };
    if (classId === firstClassId(b)) b.spells = { known: [], prepared: [] };
  }
  return b.classSpells[classId];
}

/** Set the subclass of a class (keeps the legacy field in sync for the first class) */
export function setSubclass(b: CharacterBuild, classId: string, subclassId: string | null) {
  b.subclasses ??= {};
  if (subclassId) b.subclasses[classId] = subclassId;
  else delete b.subclasses[classId];
  if (classId === firstClassId(b)) b.subclassId = subclassId;
}
