import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useContent } from "../api/content";
import { Markdown } from "../components/Markdown";
import { Badge, Button, Card, Checkbox, cx, Empty, Input, Select, SourceBadge, Tabs } from "../components/ui";
import type {
  BackgroundData,
  ClassData,
  ClassOptionData,
  ContentRow,
  FeatData,
  FeatureData,
  ItemData,
  SpeciesData,
  SpellData,
  SubclassData,
  SubspeciesData,
} from "../../shared/types/content";

type TabId = "classes" | "species" | "backgrounds" | "feats" | "spells" | "items" | "classOptions";
const TABS: { id: TabId; label: string }[] = [
  { id: "classes", label: "Classes" },
  { id: "species", label: "Species" },
  { id: "backgrounds", label: "Backgrounds" },
  { id: "feats", label: "Feats" },
  { id: "spells", label: "Spells" },
  { id: "items", label: "Items" },
  { id: "classOptions", label: "Class Options" },
];
const SOURCE_KINDS = [
  { id: "official", label: "Official" },
  { id: "ua", label: "UA" },
  { id: "homebrew", label: "Homebrew" },
  { id: "custom", label: "Custom" },
];
const MAX_ROWS = 300;

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function formatCost(cp?: number): string {
  if (cp == null) return "—";
  if (cp === 0) return "0 gp";
  if (cp % 100 === 0) return `${cp / 100} gp`;
  if (cp % 10 === 0) return `${cp / 10} sp`;
  return `${cp} cp`;
}

