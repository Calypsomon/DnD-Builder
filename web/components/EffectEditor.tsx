import { useEffect, useState } from "react";
import { ABILITIES, EffectSchema, type Ability, type Condition, type Effect } from "../../shared/types/effects";
import { SKILLS } from "../../shared/types/content";
import { DAMAGE_TYPES, titleCase } from "../../shared/rules/tables";
import { Button, Checkbox, Input, Select, cx } from "./ui";

const ABILITY_NAMES: Record<string, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};
const SKILL_IDS = Object.keys(SKILLS);

const CONDITIONS: { id: Condition; label: string; text: string }[] = [
  { id: "always", label: "Always", text: "" },
  { id: "itemEquipped", label: "While equipped", text: "while equipped" },
  { id: "itemAttuned", label: "While attuned", text: "while attuned" },
  { id: "noArmor", label: "No armor", text: "while wearing no armor" },
  { id: "unarmored", label: "No armor & no shield", text: "while wearing no armor and no shield" },
  { id: "noHeavyArmor", label: "No heavy armor", text: "while not wearing heavy armor" },
  { id: "wearingArmor", label: "Wearing armor", text: "while wearing armor" },
  { id: "noShield", label: "No shield", text: "while not using a shield" },
  { id: "rangedWeapon", label: "Ranged weapons only", text: "with ranged weapons only" },
  { id: "oneHandedMeleeOnly", label: "One-handed melee only", text: "with one-handed melee weapons only" },
];

const TYPE_LABELS: { id: Effect["type"]; label: string }[] = [
  { id: "bonus", label: "Bonus" },
  { id: "abilityIncrease", label: "Ability score increase" },
  { id: "abilitySet", label: "Set ability score" },
  { id: "acFormula", label: "Alternative AC formula" },
  { id: "proficiency", label: "Proficiency" },
  { id: "expertise", label: "Expertise" },
  { id: "speed", label: "Speed" },
  { id: "sense", label: "Sense" },
  { id: "damageDefense", label: "Damage resistance / immunity / vulnerability" },
  { id: "hpPerLevel", label: "HP per level" },
  { id: "resource", label: "Resource" },
  { id: "note", label: "Note" },
];
const OTHER_LABELS: Record<string, string> = {
  halfProficiency: "Half proficiency",
  grantSpell: "Grant spell",
  attackOption: "Attack option",
};

const STATIC_TARGETS: { label: string; options: [string, string][] }[] = [
  {
    label: "Defense",
    options: [
      ["ac", "Armor Class"],
      ["initiative", "Initiative"],
      ["hp.max", "Max HP"],
      ["speed.walk", "Walking speed"],
    ],
  },
  { label: "Saves", options: [["save.all", "All saves"], ...(ABILITIES.map((a) => [`save.${a}`, `Save: ${ABILITY_NAMES[a]}`]) as [string, string][])] },
  {
    label: "Skills",
    options: [
      ["skill.all", "All skills / ability checks"],
      ["passive.perception", "Passive Perception"],
      ...(SKILL_IDS.map((s) => [`skill.${s}`, `Skill: ${titleCase(s)}`]) as [string, string][]),
    ],
  },
  {
    label: "Attacks & damage",
    options: [
      ["attack.melee", "Melee attack"],
      ["attack.ranged", "Ranged attack"],
      ["attack.spell", "Spell attack"],
      ["attack.all", "All attacks"],
      ["damage.melee", "Melee damage"],
      ["damage.ranged", "Ranged damage"],
      ["damage.all", "All damage"],
      ["spellDc", "Spell save DC"],
    ],
  },
];
const TARGET_LABEL = new Map<string, string>(STATIC_TARGETS.flatMap((g) => g.options));

