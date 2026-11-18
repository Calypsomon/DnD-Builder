import { useMemo, useState } from "react";
import { editableSpells, spellsOf } from "../../shared/engine/buildHelpers";
import { visible } from "../../shared/engine/contentIndex";
import type { ContentRow, SpellData } from "../../shared/types/content";
import type { SheetSpell, SheetSpellcasting } from "../../shared/types/sheet";
import { Markdown } from "../components/Markdown";
import { StatValue } from "../components/StatValue";
import { Badge, Button, Card, Checkbox, Empty, Input, Modal, Select, SourceBadge, cx } from "../components/ui";
import { useBuilder } from "./context";

const ORD = ["Cantrips", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

export default function SpellsTab() {
  const { sheet } = useBuilder();
  const casting = sheet.spellcasting;
  const [detail, setDetail] = useState<string | null>(null);
  const [browseClass, setBrowseClass] = useState<string | null>(null);
  const casters = casting?.classes ?? [];
  const active = casters.find((c) => c.classId === browseClass) ?? casters[0];
  const other = sheet.spells.filter((s) => s.origin !== "class");

  if (!casting && sheet.spells.length === 0)
    return <Empty>This character has no spellcasting yet. Spells granted by species, feats or subclasses appear here too.</Empty>;

  return (
    <div className="flex flex-col gap-3">
      {casting && (
        <Card title="Spell slots">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {casting.slots.map((n, i) =>
              i > 0 && n > 0 ? (
                <Badge key={i}>
                  {ORD[i]}: {n}
                </Badge>
              ) : null,
            )}
            {casting.pact && casting.pact.slots > 0 && (
              <Badge tone="accent">
                Pact magic: {casting.pact.slots} × level {casting.pact.level} (short rest)
              </Badge>
            )}
            {casting.multiclassCasterLevel != null && (
              <span className="text-muted">Multiclass caster level {casting.multiclassCasterLevel} — slots are shared, spells are learned per class.</span>
            )}
          </div>
        </Card>
      )}
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          {casters.map((sc) => (
            <ClassSpells key={sc.classId} sc={sc} onDetail={setDetail} />
          ))}
          {other.length > 0 && (
            <Card title="Always prepared & granted spells">
              <SpellRows spells={other} onDetail={setDetail} />
            </Card>
          )}
        </div>
        {active && (
          <div className="flex flex-col gap-2">
            {casters.length > 1 && (
              <div className="flex flex-wrap items-center gap-1 text-sm">
                <span className="text-muted">Add spells as:</span>
                {casters.map((c) => (
                  <Button key={c.classId} size="sm" variant={c.classId === active.classId ? "primary" : "secondary"} onClick={() => setBrowseClass(c.classId)}>
                    {c.className}
                  </Button>
                ))}
              </div>
            )}
            <SpellBrowser sc={active} onDetail={setDetail} />
          </div>
        )}
      </div>
      <SpellDetail id={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function ClassSpells({ sc, onDetail }: { sc: SheetSpellcasting; onDetail: (id: string) => void }) {
  const { character, sheet, update } = useBuilder();
  const own = spellsOf(character.build, sc.classId);
  const prepared = new Set(own.prepared);
  const list = sheet.spells.filter((s) => s.origin === "class" && s.classId === sc.classId);
  const remove = (id: string) =>
    update((c) => {
      const sp = editableSpells(c.build, sc.classId);
      sp.known = sp.known.filter((x) => x !== id);
      sp.prepared = sp.prepared.filter((x) => x !== id);
    });
  const togglePrepared = (id: string) =>
    update((c) => {
      const sp = editableSpells(c.build, sc.classId);
      sp.prepared = sp.prepared.includes(id) ? sp.prepared.filter((x) => x !== id) : [...sp.prepared, id];
    });
  const n = sc.counts;
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {sc.className} {sc.classLevel}
          <span className="text-xs font-normal text-muted">
            {sc.ability.toUpperCase()} · DC <StatValue stat={sc.dc} /> · attack <StatValue stat={sc.attack} signed /> · up to level {sc.maxSpellLevel}
            {sc.ritual ? " · rituals" : ""}
          </span>
        </span>
      }
    >
      <div className="mb-2 flex flex-wrap gap-3 text-xs">
        <span>
          Cantrips <b className={cx(n.cantrips > sc.cantripsMax && "text-danger")}>{n.cantrips}/{sc.cantripsMax}</b>
        </span>
        {sc.knownMax != null && (
          <span>
            Known <b className={cx(n.known > sc.knownMax && "text-danger")}>{n.known}/{sc.knownMax}</b>
          </span>
        )}
        {sc.preparedMax != null && (
          <span>
            Prepared <b className={cx(n.prepared > sc.preparedMax && "text-danger")}>{n.prepared}/{sc.preparedMax}</b>
          </span>
        )}
        {sc.spellbookMin != null && (
          <span>
            Spellbook <b>{n.known}</b> <span className="text-muted">(≥ {sc.spellbookMin} from levelling)</span>
          </span>
        )}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted">No spells yet — add them from the list.</p>
      ) : (
        <SpellRows
          spells={list}
          onDetail={onDetail}
          prepare={sc.mode !== "known" ? { isPrepared: (id) => prepared.has(id), toggle: togglePrepared } : undefined}
          onRemove={remove}
        />
      )}
      {sc.mode !== "known" && list.length > 0 && <p className="mt-1 text-[11px] text-muted">Tick the box to prepare a spell.</p>}
    </Card>
  );
}

