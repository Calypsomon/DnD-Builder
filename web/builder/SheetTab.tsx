import { useState } from "react";
import { SKILLS } from "../../shared/types/content";
import { ABILITIES, type Effect } from "../../shared/types/effects";
import { titleCase } from "../../shared/rules/tables";
import { EffectEditor, describeEffect } from "../components/EffectEditor";
import { Markdown } from "../components/Markdown";
import { StatBox, StatValue, fmtSigned } from "../components/StatValue";
import { Badge, Button, Card, Field, Input, Modal, TextArea, cx } from "../components/ui";
import { ABILITY_LABEL } from "./AbilitiesTab";
import { useBuilder } from "./context";

const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

export default function SheetTab() {
  const { character, sheet, update } = useBuilder();
  const st = character.state;
  const hpMax = sheet.hpMax.total;
  const hpCur = st.hpCurrent ?? hpMax;
  const [amount, setAmount] = useState("");

  const applyHp = (kind: "damage" | "heal" | "temp") => {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (!n) return;
    update((c) => {
      const s = c.state;
      const cur = s.hpCurrent ?? hpMax;
      if (kind === "temp") s.hpTemp = Math.max(s.hpTemp, n);
      else if (kind === "heal") s.hpCurrent = Math.min(hpMax, cur + n);
      else {
        const fromTemp = Math.min(s.hpTemp, n);
        s.hpTemp -= fromTemp;
        s.hpCurrent = Math.max(0, cur - (n - fromTemp));
      }
      if (s.hpCurrent === hpMax) s.hpCurrent = null;
    });
    setAmount("");
  };
  const rest = (kind: "short" | "long") =>
    update((c) => {
      c.state.pactSlotsUsed = 0;
      for (const r of sheet.resources) if (kind === "long" || r.recharge === "short") delete c.state.resourcesUsed[r.id];
      if (kind === "long") {
        c.state.hpCurrent = null;
        c.state.hpTemp = 0;
        c.state.slotsUsed = {};
      }
    });

  const groups = new Map<string, typeof sheet.features>();
  for (const f of sheet.features) groups.set(f.ownerName, [...(groups.get(f.ownerName) ?? []), f]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <StatBox label="Armor Class">
          <StatValue stat={sheet.ac} />
        </StatBox>
        <StatBox label="Initiative">
          <StatValue stat={sheet.initiative} signed />
        </StatBox>
        <StatBox label="Speed" small={Object.entries(sheet.speed).filter(([k]) => k !== "walk").map(([k, v]) => `${k} ${v}`).join(", ") || "ft."}>
          <StatValue stat={sheet.speed.walk} />
        </StatBox>
        <StatBox label="Proficiency">+{sheet.pb}</StatBox>
        <StatBox label="Passive Perc.">
          <StatValue stat={sheet.passive.perception} />
        </StatBox>
        <div className="flex flex-1 flex-col rounded-lg border border-line bg-panel px-3 py-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Hit Points</span>
            <span className="text-xs text-muted">Hit dice: {sheet.hitDice || "–"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={cx("text-2xl font-semibold tabular-nums", hpCur <= hpMax / 4 && "text-danger")}>
              {hpCur}
              <span className="text-base text-muted">
                {" "}
                / <StatValue stat={sheet.hpMax} />
              </span>
            </span>
            {st.hpTemp > 0 && <Badge tone="accent">+{st.hpTemp} temp</Badge>}
            <div className="flex items-center gap-1">
              <Input type="number" min={0} className="w-16" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              <Button size="sm" variant="danger" onClick={() => applyHp("damage")}>
                Damage
              </Button>
              <Button size="sm" onClick={() => applyHp("heal")}>
                Heal
              </Button>
              <Button size="sm" variant="ghost" onClick={() => applyHp("temp")}>
                Temp
              </Button>
            </div>
            <div className="ml-auto flex gap-1">
              <Button size="sm" onClick={() => rest("short")}>
                Short rest
              </Button>
              <Button size="sm" onClick={() => rest("long")}>
                Long rest
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-3">
          <Card title="Abilities & saves">
            <div className="grid grid-cols-3 gap-2">
              {ABILITIES.map((a) => (
                <div key={a} className="rounded-md border border-line p-1.5 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{ABILITY_LABEL[a]}</div>
                  <div className="text-xl font-semibold">{fmtSigned(sheet.abilities[a].mod)}</div>
                  <div className="text-xs text-muted">
                    <StatValue stat={sheet.abilities[a].score} />
                  </div>
                  <div className={cx("mt-1 text-xs", sheet.saves[a].proficient && "font-semibold text-accent")}>
                    Save <StatValue stat={sheet.saves[a].total} signed />
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Skills">
            <div className="grid gap-0.5 text-sm">
              {Object.entries(sheet.skills).map(([id, s]) => (
                <div key={id} className="flex items-center gap-2">
                  <span className={cx("w-3 text-xs", s.prof === 2 ? "text-accent" : s.prof === 1 ? "text-accent" : "text-muted")} title={s.prof === 2 ? "Expertise" : s.prof === 1 ? "Proficient" : s.prof ? "Half proficiency" : ""}>
                    {s.prof === 2 ? "◆" : s.prof === 1 ? "●" : s.prof ? "◐" : "○"}
                  </span>
                  <span className="flex-1">{titleCase(id)}</span>
                  <span className="text-xs text-muted">{SKILLS[id].toUpperCase()}</span>
                  <span className="w-8 text-right">
                    <StatValue stat={s.total} signed />
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Passive Investigation <StatValue stat={sheet.passive.investigation} /> · Passive Insight <StatValue stat={sheet.passive.insight} />
            </p>
          </Card>
          <Card title="Proficiencies & senses">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">Armor</dt>
              <dd>{sheet.proficiencies.armor.map(titleCase).join(", ") || "—"}</dd>
              <dt className="text-muted">Weapons</dt>
              <dd>{sheet.proficiencies.weapons.map(titleCase).join(", ") || "—"}</dd>
              <dt className="text-muted">Tools</dt>
              <dd>{sheet.proficiencies.tools.map(titleCase).join(", ") || "—"}</dd>
              <dt className="text-muted">Languages</dt>
              <dd>{sheet.proficiencies.languages.map(titleCase).join(", ") || "—"}</dd>
              <dt className="text-muted">Senses</dt>
              <dd>{sheet.senses.map((s) => `${titleCase(s.sense)} ${s.range} ft.`).join(", ") || "—"}</dd>
              {sheet.defenses.resistance.length > 0 && (
                <>
                  <dt className="text-muted">Resistances</dt>
                  <dd>{sheet.defenses.resistance.map(titleCase).join(", ")}</dd>
                </>
              )}
              {sheet.defenses.immunity.length > 0 && (
                <>
                  <dt className="text-muted">Immunities</dt>
                  <dd>{sheet.defenses.immunity.map(titleCase).join(", ")}</dd>
                </>
              )}
            </dl>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <Card title="Attacks">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1">Name</th>
                  <th>To hit</th>
                  <th>Damage</th>
                  <th>Range</th>
                </tr>
              </thead>
              <tbody>
                {sheet.attacks.map((a, i) => (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="py-1.5">
                      <span className="font-medium">{a.name}</span>
                      {(a.properties.length > 0 || a.notes.length > 0) && <div className="text-xs text-muted">{[...a.properties, ...a.notes].join(", ")}</div>}
                    </td>
                    <td className="font-semibold">
                      <StatValue stat={a.toHit} signed />
                    </td>
                    <td>
                      {a.damage} {a.damageType}
                      {a.versatileDamage && <div className="text-xs text-muted">two-handed: {a.versatileDamage}</div>}
                    </td>
                    <td className="text-muted">{a.range}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">Equip weapons in the Inventory tab.</p>
          </Card>

          {(sheet.resources.length > 0 || sheet.spellcasting) && (
            <Card title="Resources & spell slots">
              <div className="flex flex-col gap-2">
                {sheet.spellcasting?.slots.map((n, lvl) =>
                  lvl > 0 && n > 0 ? (
                    <Tracker
                      key={`slot${lvl}`}
                      label={`${ORD[lvl]} level slots`}
                      max={n}
                      used={st.slotsUsed[lvl] ?? 0}
                      onChange={(u) => update((c) => void (c.state.slotsUsed[lvl] = u))}
                    />
                  ) : null,
                )}
                {sheet.spellcasting?.pact && sheet.spellcasting.pact.slots > 0 && (
                  <Tracker
                    label={`Pact slots (level ${sheet.spellcasting.pact.level})`}
                    max={sheet.spellcasting.pact.slots}
                    used={st.pactSlotsUsed}
                    hint="short rest"
                    onChange={(u) => update((c) => void (c.state.pactSlotsUsed = u))}
                  />
                )}
                {sheet.resources.map((r) =>
                  r.unlimited ? (
                    <div key={r.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-40">{`${r.name}${r.die ? ` (${r.die})` : ""}`}</span>
                      <span className="text-xs text-muted">unlimited</span>
                    </div>
                  ) : (
                  <Tracker
                    key={r.id}
                    label={`${r.name}${r.die ? ` (${r.die})` : ""}`}
                    max={r.max}
                    used={st.resourcesUsed[r.id] ?? 0}
                    hint={r.recharge === "short" ? "short rest" : r.recharge === "long" ? "long rest" : r.recharge}
                    onChange={(u) => update((c) => void (c.state.resourcesUsed[r.id] = u))}
                  />
                  ),
                )}
              </div>
              {sheet.spellcasting?.classes.map((sc) => (
                <p key={sc.classId} className="mt-1 text-sm">
                  {sheet.spellcasting!.classes.length > 1 && <span className="text-muted">{sc.className}: </span>}
                  Spell save DC <b><StatValue stat={sc.dc} /></b> · Spell attack <b><StatValue stat={sc.attack} signed /></b>
                </p>
              ))}
            </Card>
          )}

          {sheet.spells.length > 0 && (
            <Card title="Spells">
              <div className="flex flex-col gap-1 text-sm">
                {Array.from({ length: 10 }, (_, lvl) => {
                  const list = sheet.spells.filter((s) => s.level === lvl && s.prepared);
                  if (!list.length) return null;
                  return (
                    <div key={lvl}>
                      <span className="mr-2 text-xs font-semibold uppercase text-muted">{lvl === 0 ? "Cantrips" : ORD[lvl]}</span>
                      {list.map((s) => s.name + (s.concentration ? " (C)" : "") + (s.ritual ? " (R)" : "")).join(", ")}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

        </div>

        <div className="flex flex-col gap-3 lg:col-span-2 xl:col-span-1">
          <Card title="Features & traits">
            {[...groups.entries()].map(([owner, list]) => (
              <div key={owner} className="mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{owner}</h4>
                {list.map((f) => (
                  <details key={f.id} className="border-b border-line py-1 last:border-0">
                    <summary className="cursor-pointer text-sm font-medium">
                      {f.name}
                      {f.ownerType === "class" || f.ownerType === "subclass" ? <span className="ml-2 text-xs font-normal text-muted">Level {f.level}</span> : null}
                    </summary>
                    <Markdown text={f.description} />
                  </details>
                ))}
              </div>
            ))}
            {sheet.notes.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-muted">
                {sheet.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </Card>

          <CustomBonuses />
        </div>
      </div>
    </div>
  );
}

function Tracker({ label, max, used, onChange, hint }: { label: string; max: number; used: number; onChange: (u: number) => void; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-40">{label}</span>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: Math.min(max, 30) }, (_, i) => (
          <button
            key={i}
            title={i < used ? "Used" : "Available"}
            onClick={() => onChange(i < used ? i : i + 1)}
            className={cx("h-4 w-4 cursor-pointer rounded-sm border", i < used ? "border-line bg-panel2" : "border-accent bg-accent")}
          />
        ))}
        {max > 30 && <span className="text-xs text-muted">({max - used} left)</span>}
      </div>
      <span className="text-xs text-muted">
        {max - used}/{max}
        {hint ? ` · ${hint}` : ""}
      </span>
    </div>
  );
}

function CustomBonuses() {
  const { character, update } = useBuilder();
  const [editing, setEditing] = useState<{ id: string; name: string; description: string; effects: Effect[] } | null>(null);
  const save = () => {
    if (!editing) return;
    update((c) => {
      const i = c.custom.findIndex((x) => x.id === editing.id);
      if (i >= 0) c.custom[i] = editing;
      else c.custom.push(editing);
    });
    setEditing(null);
  };
  return (
    <Card
      title="Custom bonuses"
      actions={
        <Button size="sm" onClick={() => setEditing({ id: crypto.randomUUID(), name: "", description: "", effects: [{ type: "bonus", target: "ac", value: 1 }] })}>
          Add custom bonus
        </Button>
      }
    >
      {character.custom.length === 0 ? (
        <p className="text-sm text-muted">One-off bonuses or abilities for this character only (e.g. a blessing, a boon, a house rule).</p>
      ) : (
        character.custom.map((c) => (
          <div key={c.id} className="flex items-start gap-2 border-b border-line py-1.5 text-sm last:border-0">
            <div className="flex-1">
              <span className="font-medium">{c.name || "Unnamed"}</span>
              <div className="text-xs text-muted">{c.effects.map(describeEffect).join("; ")}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditing(structuredClone(c))}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => update((ch) => void (ch.custom = ch.custom.filter((x) => x.id !== c.id)))}>
              ×
            </Button>
          </div>
        ))
      )}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Custom bonus"
        wide
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" disabled={!editing?.name} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <div className="flex flex-col gap-3">
            <Field label="Name">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Blessing of the Forge" />
            </Field>
            <Field label="Description">
              <TextArea rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <EffectEditor value={editing.effects} onChange={(effects) => setEditing({ ...editing, effects })} />
          </div>
        )}
      </Modal>
    </Card>
  );
}
