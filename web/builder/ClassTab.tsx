import { useState } from "react";
import { visible } from "../../shared/engine/contentIndex";
import type { AsiChoice } from "../../shared/types/character";
import type { ClassData, ContentRow, FeatureData } from "../../shared/types/content";
import { ABILITIES, type Ability } from "../../shared/types/effects";
import type { ChoiceInstance } from "../../shared/types/sheet";
import { OptionModal } from "../components/ChoicePicker";
import { Markdown } from "../components/Markdown";
import { Badge, Button, Card, Input, Select, SourceBadge, confirmDialog, cx } from "../components/ui";
import { ABILITY_LABEL } from "./AbilitiesTab";
import { useBuilder } from "./context";
import { ChoiceList, FeatureItem } from "./shared";

export default function ClassTab() {
  const { character, update, idx } = useBuilder();
  const b = character.build;
  const cls = b.classId ? (idx.byId.get(b.classId) as ContentRow<ClassData> | undefined) : undefined;

  if (!cls) return <ClassPicker />;
  const level = b.levels.length;

  return (
    <div className="grid items-start gap-3 xl:grid-cols-2">
      <Card
        className="xl:col-span-2"
        title={
          <span className="flex items-center gap-2">
            <span className="font-serif text-lg">{cls.name}</span>
            <SourceBadge source={cls.source} origin={cls.origin} />
            <span className="text-sm font-normal text-muted">d{cls.data.hitDie} · Saves {cls.data.saves.map((s) => s.toUpperCase()).join(", ")}</span>
          </span>
        }
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirmDialog("Change class? All class levels and class choices will be removed."))
                  update((c) => {
                    c.build.classId = null;
                    c.build.subclassId = null;
                    c.build.levels = [];
                  });
              }}
            >
              Change class
            </Button>
            <Button size="sm" disabled={level <= 1} onClick={() => update((c) => void c.build.levels.pop())}>
              Level down
            </Button>
            <span className="px-2 text-sm font-semibold">Level {level}</span>
            <Button size="sm" variant="primary" disabled={level >= 20} onClick={() => update((c) => void c.build.levels.push({ classId: cls.id, hp: "avg" }))}>
              Level up
            </Button>
          </>
        }
      >
        <details>
          <summary className="cursor-pointer text-sm text-muted">Class table, proficiencies and starting equipment</summary>
          <ClassDetails cls={cls} />
        </details>
      </Card>
      {Array.from({ length: level }, (_, i) => (
        <LevelCard key={i} level={i + 1} cls={cls} />
      ))}
    </div>
  );
}

