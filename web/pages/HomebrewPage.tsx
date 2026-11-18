import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type HomebrewInput } from "../api/client";
import { useContent, useReloadContent } from "../api/content";
import { EffectEditor, describeEffect } from "../components/EffectEditor";
import { Markdown } from "../components/Markdown";
import { Badge, Button, Card, Checkbox, Empty, Field, Input, Select, SourceBadge, TextArea, confirmDialog, cx } from "../components/ui";
import { DAMAGE_TYPES, titleCase } from "../../shared/rules/tables";
import type { ArmorStats, ContentRow, ContentTable, ItemData, WeaponStats } from "../../shared/types/content";
import { ABILITIES, EffectSchema, type Ability, type Choice, type Effect } from "../../shared/types/effects";

type Kind = "weapon" | "armor" | "item" | "feat" | "ability";
const KIND_LABEL: Record<Kind, string> = { weapon: "Weapon", armor: "Armor", item: "Item", feat: "Feat", ability: "Ability" };
const TABLE_OF: Record<Kind, ContentTable> = { weapon: "items", armor: "items", item: "items", feat: "feats", ability: "features" };

const WEAPON_PROPS = ["finesse", "light", "heavy", "reach", "two-handed", "loading", "thrown", "ammunition", "versatile", "special"];
const RARITIES = ["none", "common", "uncommon", "rare", "very rare", "legendary", "artifact"];
const ITEM_TYPES = ["Gear", "Wondrous item", "Ring", "Potion", "Wand", "Staff", "Rod", "Scroll", "Tool"];
const ABILITY_NAMES: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const ARMOR_PRESET: Record<string, { baseAc: string; dexCap: string }> = {
  light: { baseAc: "11", dexCap: "unlimited" },
  medium: { baseAc: "12", dexCap: "2" },
  heavy: { baseAc: "16", dexCap: "0" },
  shield: { baseAc: "2", dexCap: "0" },
};

type ChoiceKind = "none" | "skill" | "tool" | "language" | "ability";

interface Draft {
  kind: Kind;
  id?: string;
  name: string;
  description: string;
  effects: Effect[];
  /** data of the source row, preserved for fields the editor does not touch */
  baseData: Record<string, any>;
  // weapon
  wCategory: "simple" | "martial";
  wRange: "melee" | "ranged";
  damage: string;
  damageType: string;
  props: string[];
  rangeNormal: string;
  rangeLong: string;
  versatile: string;
  // shared item bits
  magicBonus: string;
  costGp: string;
  weightLb: string;
  rarity: string;
  attunement: boolean;
  // armor
  aType: "light" | "medium" | "heavy" | "shield";
  baseAc: string;
  dexCap: "unlimited" | "2" | "0";
  strReq: string;
  stealth: boolean;
  // item
  itemType: string;
  magicType: string;
  // feat / ability
  prerequisite: string;
  prereqAbility: "" | Ability;
  prereqMin: string;
  choiceKind: ChoiceKind;
  choiceCount: string;
  choiceId: string;
  otherChoices: Choice[];
}

const newId = () => `hb-${Math.random().toString(36).slice(2, 8)}`;

function emptyDraft(kind: Kind): Draft {
  const armor = ARMOR_PRESET.light;
  return {
    kind,
    name: "",
    description: "",
    effects: [],
    baseData: {},
    wCategory: "simple",
    wRange: "melee",
    damage: "1d6",
    damageType: "slashing",
    props: [],
    rangeNormal: "",
    rangeLong: "",
    versatile: "",
    magicBonus: "0",
    costGp: "",
    weightLb: "",
    rarity: "none",
    attunement: false,
    aType: "light",
    baseAc: armor.baseAc,
    dexCap: armor.dexCap as Draft["dexCap"],
    strReq: "",
    stealth: false,
    itemType: "Gear",
    magicType: "",
    prerequisite: "",
    prereqAbility: "",
    prereqMin: "13",
    choiceKind: "none",
    choiceCount: "1",
    choiceId: newId(),
    otherChoices: [],
  };
}