function spellLevelLabel(l: number) {
  return l === 0 ? "Cantrip" : `Level ${l}`;
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  const shown = items.filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function FeatureBlock({ f, showLevel }: { f: ContentRow<FeatureData>; showLevel?: boolean }) {
  return (
    <div className="border-t border-line py-2 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2 font-medium">
        {f.name}
        {showLevel && <Badge tone="accent">Level {f.data.level}</Badge>}
        {f.data.optional && <Badge>Optional</Badge>}
      </div>
      <Markdown text={f.description} />
    </div>
  );
}

function Features({ list, showLevel }: { list?: ContentRow<FeatureData>[]; showLevel?: boolean }) {
  if (!list?.length) return null;
  return (
    <div>
      {list.map((f) => (
        <FeatureBlock key={f.id} f={f} showLevel={showLevel} />
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </div>
  );
}

export default function CatalogPage() {
  const content = useContent();
  const { bundle, byId, featuresByOwner, subclassesByClass, subspeciesBySpecies } = content;
  const nav = useNavigate();

  const [tab, setTab] = useState<TabId>("classes");
  const [selected, setSelected] = useState<string | null>(null);
  const [subId, setSubId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kinds, setKinds] = useState<string[]>(["official", "ua", "homebrew", "custom"]);
  const [limit, setLimit] = useState(MAX_ROWS);
  // type-specific filters
  const [spLevel, setSpLevel] = useState("");
  const [spSchool, setSpSchool] = useState("");
  const [spClass, setSpClass] = useState("");
  const [spRitual, setSpRitual] = useState(false);
  const [spConc, setSpConc] = useState(false);
  const [itCat, setItCat] = useState("");
  const [itRarity, setItRarity] = useState("");
  const [optGroup, setOptGroup] = useState("");

  const rows = bundle[tab] as ContentRow<any>[];

  const facets = useMemo(() => {
    const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
    return {
      schools: uniq(bundle.spells.map((s) => s.data.school)),
      lists: uniq(bundle.spells.flatMap((s) => s.data.lists ?? [])),
      cats: uniq(bundle.items.map((i) => i.data.category)),
      rarities: uniq(bundle.items.map((i) => i.data.rarity)),
      groups: uniq(bundle.classOptions.map((o) => o.data.group)),
    };
  }, [bundle]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (r.stale) return false;
      const kind = r.origin === "custom" ? "custom" : r.sourceKind;
      if (!kinds.includes(kind)) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (tab === "spells") {
        const d = r.data as SpellData;
        if (spLevel !== "" && d.level !== Number(spLevel)) return false;
        if (spSchool && d.school !== spSchool) return false;
        if (spClass && !(d.lists ?? []).includes(spClass)) return false;
        if (spRitual && !d.ritual) return false;
        if (spConc && !d.concentration) return false;
      } else if (tab === "items") {
        const d = r.data as ItemData;
        if (itCat && d.category !== itCat) return false;
        if (itRarity && d.rarity !== itRarity) return false;
      } else if (tab === "classOptions") {
        if (optGroup && (r.data as ClassOptionData).group !== optGroup) return false;
      }
      return true;
    });
    return list.sort((a, b) => {
      if (tab === "spells") return (a.data.level - b.data.level) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [rows, search, kinds, tab, spLevel, spSchool, spClass, spRitual, spConc, itCat, itRarity, optGroup]);

  const current = selected ? (byId.get(selected) as ContentRow<any> | undefined) : undefined;
  const entry = current && rows.includes(current) ? current : undefined;

  function resetLimit() {
    setLimit(MAX_ROWS);
  }

  function rowSub(r: ContentRow<any>): string {
    switch (tab) {
      case "spells":
        return `${spellLevelLabel(r.data.level)} · ${cap(r.data.school)}`;
      case "items":
        return [cap(r.data.category ?? ""), r.data.rarity && r.data.rarity !== "common" ? cap(r.data.rarity) : ""].filter(Boolean).join(" · ");
      case "classOptions":
        return cap(String(r.data.group ?? "").replace(/-/g, " "));
      case "species":
        return r.data.variantLabel ?? "";
      case "classes":
        return `d${r.data.hitDie}`;
      default:
        return "";
    }
  }

  function renderDetail(r: ContentRow<any>) {
    const header = (
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{r.name}</h2>
        <SourceBadge source={r.source} origin={r.origin} />
        {r.stale && <Badge tone="danger">Stale</Badge>}
      </div>
    );
    const homebrewBtn =
      tab === "items" || tab === "feats" ? (
        <div>
          <Button size="sm" onClick={() => nav(`/homebrew?copy=${tab}:${r.id}`)}>
            Copy &amp; edit as homebrew
          </Button>
        </div>
      ) : null;
    let body: ReactNode = null;

    if (tab === "classes") {
      const d = r.data as ClassData;
      const subs = (subclassesByClass.get(r.id) ?? []) as ContentRow<SubclassData>[];
      const sub = subs.find((s) => s.id === subId);
      const cols: string[] = [];
      for (const t of d.table ?? []) for (const k of Object.keys(t.columns ?? {})) if (!cols.includes(k)) cols.push(k);
      body = (
        <>
          <Facts
            items={[
              ["Hit die", `d${d.hitDie}`],
              ["Saving throws", d.saves?.map((s) => s.toUpperCase()).join(", ")],
              ["Primary ability", d.primaryAbility],
              ["Armor", d.proficiencyText?.armor],
              ["Weapons", d.proficiencyText?.weapons],
              ["Tools", d.proficiencyText?.tools],
              ["Skills", d.proficiencyText?.skills],
              ["Spellcasting", d.spellcasting ? `${cap(d.spellcasting.type)} caster, ${d.spellcasting.ability.toUpperCase()}, ${d.spellcasting.mode}` : undefined],
              [cap(d.subclassLabel || "Subclass"), d.subclassLevel ? `at level ${d.subclassLevel}` : undefined],
              ["ASI levels", d.asiLevels?.join(", ")],
              ["Multiclassing", d.multiclassRequirement],
            ]}
          />
          {d.table?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="px-2 py-1">Level</th>
                    <th className="px-2 py-1">PB</th>
                    <th className="px-2 py-1">Features</th>
                    {cols.map((c) => (
                      <th key={c} className="px-2 py-1">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.table.map((t) => (
                    <tr key={t.level} className="border-b border-line last:border-0 odd:bg-panel2/40">
                      <td className="px-2 py-1">{t.level}</td>
                      <td className="px-2 py-1">+{t.pb}</td>
                      <td className="px-2 py-1">{t.features?.join(", ")}</td>
                      {cols.map((c) => (
                        <td key={c} className="px-2 py-1">
                          {t.columns?.[c] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {r.description && <Markdown text={r.description} />}
          <Section title="Class features">
            <Features list={featuresByOwner.get(r.id)} showLevel />
          </Section>
          {subs.length > 0 && (
            <Section title={`${cap(d.subclassLabel || "Subclasses")} (${subs.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {subs.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSubId(subId === s.id ? null : s.id)}
                    className={cx(
                      "cursor-pointer rounded-md border px-2 py-1 text-xs",
                      subId === s.id ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-panel2",
                    )}
                  >
                    {s.name} <span className="text-muted">{s.source}</span>
                  </button>
                ))}
              </div>
              {sub && (
                <div className="mt-2 rounded-md border border-line p-3">
                  <div className="flex items-center gap-2 font-semibold">
                    {sub.name} <SourceBadge source={sub.source} origin={sub.origin} />
                  </div>
                  {sub.description && <Markdown text={sub.description} />}
                  <Features list={featuresByOwner.get(sub.id)} showLevel />
                </div>
              )}
            </Section>
          )}
        </>
      );
    } else if (tab === "species") {
      const d = r.data as SpeciesData;
      const subs = (subspeciesBySpecies.get(r.id) ?? []) as ContentRow<SubspeciesData>[];
      const sp = d.speed ?? { walk: 30 };
      const speeds = [`${sp.walk} ft.`, ...(["fly", "swim", "climb", "burrow"] as const).filter((k) => sp[k]).map((k) => `${k} ${sp[k]} ft.`)];
      body = (
        <>
          <Facts
            items={[
              ["Size", d.size],
              ["Speed", speeds.join(", ")],
              ["Darkvision", d.darkvision ? `${d.darkvision} ft.` : undefined],
              ["Languages", d.languages?.join(", ")],
              ["Category", d.category],
              ["Version", d.variantLabel],
            ]}
          />
          {r.description && <Markdown text={r.description} />}
          <Section title="Traits">
            <Features list={featuresByOwner.get(r.id)} />
          </Section>
          {subs.length > 0 && (
            <Section title={`Subspecies (${subs.length})`}>
              {subs.map((s) => (
                <div key={s.id} className="mb-2 rounded-md border border-line p-3">
                  <div className="flex items-center gap-2 font-semibold">
                    {s.name} <SourceBadge source={s.source} origin={s.origin} />
                  </div>
                  <Facts
                    items={[
                      ["Speed", s.data.speedWalk ? `${s.data.speedWalk} ft.` : undefined],
                      ["Darkvision", s.data.darkvision ? `${s.data.darkvision} ft.` : undefined],
                    ]}
                  />
                  {s.description && <Markdown text={s.description} />}
                  <Features list={featuresByOwner.get(s.id)} />
                </div>
              ))}
            </Section>
          )}
        </>
      );
    } else if (tab === "backgrounds") {
      const d = r.data as BackgroundData;
      body = (
        <>
          <Facts
            items={[
              ["Skills", d.skills?.map((s) => cap(s.replace(/-/g, " "))).join(", ")],
              ["Tools", d.tools?.join(", ")],
              ["Languages", d.languagesText],
              ["Equipment", d.equipmentText],
              ["Feature", d.featureName],
            ]}
          />
          {r.description && <Markdown text={r.description} />}
          <Features list={featuresByOwner.get(r.id)} />
          {d.characteristics &&
            Object.entries(d.characteristics).map(([k, v]) => (
              <Section key={k} title={k}>
                <ul className="list-disc pl-5 text-sm">
                  {v.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </Section>
            ))}
        </>
      );
    } else if (tab === "feats") {
      const d = r.data as FeatData;
      body = (
        <>
          <Facts items={[["Prerequisite", d.prerequisite]]} />
          <Markdown text={r.description} />
          <Features list={featuresByOwner.get(r.id)} />
        </>
      );
    } else if (tab === "spells") {
      const d = r.data as SpellData;
      const comps = [d.components?.v && "V", d.components?.s && "S", d.components?.m && "M"].filter(Boolean).join(", ");
      body = (
        <>
          <Facts
            items={[
              ["Level / school", `${spellLevelLabel(d.level)} ${cap(d.school)}`],
              ["Casting time", d.castingTime],
              ["Range", d.range],
              ["Components", comps + (d.components?.material ? ` (${d.components.material})` : "")],
              ["Duration", d.duration],
              ["Tags", [d.ritual && "Ritual", d.concentration && "Concentration"].filter(Boolean).join(", ")],
              ["Classes", (d.lists ?? []).map((l) => byId.get(l)?.name ?? l).join(", ")],
            ]}
          />
          <Markdown text={r.description} />
          {d.higherLevels && (
            <p className="text-sm">
              <strong>At higher levels. </strong>
              {d.higherLevels}
            </p>
          )}
        </>
      );
    } else if (tab === "items") {
      const d = r.data as ItemData;
      const w = d.weapon;
      const a = d.armor;
      body = (
        <>
          <Facts
            items={[
              ["Category", [cap(d.category), d.subtype && d.subtype !== d.category ? d.subtype : ""].filter(Boolean).join(" · ")],
              ["Magic type", d.magicType],
              ["Rarity", d.rarity ? cap(d.rarity) : undefined],
              ["Attunement", d.attunement ? `Required${d.attunementText ? ` (${d.attunementText})` : ""}` : undefined],
              ["Cost", d.costCp != null ? formatCost(d.costCp) : undefined],
              ["Weight", d.weightLb != null ? `${d.weightLb} lb.` : undefined],
              [
                "Damage",
                w ? `${w.damage || "—"}${w.damageType ? ` ${w.damageType}` : ""}${w.versatile ? ` (versatile ${w.versatile})` : ""}` : undefined,
              ],
              ["Weapon", w ? `${cap(w.category)} ${w.range}` : undefined],
              ["Range", w?.rangeNormal ? `${w.rangeNormal}${w.rangeLong ? `/${w.rangeLong}` : ""} ft.` : undefined],
              ["Properties", w?.properties?.length ? w.properties.join(", ") : undefined],
              ["Magic bonus", w?.magicBonus ? `+${w.magicBonus}` : a?.magicBonus ? `+${a.magicBonus}` : undefined],
              [
                "Armor class",
                a
                  ? `${a.baseAc}${a.type === "shield" ? "" : a.dexCap === null ? " + Dex" : a.dexCap === 0 ? "" : ` + Dex (max ${a.dexCap})`}`
                  : undefined,
              ],
              ["Armor type", a ? cap(a.type) : undefined],
              ["Strength", a?.strReq ? `${a.strReq} required` : undefined],
              ["Stealth", a?.stealthDisadvantage ? "Disadvantage" : undefined],
              ["Contents", d.contents?.length ? d.contents.map((c) => byId.get(c)?.name ?? c).join(", ") : undefined],
            ]}
          />
          <Markdown text={r.description} />
        </>
      );
    } else {
      const d = r.data as ClassOptionData;
      body = (
        <>
          <Facts
            items={[
              ["Group", cap(String(d.group).replace(/-/g, " "))],
              ["Classes", d.classIds?.map((c) => byId.get(c)?.name ?? c).join(", ")],
              ["Level", d.levelReq ? `${d.levelReq}+` : undefined],
              ["Prerequisite", d.prerequisite],
            ]}
          />
          <Markdown text={r.description} />
        </>
      );
    }

    return (
      <div className="space-y-3">
        {header}
        {homebrewBtn}
        {body}
      </div>
    );
  }

  const noData = rows.length === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-4">
      <h1 className="text-xl font-semibold">Catalog</h1>
      <Tabs
        tabs={TABS}
        value={tab}
        onChange={(t) => {
          setTab(t);
          setSelected(null);
          setSubId(null);
          setSearch("");
          resetLimit();
        }}
      />
      <div className="grid gap-3 md:grid-cols-[minmax(260px,340px)_1fr]">
        <div className="space-y-2">
          <Input
            className="w-full"
            placeholder={`Search ${TABS.find((t) => t.id === tab)!.label.toLowerCase()}…`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetLimit();
            }}
          />
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {SOURCE_KINDS.map((k) => (
              <Checkbox
                key={k.id}
                label={k.label}
                checked={kinds.includes(k.id)}
                onChange={(v) => {
                  setKinds((cur) => (v ? [...cur, k.id] : cur.filter((x) => x !== k.id)));
                  resetLimit();
                }}
              />
            ))}
          </div>
          {tab === "spells" && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <Select
                  value={spLevel}
                  onChange={(e) => {
                    setSpLevel(e.target.value);
                    resetLimit();
                  }}
                >
                  <option value="">Any level</option>
                  {Array.from({ length: 10 }, (_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? "Cantrip" : `Level ${i}`}
                    </option>
                  ))}
                </Select>
                <Select
                  value={spSchool}
                  onChange={(e) => {
                    setSpSchool(e.target.value);
                    resetLimit();
                  }}
                >
                  <option value="">Any school</option>
                  {facets.schools.map((s) => (
                    <option key={s} value={s}>
                      {cap(s)}
                    </option>
                  ))}
                </Select>
                <Select
                  value={spClass}
                  onChange={(e) => {
                    setSpClass(e.target.value);
                    resetLimit();
                  }}
                >
                  <option value="">Any class</option>
                  {facets.lists.map((l) => (
                    <option key={l} value={l}>
                      {byId.get(l)?.name ?? l}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-4">
                <Checkbox
                  label="Ritual"
                  checked={spRitual}
                  onChange={(v) => {
                    setSpRitual(v);
                    resetLimit();
                  }}
                />
                <Checkbox
                  label="Concentration"
                  checked={spConc}
                  onChange={(v) => {
                    setSpConc(v);
                    resetLimit();
                  }}
                />
              </div>
            </div>
          )}
          {tab === "items" && (
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={itCat}
                onChange={(e) => {
                  setItCat(e.target.value);
                  resetLimit();
                }}
              >
                <option value="">Any category</option>
                {facets.cats.map((c) => (
                  <option key={c} value={c}>
                    {cap(c)}
                  </option>
                ))}
              </Select>
              <Select
                value={itRarity}
                onChange={(e) => {
                  setItRarity(e.target.value);
                  resetLimit();
                }}
              >
                <option value="">Any rarity</option>
                {facets.rarities.map((c) => (
                  <option key={c} value={c}>
                    {cap(c)}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {tab === "classOptions" && (
            <Select
              className="w-full"
              value={optGroup}
              onChange={(e) => {
                setOptGroup(e.target.value);
                resetLimit();
              }}
            >
              <option value="">Any group</option>
              {facets.groups.map((g) => (
                <option key={g} value={g}>
                  {cap(g.replace(/-/g, " "))}
                </option>
              ))}
            </Select>
          )}
          <div className="text-xs text-muted">
            {filtered.length} of {rows.length} {filtered.length === 1 ? "entry" : "entries"}
          </div>
          {noData ? (
            <Empty>No entries. Run import-data.bat to load game data.</Empty>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto rounded-md border border-line md:max-h-[calc(100vh-18rem)]">
              {filtered.slice(0, limit).map((r) => {
                const sub = rowSub(r);
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelected(r.id);
                      setSubId(null);
                    }}
                    className={cx(
                      "flex w-full cursor-pointer items-center justify-between gap-2 border-b border-line px-2 py-1.5 text-left text-sm last:border-0",
                      entry?.id === r.id ? "bg-accent-soft text-accent" : "hover:bg-panel2",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{r.name}</span>
                      {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
                    </span>
                    <SourceBadge source={r.source} origin={r.origin} />
                  </button>
                );
              })}
              {filtered.length === 0 && <div className="p-3 text-sm text-muted">Nothing matches the filters.</div>}
              {filtered.length > limit && (
                <div className="p-2 text-center">
                  <Button size="sm" onClick={() => setLimit((l) => l + MAX_ROWS)}>
                    Show more ({filtered.length - limit} remaining)
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        <Card className="min-w-0 self-start">{entry ? renderDetail(entry) : <Empty>Select an entry to see its details.</Empty>}</Card>
      </div>
    </div>
  );
}