function ClassPicker() {
  const { character, update, idx } = useBuilder();
  const rows = (idx.bundle.classes as ContentRow<ClassData>[]).filter((r) => visible(r, character.build));
  if (!rows.length) return <p className="text-muted">No classes in the database. Run import-data.bat first.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((c) => (
        <button
          key={c.id}
          onClick={() =>
            update((ch) => {
              ch.build.classId = c.id;
              ch.build.subclassId = null;
              ch.build.levels = [{ classId: c.id, hp: "max" }];
            })
          }
          className="cursor-pointer rounded-lg border border-line bg-panel p-3 text-left hover:border-accent"
        >
          <div className="flex items-center justify-between">
            <span className="font-serif text-lg font-semibold">{c.name}</span>
            <SourceBadge source={c.source} origin={c.origin} />
          </div>
          <p className="text-sm text-muted">
            Hit die d{c.data.hitDie} · Saves {c.data.saves.map((s) => s.toUpperCase()).join(", ")}
            {c.data.spellcasting ? ` · ${c.data.spellcasting.ability.toUpperCase()} caster` : ""}
          </p>
          <p className="mt-1 line-clamp-3 text-xs text-muted">{c.description.replace(/[*#]/g, "").slice(0, 220)}</p>
        </button>
      ))}
    </div>
  );
}

function ClassDetails({ cls }: { cls: ContentRow<ClassData> }) {
  const d = cls.data;
  const cols = d.table.length ? Object.keys(d.table[0].columns) : [];
  return (
    <div className="mt-2 flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">Armor</dt>
        <dd>{d.proficiencyText?.armor || "—"}</dd>
        <dt className="text-muted">Weapons</dt>
        <dd>{d.proficiencyText?.weapons || "—"}</dd>
        <dt className="text-muted">Tools</dt>
        <dd>{d.proficiencyText?.tools || "—"}</dd>
        <dt className="text-muted">Skills</dt>
        <dd>{d.proficiencyText?.skills || "—"}</dd>
        <dt className="text-muted">Multiclass</dt>
        <dd>{d.multiclassRequirement || "—"}</dd>
      </dl>
      {d.startingEquipment?.text && <Markdown text={d.startingEquipment.text} />}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="p-1">Lvl</th>
              <th className="p-1">PB</th>
              <th className="p-1">Features</th>
              {cols.map((c) => (
                <th key={c} className="p-1">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.table.map((r) => (
              <tr key={r.level} className="border-t border-line">
                <td className="p-1">{r.level}</td>
                <td className="p-1">+{r.pb}</td>
                <td className="p-1">{r.features.join(", ")}</td>
                {cols.map((c) => (
                  <td key={c} className="p-1">
                    {r.columns[c] || "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LevelCard({ level, cls }: { level: number; cls: ContentRow<ClassData> }) {
  const { character, sheet, update, idx } = useBuilder();
  const b = character.build;
  const entry = b.levels[level - 1];
  const sub = b.subclassId ? idx.byId.get(b.subclassId) : undefined;
  const features = [
    ...((idx.featuresByOwner.get(cls.id) ?? []) as ContentRow<FeatureData>[]).filter((f) => f.data.level === level),
    ...(sub ? ((idx.featuresByOwner.get(sub.id) ?? []) as ContentRow<FeatureData>[]).filter((f) => f.data.level === level) : []),
  ];
  const here = sheet.choices.filter((c) => c.location === "class" && c.level === level);
  const asi = here.find((c) => c.isAsi);
  const subclassChoice = here.find((c) => c.choice.from.kind === "subclass");
  const others = here.filter((c) => c !== asi && c !== subclassChoice);
  const open = here.some((c) => c.open);

  return (
    <Card
      highlight={open}
      title={
        <span className="flex items-center gap-2">
          Level {level}
          {open && <Badge tone="danger">choice needed</Badge>}
        </span>
      }
      actions={<HpControl level={level} hitDie={cls.data.hitDie} value={entry.hp} onChange={(hp) => update((c) => void (c.build.levels[level - 1].hp = hp))} />}
    >
      <div className="flex flex-col gap-2">
        {subclassChoice && <SubclassPicker instance={subclassChoice} />}
        {asi && <AsiPicker instance={asi} />}
        <ChoiceList items={others} />
        {features.length > 0 && (
          <div>
            {features.map((f) => (
              <FeatureItem
                key={f.id}
                row={f}
                extra={
                  f.data.optional && !b.options.optionalFeatures ? (
                    <span className="text-[11px] text-muted">Optional class feature (Tasha's) — not active. Enable it in Overview → Options.</span>
                  ) : f.data.ownerType === "subclass" ? (
                    <span className="text-[11px] text-muted">{sub?.name}</span>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
        {!features.length && !here.length && <p className="text-sm text-muted">No new features at this level.</p>}
      </div>
    </Card>
  );
}

function HpControl({ level, hitDie, value, onChange }: { level: number; hitDie: number; value: "max" | "avg" | number; onChange: (v: "max" | "avg" | number) => void }) {
  if (level === 1) return <span className="text-xs text-muted">HP: {hitDie} (max) + CON</span>;
  const mode = value === "avg" ? "avg" : value === "max" ? "max" : "rolled";
  return (
    <span className="flex items-center gap-1 text-xs text-muted">
      HP:
      <Select
        value={mode}
        onChange={(e) => onChange(e.target.value === "avg" ? "avg" : e.target.value === "max" ? "max" : Math.ceil(hitDie / 2))}
        className="py-0.5 text-xs"
      >
        <option value="avg">Average ({hitDie / 2 + 1})</option>
        <option value="rolled">Rolled</option>
        <option value="max">Maximum ({hitDie})</option>
      </Select>
      {mode === "rolled" && (
        <Input type="number" min={1} max={hitDie} value={value as number} className="w-14 py-0.5 text-xs" onChange={(e) => onChange(Math.max(1, Math.min(hitDie, Number(e.target.value) || 1)))} />
      )}
      <span>+ CON</span>
    </span>
  );
}

function SubclassPicker({ instance }: { instance: ChoiceInstance }) {
  const { character, update, idx } = useBuilder();
  const [open, setOpen] = useState(false);
  const rows = (idx.subclassesByClass.get(character.build.classId!) ?? []).filter((r) => visible(r, character.build));
  const current = character.build.subclassId ? idx.byId.get(character.build.subclassId) : undefined;
  return (
    <div className={cx("rounded-md border p-2", instance.open ? "border-danger/60" : "border-line")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{instance.choice.label}</span>
        {current ? (
          <>
            <span className="font-semibold">{current.name}</span>
            <SourceBadge source={current.source} origin={current.origin} />
          </>
        ) : (
          <span className="text-sm text-danger">not chosen</span>
        )}
        <Button size="sm" variant={current ? "ghost" : "primary"} onClick={() => setOpen(true)}>
          {current ? "Change" : "Choose…"}
        </Button>
      </div>
      {current?.description && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-muted">Description</summary>
          <Markdown text={current.description} />
        </details>
      )}
      <OptionModal
        open={open}
        onClose={() => setOpen(false)}
        title={instance.choice.label}
        count={1}
        selected={current ? [current.id] : []}
        options={rows.map((r) => ({ id: r.id, name: r.name, description: r.description, source: r.origin === "custom" ? "Custom" : r.source }))}
        onToggle={(id) => {
          update((c) => void (c.build.subclassId = c.build.subclassId === id ? null : id));
          setOpen(false);
        }}
      />
    </div>
  );
}

function AsiPicker({ instance }: { instance: ChoiceInstance }) {
  const { character, update, idx } = useBuilder();
  const [open, setOpen] = useState(false);
  const asi = instance.asi;
  const set = (v: AsiChoice | undefined) =>
    update((c) => {
      if (v) c.build.choices[instance.key] = v;
      else delete c.build.choices[instance.key];
    });
  const mode = asi?.kind ?? "asi";
  const incs = asi?.kind === "asi" ? asi.increases : {};
  // represent as two "+1" picks (same ability twice = +2)
  const picks: (Ability | "")[] = [];
  for (const a of ABILITIES) for (let i = 0; i < (incs[a] ?? 0); i++) picks.push(a);
  while (picks.length < 2) picks.push("");
  const setPick = (i: number, a: Ability | "") => {
    const p = [...picks];
    p[i] = a;
    const out: Partial<Record<Ability, number>> = {};
    for (const x of p) if (x) out[x] = (out[x] ?? 0) + 1;
    set({ kind: "asi", increases: out });
  };
  const feat = asi?.kind === "feat" ? idx.byId.get(asi.featId) : undefined;
  const feats = idx.bundle.feats.filter((r) => visible(r, character.build));

  return (
    <div className={cx("rounded-md border p-2", instance.open ? "border-danger/60" : "border-line")}>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">Ability Score Improvement</span>
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === "asi"} onChange={() => set({ kind: "asi", increases: {} })} /> +2 / +1 +1
        </label>
        {character.build.options.featsAllowed && (
          <label className="flex items-center gap-1">
            <input type="radio" checked={mode === "feat"} onChange={() => set({ kind: "feat", featId: "" })} /> Feat
          </label>
        )}
      </div>
      {mode === "asi" ? (
        <div className="flex flex-wrap gap-2">
          {[0, 1].map((i) => (
            <Select key={i} value={picks[i]} onChange={(e) => setPick(i, e.target.value as Ability | "")}>
              <option value="">+1 to …</option>
              {ABILITIES.map((a) => (
                <option key={a} value={a}>
                  +1 {ABILITY_LABEL[a]}
                </option>
              ))}
            </Select>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {feat ? <span className="font-semibold">{feat.name}</span> : <span className="text-sm text-danger">No feat chosen</span>}
            <Button size="sm" variant={feat ? "ghost" : "primary"} onClick={() => setOpen(true)}>
              {feat ? "Change" : "Choose feat…"}
            </Button>
          </div>
          {feat && (
            <details>
              <summary className="cursor-pointer text-xs text-muted">Description</summary>
              <Markdown text={feat.description} />
            </details>
          )}
          <OptionModal
            open={open}
            onClose={() => setOpen(false)}
            title="Choose a feat"
            count={1}
            selected={feat ? [feat.id] : []}
            options={feats.map((r) => ({ id: r.id, name: r.name, description: r.description, source: r.origin === "custom" ? "Custom" : r.source, detail: r.data.prerequisite }))}
            onToggle={(id) => {
              set({ kind: "feat", featId: id });
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export { ChoiceList };
