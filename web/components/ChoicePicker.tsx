import { useMemo, useState } from "react";
import { type ChoiceOption, choiceOptions, displayName } from "../../shared/engine/choices";
import type { CharacterBuild } from "../../shared/types/character";
import type { ChoiceInstance } from "../../shared/types/sheet";
import { useContent } from "../api/content";
import { Markdown } from "./Markdown";
import { Badge, Button, Input, Modal, SourceBadge, cx } from "./ui";

/**
 * Renders one choice: short lists as inline toggle chips, long lists via a searchable modal.
 */
export function ChoicePicker({
  instance,
  build,
  onChange,
  maxSpellLevel,
  taken,
}: {
  instance: ChoiceInstance;
  build: CharacterBuild;
  onChange: (ids: string[]) => void;
  maxSpellLevel?: number;
  /** ids already chosen elsewhere (shown as disabled, e.g. skills already proficient) */
  taken?: Set<string>;
}) {
  const idx = useContent();
  const options = useMemo(() => choiceOptions(instance.choice, idx, build, maxSpellLevel), [instance.choice, idx, build, maxSpellLevel]);
  const selected = instance.selected;
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else if (instance.count === 1) onChange([id]);
    else if (selected.length < instance.count) onChange([...selected, id]);
  };

  const header = (
    <div className="mb-0.5 flex items-center gap-1.5 text-xs">
      <span className="font-semibold">{instance.choice.label}</span>
      <span className={cx(instance.open ? "text-danger" : "text-muted")}>
        {selected.length}/{instance.count}
      </span>
      {instance.open && <span className="h-1.5 w-1.5 rounded-full bg-danger" title="Open choice" />}
    </div>
  );

  // Short lists are shown inline as chips; descriptions appear when hovering a chip.
  if (options.length <= 40) {
    return (
      <div>
        {header}
        <div className="flex flex-wrap gap-1">
          {options.map((o) => {
            const on = selected.includes(o.id);
            const disabled = !on && (taken?.has(o.id) || (instance.count > 1 && selected.length >= instance.count));
            return <Chip key={o.id} option={o} on={on} disabled={!!disabled} onClick={() => toggle(o.id)} />;
          })}
          {options.length === 0 && <span className="text-xs text-muted">No options available (check source filter or import).</span>}
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-xs">
            {displayName(id, idx)}
            <button className="cursor-pointer text-muted hover:text-danger" onClick={() => toggle(id)} aria-label="Remove">
              ×
            </button>
          </span>
        ))}
        {selected.length < instance.count && (
          <Button size="sm" variant={instance.open ? "primary" : "secondary"} onClick={() => setOpen(true)}>
            {selected.length ? "Choose more…" : "Choose…"}
          </Button>
        )}
        {selected.length >= instance.count && selected.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            Change
          </Button>
        )}
      </div>
      <OptionModal
        open={open}
        onClose={() => setOpen(false)}
        title={instance.choice.label}
        options={options}
        selected={selected}
        count={instance.count}
        onToggle={toggle}
        taken={taken}
      />
    </div>
  );
}

export function OptionModal({
  open,
  onClose,
  title,
  options,
  selected,
  count,
  onToggle,
  taken,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  options: ChoiceOption[];
  selected: string[];
  count: number;
  onToggle: (id: string) => void;
  taken?: Set<string>;
}) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const filtered = options.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()) || o.detail?.toLowerCase().includes(q.toLowerCase()));
  const focused = options.find((o) => o.id === focus) ?? filtered[0];
  return (
    <Modal open={open} onClose={onClose} title={`${title} (${selected.length}/${count})`} wide footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex min-h-0 flex-col gap-2">
          <Input autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-[55vh] overflow-y-auto rounded-md border border-line">
            {filtered.map((o) => {
              const on = selected.includes(o.id);
              const disabled = !on && (taken?.has(o.id) || (count > 1 && selected.length >= count));
              return (
                <div
                  key={o.id}
                  onMouseEnter={() => setFocus(o.id)}
                  className={cx("flex items-center gap-2 border-b border-line px-2 py-1.5 text-sm last:border-0", focused?.id === o.id && "bg-panel2")}
                >
                  <input type={count === 1 ? "radio" : "checkbox"} checked={on} disabled={disabled} onChange={() => onToggle(o.id)} className="accent-[var(--color-accent)]" />
                  <button className="flex-1 cursor-pointer text-left" onClick={() => setFocus(o.id)}>
                    {o.name}
                    {o.detail && <span className="ml-2 text-xs text-muted">{o.detail}</span>}
                  </button>
                  <SourceBadge source={o.source} />
                </div>
              );
            })}
            {filtered.length === 0 && <div className="p-3 text-sm text-muted">No matches.</div>}
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto rounded-md border border-line p-3">
          {focused ? (
            <>
              <div className="mb-2 flex items-center gap-2">
                <h4 className="font-semibold">{focused.name}</h4>
                <SourceBadge source={focused.source} />
                {focused.detail && <Badge>{focused.detail}</Badge>}
              </div>
              {focused.description ? <Markdown text={focused.description} /> : <p className="text-sm text-muted">No description.</p>}
              <div className="mt-3">
                <Button
                  size="sm"
                  variant={selected.includes(focused.id) ? "danger" : "primary"}
                  disabled={!selected.includes(focused.id) && count > 1 && selected.length >= count}
                  onClick={() => onToggle(focused.id)}
                >
                  {selected.includes(focused.id) ? "Remove" : "Select"}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Select an entry to see details.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Toggle chip with an optional hover card for the description */
function Chip({ option: o, on, disabled, onClick }: { option: ChoiceOption; on: boolean; disabled: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <span className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        disabled={disabled}
        onClick={onClick}
        className={cx(
          "rounded border px-1.5 py-px text-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-35",
          on ? "border-accent bg-accent text-accent-fg" : "border-line bg-panel hover:border-accent",
        )}
      >
        {o.name}
        {o.detail && <span className="ml-1 opacity-70">{o.detail}</span>}
        {o.description && <span className="ml-1 opacity-50">ⓘ</span>}
      </button>
      {hover && o.description && (
        <span className="absolute left-0 top-full z-40 mt-1 block max-h-72 w-96 overflow-y-auto rounded-md border border-line bg-panel p-2 text-left shadow-lg">
          <span className="mb-1 flex items-center gap-2 text-xs font-semibold">
            {o.name} <SourceBadge source={o.source} />
          </span>
          <Markdown text={o.description} className="text-xs" />
        </span>
      )}
    </span>
  );
}
