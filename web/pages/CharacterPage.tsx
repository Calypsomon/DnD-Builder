import { useEffect, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { computeSheet } from "../../shared/engine/computeSheet";
import { useContent } from "../api/content";
import AbilitiesTab from "../builder/AbilitiesTab";
import ClassTab from "../builder/ClassTab";
import InventoryTab from "../builder/InventoryTab";
import OriginTab from "../builder/OriginTab";
import OverviewTab from "../builder/OverviewTab";
import SheetTab from "../builder/SheetTab";
import SpellsTab from "../builder/SpellsTab";
import { BuilderContext } from "../builder/context";
import { StatValue } from "../components/StatValue";
import { Badge, Tabs, cx } from "../components/ui";
import { useCharacterStore } from "../state/characterStore";

const TABS = ["overview", "abilities", "origin", "class", "spells", "inventory", "sheet"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = {
  overview: "Overview",
  abilities: "Abilities",
  origin: "Origin",
  class: "Class",
  spells: "Spells",
  inventory: "Inventory",
  sheet: "Sheet",
};

export default function CharacterPage() {
  const { id, "*": rest } = useParams();
  const navigate = useNavigate();
  const idx = useContent();
  const { character, loading, error, status, load, update, setSummary } = useCharacterStore();
  const tab: Tab = (TABS as readonly string[]).includes(rest ?? "") ? (rest as Tab) : "overview";

  useEffect(() => {
    if (id && character?.id !== id) void load(id);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sheet = useMemo(() => (character ? computeSheet(character, idx) : null), [character, idx]);
  useEffect(() => {
    if (sheet) setSummary(sheet.summary);
  }, [sheet, setSummary]);

  if (error && !character) return <div className="text-danger">Error: {error}</div>;
  if (loading || !character || !sheet || character.id !== id) return <div className="text-muted">Loading character…</div>;

  const openByTab: Partial<Record<Tab, number>> = {};
  for (const c of sheet.openChoices) {
    const t: Tab = c.location === "class" ? "class" : "origin";
    openByTab[t] = (openByTab[t] ?? 0) + 1;
  }
  if (!character.build.speciesId || !character.build.backgroundId) openByTab.origin = (openByTab.origin ?? 0) + 1;
  if (!character.build.classId) openByTab.class = (openByTab.class ?? 0) + 1;

  return (
    <BuilderContext.Provider value={{ character, sheet, update, idx }}>
      <div className="flex flex-col gap-3 lg:flex-row">
        <aside className="lg:sticky lg:top-12 lg:w-52 lg:shrink-0 lg:self-start">
          <div className="rounded-lg border border-line bg-panel p-3">
            <Link to="/characters" className="text-xs text-muted hover:text-fg">
              ← All characters
            </Link>
            <h1 className="mt-1 font-serif text-xl font-bold">{character.build.name}</h1>
            <p className="text-sm text-muted">{sheet.summary}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Mini label="AC">
                <StatValue stat={sheet.ac} />
              </Mini>
              <Mini label="HP">
                <StatValue stat={sheet.hpMax} />
              </Mini>
              <Mini label="PB">+{sheet.pb}</Mini>
              <Mini label="Init">
                <StatValue stat={sheet.initiative} signed />
              </Mini>
              <Mini label="Speed">{sheet.speed.walk.total}</Mini>
              <Mini label="Level">{sheet.classLevel || "–"}</Mini>
            </div>
            {sheet.openChoices.length > 0 && (
              <p className="mt-3 text-xs text-danger">
                ● {sheet.openChoices.length} open choice{sheet.openChoices.length > 1 ? "s" : ""}
              </p>
            )}
            {sheet.warnings.length > 0 && <p className="mt-1 text-xs text-warn">⚠ {sheet.warnings.length} warning{sheet.warnings.length > 1 ? "s" : ""}</p>}
            <p className={cx("mt-3 text-xs", status === "error" ? "text-danger" : "text-muted")}>
              {status === "saving" ? "Saving…" : status === "saved" ? "All changes saved" : status === "error" ? `Save failed: ${error}` : ""}
            </p>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <Tabs
            tabs={TABS.map((t) => ({
              id: t,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {LABELS[t]}
                  {openByTab[t] ? <Badge tone="danger">{openByTab[t]}</Badge> : null}
                </span>
              ),
            }))}
            value={tab}
            onChange={(t) => navigate(`/characters/${id}/${t === "overview" ? "" : t}`)}
          />
          <div className="pt-3">
            {tab === "overview" && <OverviewTab goTo={(t) => navigate(`/characters/${id}/${t}`)} />}
            {tab === "abilities" && <AbilitiesTab />}
            {tab === "origin" && <OriginTab />}
            {tab === "class" && <ClassTab />}
            {tab === "spells" && <SpellsTab />}
            {tab === "inventory" && <InventoryTab />}
            {tab === "sheet" && <SheetTab />}
          </div>
        </div>
      </div>
    </BuilderContext.Provider>
  );
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-panel2 px-1 py-1">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="text-base font-semibold tabular-nums">{children}</div>
    </div>
  );
}