const ARMOR_IDS = ["light", "medium", "heavy", "shields"];
const WEAPON_PRESETS = ["simple", "martial"];

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function signed(n: number | string) {
  return typeof n === "number" ? (n >= 0 ? `+${n}` : `${n}`) : n;
}
function list(xs: string[], fmt: (s: string) => string = (s) => s) {
  const a = xs.map(fmt);
  if (a.length <= 1) return a.join("");
  return `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
}
function condText(c?: Condition) {
  const t = CONDITIONS.find((x) => x.id === c)?.text;
  return t ? ` ${t}` : "";
}

export function describeEffect(e: Effect): string {
  switch (e.type) {
    case "bonus": {
      const target = TARGET_LABEL.get(e.target)?.replace(/^Save: /, "saving throws: ").replace(/^Skill: /, "") ?? e.target;
      return `${signed(e.value)} bonus to ${target}${condText(e.when)}`;
    }
    case "abilityIncrease":
      return `${ABILITY_NAMES[e.ability]} score ${e.value >= 0 ? "increases" : "decreases"} by ${Math.abs(e.value)} (max ${e.max ?? 20})`;
    case "abilitySet":
      return `${ABILITY_NAMES[e.ability]} score becomes ${e.value}`;
    case "acFormula":
      return `${e.name ? `${e.name}: ` : ""}AC = ${e.formula}${e.allowsShield ? " (shield allowed)" : " (no shield)"}${condText(e.when)}`;
    case "proficiency":
      return `Proficiency in ${e.kind === "armor" ? "armor" : e.kind === "save" ? "saving throws" : e.kind + "s"}: ${e.ids.length ? list(e.ids, (s) => (e.kind === "save" ? ABILITY_NAMES[s] ?? s : titleCase(s))) : "(none selected)"}`;
    case "expertise":
      return `Expertise in ${e.skills.length ? list(e.skills, titleCase) : "(none selected)"}`;
    case "halfProficiency":
      return `Half proficiency to ${e.scope === "initiative" ? "initiative" : "ability checks"}`;
    case "speed": {
      const m = e.mode;
      if (e.op === "equalWalk") return `${titleCase(m)} speed equals walking speed${condText(e.when)}`;
      if (e.op === "set") return `${titleCase(m)} speed ${e.value ?? 0} ft${condText(e.when)}`;
      return `${signed(e.value ?? 0)} ft ${m} speed${condText(e.when)}`;
    }
    case "sense":
      return `${titleCase(e.sense)} ${e.range} ft`;
    case "damageDefense":
      return `${titleCase(e.kind)} to ${e.damageTypes.length ? list(e.damageTypes) : "(no types)"} damage`;
    case "hpPerLevel":
      return `${signed(e.value)} hit point${Math.abs(e.value) === 1 ? "" : "s"} per level`;
    case "resource":
      return `Resource "${e.name}": ${e.max} use(s)${e.die ? `, die ${e.die}` : ""}, recharges ${e.recharge === "none" ? "never" : e.recharge === "dawn" ? "at dawn" : `on ${e.recharge} rest`}`;
    case "grantSpell":
      return `Grants spell ${titleCase(e.spellId)}${e.alwaysPrepared ? " (always prepared)" : ""}`;
    case "attackOption":
      return `Attack option: ${e.name} (${e.damage} ${e.damageType})`;
    case "note":
      return e.text || "(empty note)";
  }
}

function defaultEffect(type: Effect["type"]): Effect {
  switch (type) {
    case "bonus":
      return { type, target: "ac", value: 1 };
    case "abilityIncrease":
      return { type, ability: "str", value: 1, max: 20 };
    case "abilitySet":
      return { type, ability: "str", value: 19 };
    case "acFormula":
      return { type, name: "", formula: "13 + dex", allowsShield: true };
    case "proficiency":
      return { type, kind: "skill", ids: [] };
    case "expertise":
      return { type, skills: [] };
    case "speed":
      return { type, mode: "walk", op: "add", value: 10 };
    case "sense":
      return { type, sense: "darkvision", range: 60 };
    case "damageDefense":
      return { type, kind: "resistance", damageTypes: [] };
    case "hpPerLevel":
      return { type, value: 1 };
    case "resource":
      return { type, id: "", name: "", max: 1, recharge: "long" };
    case "note":
      return { type, text: "" };
    default:
      return { type: "note", text: "" };
  }
}

function MultiSelect({ options, value, onChange }: { options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            type="button"
            key={o.id}
            onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
            className={cx(
              "cursor-pointer rounded border px-1.5 py-0.5 text-xs",
              on ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-muted hover:bg-panel2",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CsvInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const parse = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const [text, setText] = useState(value.join(", "));
  useEffect(() => {
    if (parse(text).join(",") !== value.join(",")) setText(value.join(", "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      className="w-full"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parse(e.target.value));
      }}
    />
  );
}

function NumInput({ value, onChange, className, min, max }: { value: number; onChange: (n: number) => void; className?: string; min?: number; max?: number }) {
  return (
    <Input
      type="number"
      className={cx("w-20", className)}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
    />
  );
}

/** number when numeric, otherwise formula string */
function NumOrFormula({ value, onChange, className, placeholder }: { value: number | string; onChange: (v: number | string) => void; className?: string; placeholder?: string }) {
  return (
    <Input
      className={cx("w-28", className)}
      value={String(value)}
      placeholder={placeholder ?? "1 or pb, cha"}
      onChange={(e) => {
        const s = e.target.value;
        onChange(s.trim() !== "" && /^-?\d+(\.\d+)?$/.test(s.trim()) ? Number(s) : s);
      }}
    />
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}

const abilityOptions = ABILITIES.map((a) => (
  <option key={a} value={a}>
    {ABILITY_NAMES[a]}
  </option>
));

function ConditionSelect({ value, onChange }: { value?: Condition; onChange: (c: Condition | undefined) => void }) {
  return (
    <L label="Condition">
      <Select value={value ?? "always"} onChange={(e) => onChange(e.target.value === "always" ? undefined : (e.target.value as Condition))}>
        {CONDITIONS.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </Select>
    </L>
  );
}

function Fields({ e, set }: { e: Effect; set: (patch: Record<string, unknown>) => void }) {
  switch (e.type) {
    case "bonus":
      return (
        <>
          <L label="Applies to">
            <Select value={e.target} onChange={(ev) => set({ target: ev.target.value })}>
              {!TARGET_LABEL.has(e.target) && <option value={e.target}>{e.target}</option>}
              {STATIC_TARGETS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </L>
          <L label="Value (number or formula)">
            <NumOrFormula value={e.value} onChange={(v) => set({ value: v })} />
          </L>
          <ConditionSelect value={e.when} onChange={(c) => set({ when: c })} />
        </>
      );
    case "abilityIncrease":
      return (
        <>
          <L label="Ability">
            <Select value={e.ability} onChange={(ev) => set({ ability: ev.target.value })}>
              {abilityOptions}
            </Select>
          </L>
          <L label="Increase by">
            <NumInput value={e.value} onChange={(n) => set({ value: n })} />
          </L>
          <L label="Max score">
            <NumInput value={e.max ?? 20} onChange={(n) => set({ max: n })} />
          </L>
        </>
      );
    case "abilitySet":
      return (
        <>
          <L label="Ability">
            <Select value={e.ability} onChange={(ev) => set({ ability: ev.target.value })}>
              {abilityOptions}
            </Select>
          </L>
          <L label="Score becomes">
            <NumInput value={e.value} onChange={(n) => set({ value: n })} />
          </L>
        </>
      );
    case "acFormula":
      return (
        <>
          <L label="Name">
            <Input className="w-36" value={e.name ?? ""} placeholder="Mage Armor" onChange={(ev) => set({ name: ev.target.value })} />
          </L>
          <L label="Formula">
            <Input className="w-40" value={e.formula} placeholder="13 + dex" onChange={(ev) => set({ formula: ev.target.value })} />
          </L>
          <L label="Shield">
            <Checkbox label="Allows shield" checked={e.allowsShield} onChange={(v) => set({ allowsShield: v })} />
          </L>
          <ConditionSelect value={e.when} onChange={(c) => set({ when: c })} />
        </>
      );
    case "proficiency":
      return (
        <>
          <L label="Kind">
            <Select value={e.kind} onChange={(ev) => set({ kind: ev.target.value, ids: [] })}>
              {["skill", "save", "armor", "weapon", "tool", "language"].map((k) => (
                <option key={k} value={k}>
                  {titleCase(k)}
                </option>
              ))}
            </Select>
          </L>
          <div className="min-w-[14rem] flex-1">
            <L label={e.kind === "skill" || e.kind === "save" || e.kind === "armor" ? "Choose" : e.kind === "weapon" ? "Weapons (simple, martial or slugs, comma separated)" : "Ids (comma separated)"}>
              {e.kind === "skill" && <MultiSelect options={SKILL_IDS.map((s) => ({ id: s, label: titleCase(s) }))} value={e.ids} onChange={(v) => set({ ids: v })} />}
              {e.kind === "save" && <MultiSelect options={ABILITIES.map((a) => ({ id: a, label: ABILITY_NAMES[a] }))} value={e.ids} onChange={(v) => set({ ids: v })} />}
              {e.kind === "armor" && <MultiSelect options={ARMOR_IDS.map((a) => ({ id: a, label: titleCase(a) }))} value={e.ids} onChange={(v) => set({ ids: v })} />}
              {e.kind === "weapon" && (
                <div className="flex flex-col gap-1">
                  <MultiSelect options={WEAPON_PRESETS.map((a) => ({ id: a, label: titleCase(a) }))} value={e.ids} onChange={(v) => set({ ids: [...v, ...e.ids.filter((x) => !WEAPON_PRESETS.includes(x))] })} />
                  <CsvInput value={e.ids} onChange={(v) => set({ ids: v })} placeholder="simple, martial, item:longsword" />
                </div>
              )}
              {(e.kind === "tool" || e.kind === "language") && <CsvInput value={e.ids} onChange={(v) => set({ ids: v })} placeholder={e.kind === "tool" ? "thieves-tools" : "elvish, dwarvish"} />}
            </L>
          </div>
        </>
      );
    case "expertise":
      return (
        <div className="min-w-[14rem] flex-1">
          <L label="Skills">
            <MultiSelect options={SKILL_IDS.map((s) => ({ id: s, label: titleCase(s) }))} value={e.skills} onChange={(v) => set({ skills: v })} />
          </L>
        </div>
      );
    case "speed":
      return (
        <>
          <L label="Mode">
            <Select value={e.mode} onChange={(ev) => set({ mode: ev.target.value })}>
              {["walk", "fly", "swim", "climb", "burrow"].map((m) => (
                <option key={m} value={m}>
                  {titleCase(m)}
                </option>
              ))}
            </Select>
          </L>
          <L label="Operation">
            <Select value={e.op} onChange={(ev) => set({ op: ev.target.value })}>
              <option value="add">Add</option>
              <option value="set">Set to</option>
              <option value="equalWalk">Equal to walking speed</option>
            </Select>
          </L>
          {e.op !== "equalWalk" && (
            <L label="Feet">
              <NumInput value={e.value ?? 0} onChange={(n) => set({ value: n })} />
            </L>
          )}
          <ConditionSelect value={e.when} onChange={(c) => set({ when: c })} />
        </>
      );
    case "sense":
      return (
        <>
          <L label="Sense">
            <Select value={e.sense} onChange={(ev) => set({ sense: ev.target.value })}>
              {["darkvision", "blindsight", "tremorsense", "truesight"].map((m) => (
                <option key={m} value={m}>
                  {titleCase(m)}
                </option>
              ))}
            </Select>
          </L>
          <L label="Range (ft)">
            <NumInput value={e.range} onChange={(n) => set({ range: n })} />
          </L>
        </>
      );
    case "damageDefense":
      return (
        <>
          <L label="Kind">
            <Select value={e.kind} onChange={(ev) => set({ kind: ev.target.value })}>
              <option value="resistance">Resistance</option>
              <option value="immunity">Immunity</option>
              <option value="vulnerability">Vulnerability</option>
            </Select>
          </L>
          <div className="min-w-[14rem] flex-1">
            <L label="Damage types">
              <MultiSelect options={DAMAGE_TYPES.map((d) => ({ id: d, label: titleCase(d) }))} value={e.damageTypes} onChange={(v) => set({ damageTypes: v })} />
            </L>
          </div>
        </>
      );
    case "hpPerLevel":
      return (
        <L label="HP per level">
          <NumInput value={e.value} onChange={(n) => set({ value: n })} />
        </L>
      );
    case "resource":
      return (
        <>
          <L label="Name">
            <Input className="w-40" value={e.name} placeholder="Lucky Charm" onChange={(ev) => set({ name: ev.target.value, id: slug(ev.target.value) })} />
          </L>
          <L label="Max uses (number or formula)">
            <NumOrFormula value={e.max} onChange={(v) => set({ max: v })} placeholder="3 or pb" />
          </L>
          <L label="Recharge">
            <Select value={e.recharge} onChange={(ev) => set({ recharge: ev.target.value })}>
              <option value="short">Short rest</option>
              <option value="long">Long rest</option>
              <option value="dawn">Dawn</option>
              <option value="none">Never</option>
            </Select>
          </L>
          <L label="Die (optional)">
            <Input className="w-20" value={e.die ?? ""} placeholder="d6" onChange={(ev) => set({ die: ev.target.value || undefined })} />
          </L>
        </>
      );
    case "note":
      return (
        <div className="min-w-[14rem] flex-1">
          <L label="Text">
            <Input className="w-full" value={e.text} onChange={(ev) => set({ text: ev.target.value })} />
          </L>
        </div>
      );
    default:
      return <span className="text-xs text-muted">This effect type has no editor; it is kept as is.</span>;
  }
}

export function EffectEditor({ value, onChange }: { value: Effect[]; onChange: (v: Effect[]) => void }) {
  const update = (i: number, next: Effect) => onChange(value.map((e, j) => (j === i ? next : e)));
  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 && <p className="text-xs text-muted">No effects.</p>}
      {value.map((e, i) => {
        const parsed = EffectSchema.safeParse(e);
        const known = TYPE_LABELS.some((t) => t.id === e.type);
        return (
          <div key={i} className="rounded-md border border-line bg-bg p-2">
            <div className="flex flex-wrap items-end gap-2">
              <L label="Effect type">
                <Select value={e.type} onChange={(ev) => update(i, defaultEffect(ev.target.value as Effect["type"]))}>
                  {!known && <option value={e.type}>{OTHER_LABELS[e.type] ?? e.type}</option>}
                  {TYPE_LABELS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </L>
              <Fields e={e} set={(patch) => update(i, { ...e, ...patch } as Effect)} />
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove effect">
                Remove
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted">{describeEffect(e)}</p>
            {!parsed.success && (
              <p className="mt-0.5 text-xs text-danger">
                Invalid: {parsed.error.issues[0]?.path.join(".") || "effect"} {parsed.error.issues[0]?.message}
              </p>
            )}
          </div>
        );
      })}
      <div>
        <Button size="sm" onClick={() => onChange([...value, defaultEffect("bonus")])}>
          + Add effect
        </Button>
      </div>
    </div>
  );
}

export type { Ability };
