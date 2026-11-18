import { useMemo, useState } from "react";
import { visible } from "../../shared/engine/contentIndex";
import type { BackgroundData, ClassData, ContentRow, ItemData } from "../../shared/types/content";
import { Markdown } from "../components/Markdown";
import { Button, Card, Checkbox, Empty, Input, Modal, Select, SourceBadge, cx } from "../components/ui";
import { useBuilder } from "./context";

export function formatCost(cp?: number) {
  if (cp == null) return "—";
  if (cp % 100 === 0) return `${(cp / 100).toLocaleString()} gp`;
  if (cp % 10 === 0) return `${cp / 10} sp`;
  return `${cp} cp`;
}

export function itemStats(d: ItemData): string {
  if (d.weapon) {
    const w = d.weapon;
    return [`${w.damage} ${w.damageType}`, ...(w.properties ?? []).map((p) => (p === "versatile" && w.versatile ? `versatile (${w.versatile})` : p)), w.magicBonus ? `+${w.magicBonus}` : ""]
      .filter(Boolean)
      .join(", ");
  }
  if (d.armor) {
    const a = d.armor;
    if (a.type === "shield") return `AC +${a.baseAc}${a.magicBonus ? ` (+${a.magicBonus})` : ""}`;
    const dex = a.dexCap === 0 ? "" : a.dexCap == null ? " + Dex" : ` + Dex (max ${a.dexCap})`;
    return `AC ${a.baseAc}${dex}${a.magicBonus ? `, +${a.magicBonus}` : ""}${a.strReq ? `, Str ${a.strReq}` : ""}${a.stealthDisadvantage ? ", stealth disadv." : ""}`;
  }
  return [d.magicType ?? d.subtype, d.rarity].filter(Boolean).join(", ");
}

