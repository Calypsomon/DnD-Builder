import { useState } from "react";
import type { ContentRow } from "../../shared/types/content";
import type { ChoiceInstance } from "../../shared/types/sheet";
import { ChoicePicker, OptionModal } from "../components/ChoicePicker";
import { Markdown } from "../components/Markdown";
import { Button, SourceBadge, cx } from "../components/ui";
import { useBuilder } from "./context";

/** Collapsible feature/trait entry */
export function FeatureItem({ row, level, extra }: { row: Pick<ContentRow<any>, "id" | "name" | "description" | "source" | "origin">; level?: number; extra?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line py-1.5 last:border-0">
      <button className="flex w-full cursor-pointer items-center gap-2 text-left text-sm" onClick={() => setOpen(!open)}>
        <span className="text-xs text-muted">{open ? "▾" : "▸"}</span>
        <span className="font-medium">{row.name}</span>
        {level != null && <span className="text-xs text-muted">Level {level}</span>}
        <span className="ml-auto">
          <SourceBadge source={row.source} origin={row.origin} />
        </span>
      </button>
      {open && <div className="pb-2 pl-5 pt-1">{row.description ? <Markdown text={row.description} /> : <p className="text-sm text-muted">No description.</p>}</div>}
      {extra && <div className="pl-5">{extra}</div>}
    </div>
  );
}

/** Renders a list of choice instances with ChoicePickers */
export function ChoiceList({ items }: { items: ChoiceInstance[] }) {
  const { character, sheet, update } = useBuilder();
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {items.map((ci) => (
        <div key={ci.key} className={cx("rounded-md border p-2", ci.open ? "border-danger/60" : "border-line")}>
          <ChoicePicker
            instance={ci}
            build={character.build}
            maxSpellLevel={sheet.spellcasting?.maxSpellLevel}
            onChange={(ids) => update((c) => void (c.build.choices[ci.key] = ids))}
          />
          {ci.ownerName && <p className="mt-1 text-[11px] text-muted">from {ci.ownerName}</p>}
        </div>
      ))}
    </div>
  );
}

/** Button + modal to pick one content row */
export function RowPicker({
  label,
  rows,
  value,
  onPick,
  detail,
}: {
  label: string;
  rows: ContentRow<any>[];
  value: string | null;
  onPick: (id: string) => void;
  detail?: (r: ContentRow<any>) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const { idx } = useBuilder();
  const current = value ? idx.byId.get(value) : null;
  return (
    <>
      <Button variant={current ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {current ? `Change ${label.toLowerCase()}` : `Choose ${label.toLowerCase()}…`}
      </Button>
      <OptionModal
        open={open}
        onClose={() => setOpen(false)}
        title={`Choose ${label.toLowerCase()}`}
        count={1}
        selected={value ? [value] : []}
        options={rows.map((r) => ({ id: r.id, name: r.name, description: r.description, source: r.origin === "custom" ? "Custom" : r.source, detail: detail?.(r) }))}
        onToggle={(id) => {
          onPick(id);
          setOpen(false);
        }}
      />
    </>
  );
}