function kindOf(table: ContentTable, row: ContentRow<any>): Kind {
  if (table === "feats") return "feat";
  if (table === "features") return "ability";
  const c = (row.data as ItemData).category;
  if (c === "weapon") return "weapon";
  if (c === "armor" || c === "shield") return "armor";
  return "item";
}

function fromRow(table: ContentTable, row: ContentRow<any>, opts?: { copy?: boolean }): Draft {
  const kind = kindOf(table, row);
  const d = emptyDraft(kind);
  const data = (row.data ?? {}) as Record<string, any>;
  d.id = opts?.copy ? undefined : row.id;
  d.name = opts?.copy ? `${row.name} (Custom)` : row.name;
  d.description = row.description ?? "";
  d.effects = structuredClone(row.effects ?? []);
  d.baseData = opts?.copy && table === "features" ? {} : structuredClone(data);
  if (table === "items") {
    const it = data as ItemData;
    d.costGp = it.costCp != null ? String(it.costCp / 100) : "";
    d.weightLb = it.weightLb != null ? String(it.weightLb) : "";
    d.rarity = it.rarity && RARITIES.includes(it.rarity) ? it.rarity : "none";
    d.attunement = !!it.attunement;
    if (it.weapon) {
      const w = it.weapon;
      d.wCategory = w.category;
      d.wRange = w.range;
      d.damage = w.damage;
      d.damageType = w.damageType;
      d.props = [...w.properties];
      d.rangeNormal = w.rangeNormal != null ? String(w.rangeNormal) : "";
      d.rangeLong = w.rangeLong != null ? String(w.rangeLong) : "";
      d.versatile = w.versatile ?? "";
      d.magicBonus = String(w.magicBonus ?? 0);
    }
    if (it.armor) {
      const a = it.armor;
      d.aType = a.type;
      d.baseAc = String(a.baseAc);
      d.dexCap = a.dexCap == null ? "unlimited" : a.dexCap === 2 ? "2" : "0";
      d.strReq = a.strReq ? String(a.strReq) : "";
      d.stealth = a.stealthDisadvantage;
      d.magicBonus = String(a.magicBonus ?? 0);
    }
    if (kind === "item") {
      d.itemType = it.category === "gear" ? "Gear" : it.category === "tool" ? "Tool" : ITEM_TYPES.includes(it.subtype ?? "") ? it.subtype! : "Wondrous item";
      d.magicType = it.magicType ?? "";
    }
  } else {
    d.prerequisite = data.prerequisite ?? "";
    const pa = data.prereqAbilities?.[0];
    if (pa?.abilities?.length) {
      d.prereqAbility = pa.abilities[0];
      d.prereqMin = String(pa.min);
    }
    const choices: Choice[] = row.choices ?? [];
    const idx = choices.findIndex((c) => c.id.endsWith(":choice") && ["skills", "tools", "languages", "abilities"].includes(c.from.kind));
    if (idx >= 0) {
      const c = choices[idx];
      d.choiceKind = c.from.kind === "skills" ? "skill" : c.from.kind === "tools" ? "tool" : c.from.kind === "languages" ? "language" : "ability";
      d.choiceCount = String(typeof c.count === "number" ? c.count : 1);
      d.choiceId = c.id.replace(/:choice$/, "");
    }
    d.otherChoices = choices.filter((_, i) => i !== idx);
  }
  return d;
}