function SpellRows({
  spells,
  onDetail,
  prepare,
  onRemove,
}: {
  spells: SheetSpell[];
  onDetail: (id: string) => void;
  prepare?: { isPrepared: (id: string) => boolean; toggle: (id: string) => void };
  onRemove?: (id: string) => void;
}) {
  const byLevel = new Map<number, SheetSpell[]>();
  for (const s of spells) byLevel.set(s.level, [...(byLevel.get(s.level) ?? []), s]);
  return (
    <div className="flex flex-col gap-1.5">
      {[...byLevel.entries()].map(([lvl, list]) => (
        <div key={lvl}>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">{ORD[lvl]}</h4>
          {list.map((s) => (
            <div key={s.id} className="flex items-center gap-2 border-b border-line py-0.5 text-sm last:border-0">
              {prepare && s.level > 0 ? (
                <input type="checkbox" title="Prepared" checked={prepare.isPrepared(s.id)} onChange={() => prepare.toggle(s.id)} className="accent-[var(--color-accent)]" />
              ) : (
                <span className="w-[13px]" />
              )}
              <button className="flex-1 cursor-pointer text-left hover:text-accent" onClick={() => onDetail(s.id)}>
                {s.name}
                {s.ritual && <span className="ml-1 text-[10px] text-muted">R</span>}
                {s.concentration && <span className="ml-1 text-[10px] text-muted">C</span>}
              </button>
              {s.origin === "always" && <Badge tone="accent">always prepared</Badge>}
              {s.origin === "granted" && <Badge title={s.sourceLabel}>{s.sourceLabel ?? "granted"}</Badge>}
              {onRemove && (
                <Button size="sm" variant="ghost" onClick={() => onRemove(s.id)}>
                  ×
                </Button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SpellBrowser({ sc, onDetail }: { sc: SheetSpellcasting; onDetail: (id: string) => void }) {
  const { character, sheet, update, idx } = useBuilder();
  const [q, setQ] = useState("");
  const [lvl, setLvl] = useState<string>("all");
  const [onlyRitual, setOnlyRitual] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const extra = new Set(sc.extraSpellIds);
  const all = useMemo(
    () =>
      (idx.bundle.spells as ContentRow<SpellData>[]).filter(
        (s) => visible(s, character.build) && (s.data.lists.some((l) => sc.lists.includes(l)) || extra.has(s.id)) && (showAll || s.data.level <= sc.maxSpellLevel),
      ),
    [idx, character.build, sc.lists.join(), sc.maxSpellLevel, showAll, sc.extraSpellIds.join()], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const list = all
    .filter((s) => (lvl === "all" || s.data.level === Number(lvl)) && (!onlyRitual || s.data.ritual) && (!q || s.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.data.level - b.data.level || a.name.localeCompare(b.name));
  const have = new Set(sheet.spells.map((s) => s.id));

  const add = (s: ContentRow<SpellData>) =>
    update((c) => {
      const sp = editableSpells(c.build, sc.classId);
      if (s.data.level === 0 || sc.mode !== "prepared") {
        if (!sp.known.includes(s.id)) sp.known.push(s.id);
      } else if (!sp.prepared.includes(s.id)) sp.prepared.push(s.id);
    });
  const label = (s: ContentRow<SpellData>) => (s.data.level === 0 ? "Learn" : sc.mode === "prepared" ? "Prepare" : sc.mode === "spellbook" ? "To spellbook" : "Learn");

  return (
    <Card title={`Add ${sc.className} spells`}>
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
        <Checkbox label="Higher levels" checked={showAll} onChange={setShowAll} />
      </div>
      <div className="max-h-[65vh] overflow-y-auto">
        {list.map((s) => (
          <div key={s.id} className="flex items-center gap-2 border-b border-line py-0.5 text-sm last:border-0">
            <span className="w-6 text-xs text-muted">{s.data.level === 0 ? "C" : s.data.level}</span>
            <button className="flex-1 cursor-pointer text-left hover:text-accent" onClick={() => onDetail(s.id)}>
              {s.name}
              <span className="ml-2 text-xs capitalize text-muted">{s.data.school}</span>
              {extra.has(s.id) && <span className="ml-1 text-[10px] text-accent">expanded</span>}
            </button>
            <SourceBadge source={s.source} origin={s.origin} />
            <Button size="sm" disabled={have.has(s.id)} onClick={() => add(s)}>
              {have.has(s.id) ? "✓" : label(s)}
            </Button>
          </div>
        ))}
        {list.length === 0 && <p className="p-2 text-sm text-muted">No spells match.</p>}
      </div>
    </Card>
  );
}

function SpellDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { idx } = useBuilder();
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
