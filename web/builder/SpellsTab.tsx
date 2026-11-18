import { useMemo, useState } from "react";
import { visible } from "../../shared/engine/contentIndex";
import type { ContentRow, SpellData } from "../../shared/types/content";
import type { SheetSpell } from "../../shared/types/sheet";
import { Markdown } from "../components/Markdown";
import { StatValue } from "../components/StatValue";
import { Badge, Button, Card, Checkbox, Empty, Input, Modal, Select, SourceBadge, cx } from "../components/ui";
import { useBuilder } from "./context";

const ORD = ["Cantrips", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

export default function SpellsTab() {
  const { character, sheet, update, idx } = useBuilder();
  const sc = sheet.spellcasting;
  const [detail, setDetail] = useState<string | null>(null);
  const b = character.build;

  if (!sc && sheet.spells.length === 0)
    return <Empty>This character has no spellcasting{b.classId ? " (yet)" : ""}. Spells granted by species, feats or subclasses appear here too.</Empty>;

  const known = new Set(b.spells.known);
  const prepared = new Set(b.spells.prepared);
  const byLevel = new Map<number, SheetSpell[]>();
  for (const s of sheet.spells) byLevel.set(s.level, [...(byLevel.get(s.level) ?? []), s]);

  const remove = (id: string) =>
    update((c) => {
      c.build.spells.known = c.build.spells.known.filter((x) => x !== id);
      c.build.spells.prepared = c.build.spells.prepared.filter((x) => x !== id);
    });
  const togglePrepared = (id: string) =>
    update((c) => {
      const p = new Set(c.build.spells.prepared);
      if (p.has(id)) p.delete(id);
      else p.add(id);
      c.build.spells.prepared = [...p];
    });

  return (
    <div className="flex flex-col gap-3">
      {sc && (
        <Card title={`Spellcasting (${sc.ability.toUpperCase()})`}>
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              Spell save DC <b className="text-lg"><StatValue stat={sc.dc} /></b>
            </div>
            <div>
              Spell attack <b className="text-lg"><StatValue stat={sc.attack} signed /></b>
            </div>
            <div>
              Cantrips{" "}
              <b className={cx(sc.counts.cantrips > sc.cantripsMax && "text-danger")}>
                {sc.counts.cantrips}/{sc.cantripsMax}
              </b>
            </div>
            {sc.knownMax != null && (
              <div>
                Spells known{" "}
                <b className={cx(sc.counts.known > sc.knownMax && "text-danger")}>
                  {sc.counts.known}/{sc.knownMax}
                </b>
              </div>
            )}
            {sc.preparedMax != null && (
              <div>
                Prepared{" "}
                <b className={cx(sc.counts.prepared > sc.preparedMax && "text-danger")}>
                  {sc.counts.prepared}/{sc.preparedMax}
                </b>
              </div>
            )}
            {sc.spellbookMin != null && (
              <div>
                Spellbook <b>{sc.counts.known}</b> <span className="text-muted">(at least {sc.spellbookMin} from levelling)</span>
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {sc.slots.map((n, i) =>
              i > 0 && n > 0 ? (
                <Badge key={i}>
                  {ORD[i]}: {n} slots
                </Badge>
              ) : null,
            )}
            {sc.pact && sc.pact.slots > 0 && (
              <Badge tone="accent">
                Pact magic: {sc.pact.slots} × level {sc.pact.level}
              </Badge>
            )}
            {sc.ritual && <Badge>Ritual casting</Badge>}
          </div>
        </Card>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Your spells">
          {sheet.spells.length === 0 && <p className="text-sm text-muted">No spells yet. Add some from the list.</p>}
          {[...byLevel.entries()].map(([lvl, list]) => (
            <div key={lvl} className="mb-3">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{ORD[lvl]}</h4>
              {list.map((s) => (
                <div key={s.id} className="flex items-center gap-2 border-b border-line py-1 text-sm last:border-0">
                  {s.origin === "class" && sc && sc.mode !== "known" && s.level > 0 ? (
                    <input type="checkbox" title="Prepared" checked={prepared.has(s.id)} onChange={() => togglePrepared(s.id)} className="accent-[var(--color-accent)]" />
                  ) : (
                    <span className="w-[13px]" />
                  )}
                  <button className="flex-1 cursor-pointer text-left hover:text-accent" onClick={() => setDetail(s.id)}>
                    {s.name}
                    {s.ritual && <span className="ml-1 text-[10px] text-muted">R</span>}
                    {s.concentration && <span className="ml-1 text-[10px] text-muted">C</span>}
                  </button>
                  {s.origin === "always" && <Badge tone="accent">always prepared</Badge>}
                  {s.origin === "granted" && <Badge title={s.sourceLabel}>{s.sourceLabel ?? "granted"}</Badge>}
                  {s.origin === "class" && (
                    <Button size="sm" variant="ghost" onClick={() => remove(s.id)}>
                      ×
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ))}
          {sc && sc.mode !== "known" && <p className="text-xs text-muted">Tick the box to prepare a spell.</p>}
        </Card>
        {sc && <SpellBrowser known={known} prepared={prepared} onDetail={setDetail} />}
      </div>
      <SpellDetail id={detail} onClose={() => setDetail(null)} idx={idx} />
    </div>
  );
}

function SpellBrowser({ known, prepared, onDetail }: { known: Set<string>; prepared: Set<string>; onDetail: (id: string) => void }) {
  const { character, sheet, update, idx } = useBuilder();
  const sc = sheet.spellcasting!;
  const [q, setQ] = useState("");
  const [lvl, setLvl] = useState<string>("all");
  const [onlyRitual, setOnlyRitual] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const extra = new Set(sc.extraSpellIds);
  const all = useMemo(
    () =>
      (idx.bundle.spells as ContentRow<SpellData>[]).filter(
        (s) =>
          visible(s, character.build) &&
          (s.data.lists.some((l) => sc.lists.includes(l)) || extra.has(s.id)) &&
          (showAll || s.data.level <= sc.maxSpellLevel),
      ),
    [idx, character.build, sc.lists.join(), sc.maxSpellLevel, showAll, sc.extraSpellIds.join()], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const list = all
    .filter((s) => (lvl === "all" || s.data.level === Number(lvl)) && (!onlyRitual || s.data.ritual) && (!q || s.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.data.level - b.data.level || a.name.localeCompare(b.name));

  const add = (s: ContentRow<SpellData>) =>
    update((c) => {
      const isCantrip = s.data.level === 0;
      if (isCantrip || sc.mode !== "prepared") {
        if (!c.build.spells.known.includes(s.id)) c.build.spells.known.push(s.id);
      } else if (!c.build.spells.prepared.includes(s.id)) c.build.spells.prepared.push(s.id);
    });
  const label = (s: ContentRow<SpellData>) => (s.data.level === 0 ? "Learn" : sc.mode === "prepared" ? "Prepare" : sc.mode === "spellbook" ? "Add to spellbook" : "Learn");

  return (
    <Card title="Add spells">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={lvl} onChange={(e) => setLvl(e.target.value)}>
          <option value="all">All levels</option>
          {ORD.map((o, i) => (
            <option key={i} value={i}>
              {o}
            </option>
          ))}
        </Select>
        <Checkbox label="Rituals" checked={onlyRitual} onChange={setOnlyRitual} />
        <Checkbox label="Show higher levels" checked={showAll} onChange={setShowAll} />
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {list.map((s) => {
          const have = known.has(s.id) || prepared.has(s.id) || sheet.spells.some((x) => x.id === s.id);
          return (
            <div key={s.id} className="flex items-center gap-2 border-b border-line py-1 text-sm last:border-0">
              <span className="w-8 text-xs text-muted">{s.data.level === 0 ? "C" : s.data.level}</span>
              <button className="flex-1 cursor-pointer text-left hover:text-accent" onClick={() => onDetail(s.id)}>
                {s.name}
                <span className="ml-2 text-xs capitalize text-muted">{s.data.school}</span>
                {extra.has(s.id) && <span className="ml-1 text-[10px] text-accent">expanded</span>}
              </button>
              <SourceBadge source={s.source} origin={s.origin} />
              <Button size="sm" disabled={have} onClick={() => add(s)}>
                {have ? "✓" : label(s)}
              </Button>
            </div>
          );
        })}
        {list.length === 0 && <p className="p-2 text-sm text-muted">No spells match.</p>}
      </div>
    </Card>
  );
}

function SpellDetail({ id, onClose, idx }: { id: string | null; onClose: () => void; idx: ReturnType<typeof useBuilder>["idx"] }) {
  const s = id ? (idx.byId.get(id) as ContentRow<SpellData> | undefined) : undefined;
  return (
    <Modal open={!!s} onClose={onClose} title={s?.name ?? ""}>
      {s && (
        <div className="flex flex-col gap-2">
          <p className="text-sm italic text-muted">
            {s.data.level === 0 ? `${s.data.school} cantrip` : `Level ${s.data.level} ${s.data.school}`}
            {s.data.ritual ? " (ritual)" : ""} <SourceBadge source={s.source} origin={s.origin} />
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
            <dt className="text-muted">Casting time</dt>
            <dd>{s.data.castingTime}</dd>
            <dt className="text-muted">Range</dt>
            <dd>{s.data.range}</dd>
            <dt className="text-muted">Components</dt>
            <dd>
              {[s.data.components.v && "V", s.data.components.s && "S", s.data.components.m && "M"].filter(Boolean).join(", ")}
              {s.data.components.material ? ` (${s.data.components.material})` : ""}
            </dd>
            <dt className="text-muted">Duration</dt>
            <dd>{s.data.duration}</dd>
          </dl>
          <Markdown text={s.description} />
          {s.data.higherLevels && !s.description.includes(s.data.higherLevels.slice(0, 30)) && (
            <p className="text-sm">
              <b>At Higher Levels.</b> {s.data.higherLevels}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