function num(s: string): number | undefined {
  if (s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function buildChoice(d: Draft): Choice | null {
  const count = Math.max(1, num(d.choiceCount) ?? 1);
  const id = `${d.choiceId}:choice`;
  switch (d.choiceKind) {
    case "skill":
      return { id, label: "Choose skill proficiency", level: 1, count, from: { kind: "skills" }, grants: [{ type: "proficiency", kind: "skill", ids: ["$id"] }] };
    case "tool":
      return { id, label: "Choose tool proficiency", level: 1, count, from: { kind: "tools" }, grants: [{ type: "proficiency", kind: "tool", ids: ["$id"] }] };
    case "language":
      return { id, label: "Choose language", level: 1, count, from: { kind: "languages" }, grants: [{ type: "proficiency", kind: "language", ids: ["$id"] }] };
    case "ability":
      return { id, label: "Increase an ability score by 1", level: 1, count, from: { kind: "abilities", amount: 1, distinct: true } };
    default:
      return null;
  }
}

function toData(d: Draft): Record<string, any> {
  const base = { ...d.baseData };
  if (d.kind === "feat") {
    const out: Record<string, any> = { ...base };
    delete out.prerequisite;
    delete out.prereqAbilities;
    if (d.prerequisite.trim()) out.prerequisite = d.prerequisite.trim();
    if (d.prereqAbility) out.prereqAbilities = [{ abilities: [d.prereqAbility], min: num(d.prereqMin) ?? 13 }];
    return out;
  }
  if (d.kind === "ability") {
    const out: Record<string, any> = { ownerType: "feat", ownerId: "custom", level: 1, sort: 0, ...base };
    delete out.prerequisite;
    if (d.prerequisite.trim()) out.prerequisite = d.prerequisite.trim();
    return out;
  }
  const out: ItemData = { ...base } as ItemData;
  const cost = num(d.costGp);
  out.costCp = cost != null ? Math.round(cost * 100) : undefined;
  out.weightLb = num(d.weightLb);
  out.rarity = d.rarity === "none" ? undefined : d.rarity;
  out.attunement = d.attunement || undefined;
  const mb = Math.max(0, Math.min(3, num(d.magicBonus) ?? 0)) || undefined;
  if (d.kind === "weapon") {
    out.category = "weapon";
    out.subtype = `${d.wCategory}-${d.wRange}`;
    const w: WeaponStats = {
      category: d.wCategory,
      range: d.wRange,
      damage: d.damage.trim(),
      damageType: d.damageType,
      properties: d.props,
    };
    if (d.props.includes("versatile") && d.versatile.trim()) w.versatile = d.versatile.trim();
    if (d.props.includes("thrown") || d.props.includes("ammunition")) {
      w.rangeNormal = num(d.rangeNormal);
      w.rangeLong = num(d.rangeLong);
    }
    if (mb) w.magicBonus = mb;
    out.weapon = w;
    delete out.armor;
  } else if (d.kind === "armor") {
    out.category = d.aType === "shield" ? "shield" : "armor";
    out.subtype = d.aType;
    const a: ArmorStats = {
      type: d.aType,
      baseAc: num(d.baseAc) ?? 0,
      dexCap: d.dexCap === "unlimited" ? null : Number(d.dexCap),
      stealthDisadvantage: d.stealth,
    };
    const sr = num(d.strReq);
    if (sr) a.strReq = sr;
    if (mb) a.magicBonus = mb;
    out.armor = a;
    delete out.weapon;
  } else {
    out.category = d.itemType === "Gear" ? "gear" : d.itemType === "Tool" ? "tool" : "magic";
    out.subtype = d.itemType;
    out.magicType = out.category === "magic" ? d.magicType.trim() || d.itemType : undefined;
    delete out.weapon;
    delete out.armor;
  }
  return JSON.parse(JSON.stringify(out));
}

function toInput(d: Draft): HomebrewInput {
  const choices = [...d.otherChoices];
  if (d.kind === "feat" || d.kind === "ability") {
    const c = buildChoice(d);
    if (c) choices.unshift(c);
  }
  return { name: d.name.trim(), description: d.description, data: toData(d), effects: d.effects, choices };
}

function previewLines(d: Draft): string[] {
  const data = toData(d) as ItemData;
  const out: string[] = [];
  if (d.kind === "weapon" && data.weapon) {
    const w = data.weapon;
    const bonus = w.magicBonus ? ` +${w.magicBonus}` : "";
    out.push(`${titleCase(w.category)} ${w.range} weapon${bonus}`);
    out.push(`${w.damage || "-"} ${w.damageType}${w.versatile ? ` (${w.versatile} versatile)` : ""}${w.properties.length ? ` | ${w.properties.join(", ")}` : ""}${w.rangeNormal ? ` | range ${w.rangeNormal}/${w.rangeLong ?? w.rangeNormal}` : ""}`);
  }
  if (d.kind === "armor" && data.armor) {
    const a = data.armor;
    out.push(`${titleCase(a.type)} ${a.type === "shield" ? "" : "armor "}| AC ${a.type === "shield" ? "+" : ""}${a.baseAc + (a.magicBonus ?? 0)}${a.dexCap === null ? " + Dex" : a.dexCap === 0 ? "" : ` + Dex (max ${a.dexCap})`}${a.strReq ? ` | Str ${a.strReq}` : ""}${a.stealthDisadvantage ? " | Stealth disadvantage" : ""}`);
  }
  if (d.kind === "item") out.push(`${d.itemType}${data.magicType && data.magicType !== d.itemType ? ` (${data.magicType})` : ""}`);
  if (d.kind === "weapon" || d.kind === "armor" || d.kind === "item") {
    const bits = [data.rarity ? titleCase(data.rarity.replace(/ /g, "-")) : null, data.attunement ? "requires attunement" : null, data.costCp != null ? `${data.costCp / 100} gp` : null, data.weightLb != null ? `${data.weightLb} lb` : null].filter(Boolean);
    if (bits.length) out.push(bits.join(" | "));
  }
  if (d.kind === "feat" || d.kind === "ability") {
    const pre = [d.prerequisite.trim(), d.prereqAbility ? `${ABILITY_NAMES[d.prereqAbility]} ${num(d.prereqMin) ?? 13}+` : ""].filter(Boolean).join("; ");
    if (pre) out.push(`Prerequisite: ${pre}`);
    const c = buildChoice(d);
    if (c) out.push(`Grants a choice: ${c.label.toLowerCase()} (x${c.count})`);
  }
  return out;
}

function usageMessage(name: string, users: { id: string; name: string }[]) {
  if (!users.length) return `Delete "${name}"? This cannot be undone.`;
  return `"${name}" is used by ${users.length} character${users.length === 1 ? "" : "s"}:\n${users.map((u) => `- ${u.name}`).join("\n")}\n\nDelete it anyway? This cannot be undone.`;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>;
}

export default function HomebrewPage() {
  const content = useContent();
  const reload = useReloadContent();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const custom = <T,>(rows: ContentRow<T>[]) => rows.filter((r) => r.origin === "custom");
    const items = custom(content.bundle.items);
    const cat = (r: ContentRow<ItemData>) => r.data.category;
    return [
      { title: "Weapons", table: "items" as ContentTable, rows: items.filter((r) => cat(r) === "weapon") },
      { title: "Armor & Shields", table: "items" as ContentTable, rows: items.filter((r) => cat(r) === "armor" || cat(r) === "shield") },
      { title: "Items", table: "items" as ContentTable, rows: items.filter((r) => !["weapon", "armor", "shield"].includes(cat(r))) },
      { title: "Feats", table: "feats" as ContentTable, rows: custom(content.bundle.feats) },
      { title: "Abilities", table: "features" as ContentTable, rows: custom(content.bundle.features) },
    ] as { title: string; table: ContentTable; rows: ContentRow<any>[] }[];
  }, [content]);

  // ?copy=items:<id> / feats:<id>
  const copy = params.get("copy");
  useEffect(() => {
    if (!copy) return;
    const i = copy.indexOf(":");
    const table = copy.slice(0, i) as ContentTable;
    const row = content.byId.get(copy.slice(i + 1));
    if (row && (table === "items" || table === "feats")) {
      setDraft(fromRow(table, row, { copy: true }));
      setError(null);
    }
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy]);

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const startNew = (kind: Kind) => {
    setDraft(emptyDraft(kind));
    setError(null);
  };

  const effectsOk = draft ? draft.effects.every((e) => EffectSchema.safeParse(e).success) : true;
  const canSave = !!draft && draft.name.trim() !== "" && effectsOk && !saving;

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const table = TABLE_OF[draft.kind];
      const input = toInput(draft);
      const saved = draft.id ? await api.updateHomebrew(table, draft.id, input) : await api.createHomebrew(table, input);
      await reload();
      setDraft(fromRow(table, saved));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    const table = TABLE_OF[draft.kind];
    try {
      const users = await api.homebrewUsage(table, draft.id);
      if (!confirmDialog(usageMessage(draft.name, users))) return;
      await api.deleteHomebrew(table, draft.id);
      await reload();
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const duplicate = () => draft && setDraft({ ...draft, id: undefined, name: `${draft.name} (Copy)`, choiceId: newId() });

  return (
    <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Homebrew</h1>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <Button key={k} size="sm" variant="primary" onClick={() => startNew(k)}>
              New {KIND_LABEL[k].toLowerCase()}
            </Button>
          ))}
        </div>
        {groups.every((g) => g.rows.length === 0) && <Empty>No custom entries yet.</Empty>}
        {groups.map(
          (g) =>
            g.rows.length > 0 && (
              <div key={g.title}>
                <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</h2>
                <ul className="flex flex-col gap-0.5">
                  {g.rows.map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => {
                          setDraft(fromRow(g.table, r));
                          setError(null);
                        }}
                        className={cx(
                          "w-full cursor-pointer truncate rounded-md px-2 py-1 text-left text-sm hover:bg-panel2",
                          draft?.id === r.id && "bg-accent-soft text-accent",
                        )}
                      >
                        {r.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ),
        )}
      </aside>

      <main className="min-w-0">
        {!draft ? (
          <Empty>Select a custom entry or create a new one. You can also copy a wiki entry via its "Copy to homebrew" action.</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <Card
              title={
                <span className="flex items-center gap-2">
                  {draft.id ? "Edit" : "New"} {KIND_LABEL[draft.kind].toLowerCase()}
                  {draft.id && <SourceBadge origin="custom" />}
                </span>
              }
              actions={
                <>
                  {draft.id && (
                    <>
                      <Button size="sm" onClick={duplicate}>
                        Duplicate
                      </Button>
                      <Button size="sm" variant="danger" onClick={remove}>
                        Delete
                      </Button>
                    </>
                  )}
                  <Button size="sm" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="primary" disabled={!canSave} onClick={save}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </>
              }
            >
              <div className="flex flex-col gap-3">
                {error && <p className="text-sm text-danger">{error}</p>}
                <Field label="Name">
                  <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
                </Field>

                {draft.kind === "weapon" && <WeaponFields d={draft} patch={patch} />}
                {draft.kind === "armor" && <ArmorFields d={draft} patch={patch} />}
                {draft.kind === "item" && <ItemFields d={draft} patch={patch} />}
                {(draft.kind === "feat" || draft.kind === "ability") && <FeatFields d={draft} patch={patch} />}

                <Field label="Description (markdown)">
                  <TextArea rows={5} value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
                </Field>
                <div>
                  <h4 className="mb-1 text-sm font-semibold">Effects</h4>
                  <EffectEditor value={draft.effects} onChange={(v) => patch({ effects: v })} />
                </div>
              </div>
            </Card>

            <Card title="Preview">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{draft.name || "(unnamed)"}</span>
                  <Badge tone="accent">Custom</Badge>
                </div>
                {previewLines(draft).map((l, i) => (
                  <p key={i} className="text-xs italic text-muted">
                    {l}
                  </p>
                ))}
                <Markdown text={draft.description} />
                {draft.effects.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-muted">
                    {draft.effects.map((e, i) => (
                      <li key={i}>{describeEffect(e)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

type FormProps = { d: Draft; patch: (p: Partial<Draft>) => void };

function CommonItemFields({ d, patch, magicBonus = true }: FormProps & { magicBonus?: boolean }) {
  return (
    <Row>
      {magicBonus && (
        <Field label="Magic bonus">
          <Select value={d.magicBonus} onChange={(e) => patch({ magicBonus: e.target.value })}>
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "None" : `+${n}`}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Cost (gp)">
        <Input type="number" min={0} step="any" className="w-24" value={d.costGp} onChange={(e) => patch({ costGp: e.target.value })} />
      </Field>
      <Field label="Weight (lb)">
        <Input type="number" min={0} step="any" className="w-24" value={d.weightLb} onChange={(e) => patch({ weightLb: e.target.value })} />
      </Field>
      <Field label="Rarity">
        <Select value={d.rarity} onChange={(e) => patch({ rarity: e.target.value })}>
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {r === "none" ? "None (mundane)" : titleCase(r.replace(/ /g, "-"))}
            </option>
          ))}
        </Select>
      </Field>
      <div className="pb-1">
        <Checkbox label="Requires attunement" checked={d.attunement} onChange={(v) => patch({ attunement: v })} />
      </div>
    </Row>
  );
}

function WeaponFields({ d, patch }: FormProps) {
  const ranged = d.props.includes("thrown") || d.props.includes("ammunition");
  return (
    <>
      <Row>
        <Field label="Category">
          <Select value={d.wCategory} onChange={(e) => patch({ wCategory: e.target.value as Draft["wCategory"] })}>
            <option value="simple">Simple</option>
            <option value="martial">Martial</option>
          </Select>
        </Field>
        <Field label="Range">
          <Select value={d.wRange} onChange={(e) => patch({ wRange: e.target.value as Draft["wRange"] })}>
            <option value="melee">Melee</option>
            <option value="ranged">Ranged</option>
          </Select>
        </Field>
        <Field label="Damage dice">
          <Input className="w-24" value={d.damage} placeholder="1d8" onChange={(e) => patch({ damage: e.target.value })} />
        </Field>
        <Field label="Damage type">
          <Select value={d.damageType} onChange={(e) => patch({ damageType: e.target.value })}>
            {DAMAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </Select>
        </Field>
      </Row>
      <div>
        <span className="text-xs font-medium text-muted">Properties</span>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {WEAPON_PROPS.map((p) => (
            <Checkbox key={p} label={titleCase(p)} checked={d.props.includes(p)} onChange={(v) => patch({ props: v ? [...d.props, p] : d.props.filter((x) => x !== p) })} />
          ))}
        </div>
      </div>
      {(ranged || d.props.includes("versatile")) && (
        <Row>
          {ranged && (
            <>
              <Field label="Range normal (ft)">
                <Input type="number" min={0} className="w-24" value={d.rangeNormal} onChange={(e) => patch({ rangeNormal: e.target.value })} />
              </Field>
              <Field label="Range long (ft)">
                <Input type="number" min={0} className="w-24" value={d.rangeLong} onChange={(e) => patch({ rangeLong: e.target.value })} />
              </Field>
            </>
          )}
          {d.props.includes("versatile") && (
            <Field label="Versatile die">
              <Input className="w-24" value={d.versatile} placeholder="1d10" onChange={(e) => patch({ versatile: e.target.value })} />
            </Field>
          )}
        </Row>
      )}
      <CommonItemFields d={d} patch={patch} />
    </>
  );
}

function ArmorFields({ d, patch }: FormProps) {
  return (
    <>
      <Row>
        <Field label="Type">
          <Select
            value={d.aType}
            onChange={(e) => {
              const t = e.target.value as Draft["aType"];
              patch({ aType: t, baseAc: ARMOR_PRESET[t].baseAc, dexCap: ARMOR_PRESET[t].dexCap as Draft["dexCap"], stealth: t === "heavy" ? d.stealth : false });
            }}
          >
            <option value="light">Light</option>
            <option value="medium">Medium</option>
            <option value="heavy">Heavy</option>
            <option value="shield">Shield</option>
          </Select>
        </Field>
        <Field label={d.aType === "shield" ? "AC bonus" : "Base AC"}>
          <Input type="number" className="w-20" value={d.baseAc} onChange={(e) => patch({ baseAc: e.target.value })} />
        </Field>
        {d.aType !== "shield" && (
          <Field label="Dex cap">
            <Select value={d.dexCap} onChange={(e) => patch({ dexCap: e.target.value as Draft["dexCap"] })}>
              <option value="unlimited">Unlimited</option>
              <option value="2">+2 max</option>
              <option value="0">None</option>
            </Select>
          </Field>
        )}
        <Field label="Strength requirement">
          <Input type="number" min={0} className="w-24" value={d.strReq} onChange={(e) => patch({ strReq: e.target.value })} />
        </Field>
        <div className="pb-1">
          <Checkbox label="Stealth disadvantage" checked={d.stealth} onChange={(v) => patch({ stealth: v })} />
        </div>
      </Row>
      <CommonItemFields d={d} patch={patch} />
    </>
  );
}

function ItemFields({ d, patch }: FormProps) {
  const magic = d.itemType !== "Gear" && d.itemType !== "Tool";
  return (
    <>
      <Row>
        <Field label="Type">
          <Select value={d.itemType} onChange={(e) => patch({ itemType: e.target.value })}>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        {magic && (
          <Field label="Magic type (text)">
            <Input className="w-56" value={d.magicType} placeholder={d.itemType} onChange={(e) => patch({ magicType: e.target.value })} />
          </Field>
        )}
      </Row>
      <CommonItemFields d={d} patch={patch} magicBonus={false} />
    </>
  );
}

function FeatFields({ d, patch }: FormProps) {
  return (
    <>
      <Row>
        <div className="min-w-[14rem] flex-1">
          <Field label="Prerequisite (text)">
            <Input value={d.prerequisite} placeholder="e.g. Proficiency with medium armor" onChange={(e) => patch({ prerequisite: e.target.value })} />
          </Field>
        </div>
        {d.kind === "feat" && (
          <>
            <Field label="Ability prerequisite">
              <Select value={d.prereqAbility} onChange={(e) => patch({ prereqAbility: e.target.value as Draft["prereqAbility"] })}>
                <option value="">None</option>
                {ABILITIES.map((a) => (
                  <option key={a} value={a}>
                    {ABILITY_NAMES[a]}
                  </option>
                ))}
              </Select>
            </Field>
            {d.prereqAbility && (
              <Field label="Min score">
                <Input type="number" min={1} max={30} className="w-20" value={d.prereqMin} onChange={(e) => patch({ prereqMin: e.target.value })} />
              </Field>
            )}
          </>
        )}
      </Row>
      <Row>
        <Field label="Grants a choice of">
          <Select value={d.choiceKind} onChange={(e) => patch({ choiceKind: e.target.value as ChoiceKind })}>
            <option value="none">Nothing</option>
            <option value="skill">Skill proficiency</option>
            <option value="tool">Tool proficiency</option>
            <option value="language">Language</option>
            <option value="ability">Ability score (+1)</option>
          </Select>
        </Field>
        {d.choiceKind !== "none" && (
          <Field label="How many">
            <Input type="number" min={1} max={6} className="w-20" value={d.choiceCount} onChange={(e) => patch({ choiceCount: e.target.value })} />
          </Field>
        )}
      </Row>
    </>
  );
}
