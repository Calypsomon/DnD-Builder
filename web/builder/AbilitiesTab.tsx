import { POINT_BUY_COST, STANDARD_ARRAY } from "../../shared/rules/tables";
import { ABILITIES, type Ability } from "../../shared/types/effects";
import { StatValue, fmtSigned } from "../components/StatValue";
import { Button, Card, Input, Select, cx } from "../components/ui";
import { useBuilder } from "./context";

export const ABILITY_LABEL: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export default function AbilitiesTab() {
  const { character, sheet, update } = useBuilder();
  const b = character.build;
  const method = b.abilities.method;
  const setBase = (a: Ability, v: number) => update((c) => void (c.build.abilities.base[a] = v));
  const setMethod = (m: typeof method) =>
    update((c) => {
      c.build.abilities.method = m;
      if (m === "pointbuy") c.build.abilities.base = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
      if (m === "standard") c.build.abilities.base = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
    });

  const remaining = sheet.pointBuy.budget - sheet.pointBuy.spent;
  const custom = b.customAsi ?? {};
  const plus2 = (Object.keys(custom) as Ability[]).find((a) => custom[a] === 2) ?? "";
  const plus1 = (Object.keys(custom) as Ability[]).find((a) => custom[a] === 1) ?? "";
  const setCustom = (two: string, one: string) =>
    update((c) => {
      const out: Partial<Record<Ability, number>> = {};
      if (two) out[two as Ability] = 2;
      if (one && one !== two) out[one as Ability] = 1;
      c.build.customAsi = out;
    });

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
      <Card
        title="Ability scores"
        actions={
          <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            <option value="pointbuy">Point buy</option>
            <option value="standard">Standard array</option>
            <option value="manual">Manual / rolled</option>
          </Select>
        }
      >
        {method === "pointbuy" && (
          <p className={cx("mb-3 text-sm", remaining < 0 ? "text-danger" : "text-muted")}>
            Points remaining: <b>{remaining}</b> / {sheet.pointBuy.budget} (scores 8–15; costs: 8=0, 9=1, 10=2, 11=3, 12=4, 13=5, 14=7, 15=9)
          </p>
        )}
        {method === "standard" && <p className="mb-3 text-sm text-muted">Assign each value of {STANDARD_ARRAY.join(", ")} exactly once.</p>}
        {method === "manual" && <p className="mb-3 text-sm text-muted">Enter your rolled (4d6, drop lowest) or agreed scores.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1">Ability</th>
                <th>Base</th>
                <th>Bonuses</th>
                <th>Total</th>
                <th>Modifier</th>
                <th>Save</th>
              </tr>
            </thead>
            <tbody>
              {ABILITIES.map((a) => {
                const base = b.abilities.base[a];
                const s = sheet.abilities[a];
                const bonus = s.score.total - base;
                return (
                  <tr key={a} className="border-t border-line">
                    <td className="py-1 font-medium">{ABILITY_LABEL[a]}</td>
                    <td>
                      {method === "pointbuy" && (
                        <div className="flex items-center gap-1">
                          <Button size="sm" disabled={base <= 8} onClick={() => setBase(a, base - 1)}>
                            −
                          </Button>
                          <span className="w-6 text-center tabular-nums">{base}</span>
                          <Button
                            size="sm"
                            disabled={base >= 15 || (POINT_BUY_COST[base + 1] ?? 99) - (POINT_BUY_COST[base] ?? 0) > remaining}
                            onClick={() => setBase(a, base + 1)}
                          >
                            +
                          </Button>
                        </div>
                      )}
                      {method === "standard" && (
                        <Select value={base} onChange={(e) => setBase(a, Number(e.target.value))}>
                          {STANDARD_ARRAY.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </Select>
                      )}
                      {method === "manual" && (
                        <Input type="number" min={1} max={30} className="w-16" value={base} onChange={(e) => setBase(a, Number(e.target.value) || 0)} />
                      )}
                    </td>
                    <td className="tabular-nums text-muted">{bonus ? fmtSigned(bonus) : "–"}</td>
                    <td className="text-lg font-semibold">
                      <StatValue stat={s.score} />
                    </td>
                    <td className="font-semibold tabular-nums">{fmtSigned(s.mod)}</td>
                    <td>
                      <StatValue stat={sheet.saves[a].total} signed className={sheet.saves[a].proficient ? "font-semibold" : ""} />
                      {sheet.saves[a].proficient && <span className="ml-1 text-xs text-accent">●</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {b.options.customizeOrigin && (
        <Card title="Customized origin (Tasha's)">
          <p className="mb-2 text-sm text-muted">Your species' fixed ability increases are replaced by these.</p>
          <div className="flex flex-wrap gap-4">
            <label className="text-sm">
              +2 to{" "}
              <Select value={plus2} onChange={(e) => setCustom(e.target.value, plus1)}>
                <option value="">—</option>
                {ABILITIES.map((a) => (
                  <option key={a} value={a}>
                    {ABILITY_LABEL[a]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              +1 to{" "}
              <Select value={plus1} onChange={(e) => setCustom(plus2, e.target.value)}>
                <option value="">—</option>
                {ABILITIES.filter((a) => a !== plus2).map((a) => (
                  <option key={a} value={a}>
                    {ABILITY_LABEL[a]}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </Card>
      )}
    </div>
  );
}