export default function InventoryTab() {
  const { character, sheet, update, idx } = useBuilder();
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const cls = character.build.classId ? (idx.byId.get(character.build.classId) as ContentRow<ClassData>) : undefined;
  const bg = character.build.backgroundId ? (idx.byId.get(character.build.backgroundId) as ContentRow<BackgroundData>) : undefined;

  const setEntry = (id: string, patch: Partial<(typeof character.inventory)[number]>) =>
    update((c) => {
      const e = c.inventory.find((x) => x.id === id);
      if (e) Object.assign(e, patch);
    });
  const cur = character.state.currency;
  const detailRow = detail ? (idx.byId.get(detail) as ContentRow<ItemData> | undefined) : undefined;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card title="Inventory" actions={<Button variant="primary" size="sm" onClick={() => setAdding(true)}>Add items</Button>}>
        {character.inventory.length === 0 ? (
          <Empty>No items yet. Use “Add items” to pick from the catalog (including your homebrew).</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1">Item</th>
                  <th>Qty</th>
                  <th>Equipped</th>
                  <th>Attuned</th>
                  <th>Weight</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {character.inventory.map((e) => {
                  const item = idx.byId.get(e.itemId) as ContentRow<ItemData> | undefined;
                  return (
                    <tr key={e.id} className="border-t border-line">
                      <td className="py-1.5">
                        <button className="cursor-pointer text-left hover:text-accent" onClick={() => setDetail(e.itemId)}>
                          <span className="font-medium">{e.customName || item?.name || e.itemId}</span>
                        </button>
                        {item && <div className="text-xs text-muted">{itemStats(item.data)}</div>}
                        {!item && <div className="text-xs text-danger">missing from database</div>}
                      </td>
                      <td>
                        <Input type="number" min={1} className="w-16" value={e.quantity} onChange={(ev) => setEntry(e.id, { quantity: Math.max(1, Number(ev.target.value) || 1) })} />
                      </td>
                      <td>
                        <input type="checkbox" checked={e.equipped} onChange={(ev) => setEntry(e.id, { equipped: ev.target.checked })} className="accent-[var(--color-accent)]" />
                      </td>
                      <td>
                        {item?.data.attunement ? (
                          <input type="checkbox" checked={e.attuned} onChange={(ev) => setEntry(e.id, { attuned: ev.target.checked })} className="accent-[var(--color-accent)]" />
                        ) : (
                          <span className="text-muted">–</span>
                        )}
                      </td>
                      <td className="tabular-nums text-muted">{item?.data.weightLb ? `${+(item.data.weightLb * e.quantity).toFixed(2)} lb` : "–"}</td>
                      <td>
                        <Button size="sm" variant="ghost" onClick={() => update((c) => void (c.inventory = c.inventory.filter((x) => x.id !== e.id)))}>
                          ×
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="flex flex-col gap-3">
        <Card title="Carrying">
          <p className={cx("text-sm", sheet.carriedWeight > sheet.carryCapacity && "text-danger")}>
            {+sheet.carriedWeight.toFixed(2)} / {sheet.carryCapacity} lb
          </p>
          <p className={cx("text-sm", sheet.attunedCount > 3 && "text-danger")}>Attuned items: {sheet.attunedCount} / 3</p>
        </Card>
        <Card title="Money">
          <div className="grid grid-cols-5 gap-2">
            {(["cp", "sp", "ep", "gp", "pp"] as const).map((k) => (
              <label key={k} className="flex flex-col text-xs text-muted">
                {k.toUpperCase()}
                <Input type="number" min={0} value={cur[k]} onChange={(e) => update((c) => void (c.state.currency[k] = Math.max(0, Number(e.target.value) || 0)))} />
              </label>
            ))}
          </div>
        </Card>
        {(cls?.data.startingEquipment?.text || bg?.data.equipmentText) && (
          <Card title="Starting equipment">
            {cls?.data.startingEquipment?.text && (
              <>
                <h4 className="text-xs font-semibold uppercase text-muted">{cls.name}</h4>
                <Markdown text={cls.data.startingEquipment.text} />
              </>
            )}
            {bg?.data.equipmentText && (
              <>
                <h4 className="mt-2 text-xs font-semibold uppercase text-muted">{bg.name}</h4>
                <p className="text-sm">{bg.data.equipmentText}</p>
              </>
            )}
          </Card>
        )}
      </div>
      <AddItemsModal open={adding} onClose={() => setAdding(false)} />
      <Modal open={!!detailRow} onClose={() => setDetail(null)} title={detailRow?.name ?? ""}>
        {detailRow && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">
              {itemStats(detailRow.data)} · {formatCost(detailRow.data.costCp)} · {detailRow.data.weightLb ?? "–"} lb <SourceBadge source={detailRow.source} origin={detailRow.origin} />
            </p>
            {detailRow.data.attunementText && <p className="text-sm italic">{detailRow.data.attunementText}</p>}
            <Markdown text={detailRow.description} />
          </div>
        )}
      </Modal>
    </div>
  );
}

const CATS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "weapon", label: "Weapons" },
  { id: "armor", label: "Armor & shields" },
  { id: "gear", label: "Gear & tools" },
  { id: "magic", label: "Magic items" },
  { id: "custom", label: "Custom" },
];

function AddItemsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { character, update, idx } = useBuilder();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [onlyVisible, setOnlyVisible] = useState(true);
  const items = useMemo(() => idx.bundle.items as ContentRow<ItemData>[], [idx]);
  const list = items
    .filter((i) => {
      if (onlyVisible && !visible(i, character.build)) return false;
      if (q && !i.name.toLowerCase().includes(q.toLowerCase())) return false;
      const c = i.data.category;
      if (cat === "weapon") return c === "weapon" || c === "ammunition";
      if (cat === "armor") return c === "armor" || c === "shield";
      if (cat === "gear") return c === "gear" || c === "tool" || c === "pack";
      if (cat === "magic") return c === "magic";
      if (cat === "custom") return i.origin === "custom";
      return true;
    })
    .slice(0, 300);
  const add = (item: ContentRow<ItemData>) =>
    update((c) => {
      const existing = c.inventory.find((e) => e.itemId === item.id && !e.customName);
      if (existing && !item.data.weapon && !item.data.armor) existing.quantity++;
      else c.inventory.push({ id: crypto.randomUUID(), itemId: item.id, quantity: 1, equipped: false, attuned: false });
    });
  return (
    <Modal open={open} onClose={onClose} title="Add items" wide footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Input autoFocus placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cat} onChange={(e) => setCat(e.target.value)}>
          {CATS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
        <Checkbox label="Respect source filter" checked={onlyVisible} onChange={setOnlyVisible} />
      </div>
      <div className="max-h-[55vh] overflow-y-auto">
        {list.map((i) => (
          <div key={i.id} className="flex items-center gap-2 border-b border-line py-1 text-sm last:border-0">
            <div className="flex-1">
              <span className="font-medium">{i.name}</span>
              <span className="ml-2 text-xs text-muted">{itemStats(i.data)}</span>
            </div>
            <span className="text-xs text-muted">{formatCost(i.data.costCp)}</span>
            <SourceBadge source={i.source} origin={i.origin} />
            <Button size="sm" onClick={() => add(i)}>
              Add
            </Button>
          </div>
        ))}
        {list.length === 0 && <p className="p-2 text-sm text-muted">No items match.</p>}
      </div>
    </Modal>
  );
}
