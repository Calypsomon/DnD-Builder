import { useState } from "react";
import { classOrder, levelMap, setSubclass, subclassOf } from "../../shared/engine/buildHelpers";
import { visible } from "../../shared/engine/contentIndex";
import { meetsPrereq, prereqText } from "../../shared/rules/multiclass";
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
  const { character, sheet, update, idx } = useBuilder();
  const b = character.build;
  const map = levelMap(b);
  const [next, setNext] = useState<string>("");

  if (!b.levels.length) return <ClassPicker />;
  const level = b.levels.length;
  const taken = classOrder(b);
  const nextClass = next || b.levels[level - 1].classId;
  const allClasses = (idx.bundle.classes as ContentRow<ClassData>[]).filter((r) => visible(r, b) || taken.includes(r.id));
  const scores = Object.fromEntries(ABILITIES.map((a) => [a, sheet.abilities[a].score.total])) as Record<Ability, number>;
  const multiclassBlocked = (cid: string) => !taken.includes(cid) && !(meetsPrereq(cid, scores) && taken.every((t) => meetsPrereq(t, scores)));

  return (
    <div className="grid items-start gap-3 xl:grid-cols-2">
      <Card
        className="xl:col-span-2"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {sheet.classes.map((c) => (
              <span key={c.classId} className="flex items-center gap-1">
                <span className="font-serif text-base">
                  {c.name} {c.level}
                </span>
                {c.subclassName && <span className="text-xs font-normal text-muted">({c.subclassName})</span>}
              </span>
            ))}
            <span className="text-xs font-normal text-muted">
              · Level {level} · Saves {sheet.proficiencies.saves.map((s) => s.toUpperCase()).join(", ")}
            </span>
          </span>
        }
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirmDialog("Remove all class levels? Your class choices are kept in case you pick the same class again."))
                  update((c) => {
                    c.build.classId = null;
                    c.build.subclassId = null;
                    c.build.levels = [];
                  });
              }}
            >
              Reset classes
            </Button>
            <Button size="sm" disabled={level <= 1} onClick={() => update((c) => void c.build.levels.pop())}>
              Level down
            </Button>
            <Select value={nextClass} onChange={(e) => setNext(e.target.value)} className="py-0.5 text-xs">
              <optgroup label="Your classes">
                {taken.map((cid) => (
                  <option key={cid} value={cid}>
                    {idx.byId.get(cid)?.name ?? cid}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Multiclass into">
                {allClasses
                  .filter((r) => !taken.includes(r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({prereqText(r.id) || "no prerequisite"}){multiclassBlocked(r.id) ? " - requirements not met" : ""}
                    </option>
                  ))}
              </optgroup>
            </Select>
            <Button size="sm" variant="primary" disabled={level >= 20} onClick={() => update((c) => void c.build.levels.push({ classId: nextClass, hp: "avg" }))}>
              Level up
            </Button>
          </>
        }
      >
        {multiclassBlocked(nextClass) && (
          <p className="mb-1 text-xs text-warn">
            Multiclassing requires {prereqText(nextClass)} for {idx.byId.get(nextClass)?.name} and the prerequisites of your current classes (
            {taken.map((x) => `${idx.byId.get(x)?.name}: ${prereqText(x)}`).join(", ")}).
          </p>
        )}
        {!taken.includes(nextClass) && (
          <p className="mb-1 text-xs text-muted">
            A new class only gives some of its proficiencies and no saving throws. Its spell slots are combined with your other casting classes.
          </p>
        )}
        <div className="flex flex-col gap-1">
          {taken.map((cid) => {
            const cls = idx.byId.get(cid) as ContentRow<ClassData> | undefined;
            return cls ? (
              <details key={cid}>
                <summary className="cursor-pointer text-sm text-muted">{cls.name}: class table, proficiencies and starting equipment</summary>
                <ClassDetails cls={cls} />
              </details>
            ) : null;
          })}
        </div>
      </Card>
      {map.map((m) => (
        <LevelCard key={m.charLevel} charLevel={m.charLevel} classId={m.classId} classLevel={m.classLevel} multiclass={taken.length > 1} />
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
              ch.build.subclassId = ch.build.subclasses?.[c.id] ?? null;
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

function LevelCard({ charLevel, classId, classLevel, multiclass }: { charLevel: number; classId: string; classLevel: number; multiclass: boolean }) {
  const { character, sheet, update, idx } = useBuilder();
  const b = character.build;
  const cls = idx.byId.get(classId) as ContentRow<ClassData> | undefined;
  const entry = b.levels[charLevel - 1];
  const subId = subclassOf(b, classId);
  const sub = subId ? idx.byId.get(subId) : undefined;
  const features = [
    ...((idx.featuresByOwner.get(classId) ?? []) as ContentRow<FeatureData>[]).filter((f) => f.data.level === classLevel),
    ...(sub ? ((idx.featuresByOwner.get(sub.id) ?? []) as ContentRow<FeatureData>[]).filter((f) => f.data.level === classLevel) : []),
  ];
  const here = sheet.choices.filter((c) => c.location === "class" && c.classId === classId && c.level === classLevel);
  const asi = here.find((c) => c.isAsi);
  const subclassChoice = here.find((c) => c.choice.from.kind === "subclass");
  const others = here.filter((c) => c !== asi && c !== subclassChoice);
  const open = here.some((c) => c.open);
  const hitDie = cls?.data.hitDie ?? 8;

  return (
    <Card
      highlight={open}
      title={
        <span className="flex items-center gap-2">
          Level {charLevel}
          {multiclass && (
            <span className="text-xs font-normal text-muted">
              {cls?.name ?? classId} {classLevel}
            </span>
          )}
          {open && <Badge tone="danger">choice needed</Badge>}
        </span>
      }
      actions={<HpControl level={charLevel} hitDie={hitDie} value={entry.hp} onChange={(hp) => update((c) => void (c.build.levels[charLevel - 1].hp = hp))} />}
    >
      <div className="flex flex-col gap-2">
        {multiclass && classLevel === 1 && charLevel > 1 && (
          <p className="text-xs text-muted">Multiclass into {cls?.name}: only some of its proficiencies, no saving throws, no starting equipment.</p>
        )}
        {subclassChoice && <SubclassPicker instance={subclassChoice} classId={classId} />}
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
                    <span className="text-[11px] text-muted">Optional class feature (Tasha's) - not active. Enable it in Settings, Table rules.</span>
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

function SubclassPicker({ instance, classId }: { instance: ChoiceInstance; classId: string }) {
  const { character, update, idx } = useBuilder();
  const [open, setOpen] = useState(false);
  const rows = (idx.subclassesByClass.get(classId) ?? []).filter((r) => visible(r, character.build));
  const currentId = subclassOf(character.build, classId);
  const current = currentId ? idx.byId.get(currentId) : undefined;
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
          update((c) => setSubclass(c.build, classId, subclassOf(c.build, classId) === id ? null : id));
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
