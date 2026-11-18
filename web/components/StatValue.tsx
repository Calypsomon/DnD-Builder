import { useState, type ReactNode } from "react";
import type { Stat } from "../../shared/types/sheet";
import { cx } from "./ui";

export const fmtSigned = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Shows a computed value; hovering shows its breakdown */
export function StatValue({ stat, signed, className, suffix }: { stat: Stat; signed?: boolean; className?: string; suffix?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span className={cx("cursor-help border-b border-dotted border-muted/60", className)}>
        {signed ? fmtSigned(stat.total) : stat.total}
        {suffix}
      </span>
      {open && stat.parts.length > 0 && (
        <span className="absolute left-1/2 top-full z-40 mt-1 w-max max-w-72 -translate-x-1/2 rounded-md border border-line bg-panel p-2 text-left text-xs font-normal text-fg shadow-lg">
          {stat.parts.map((p, i) => (
            <span key={i} className="flex justify-between gap-4">
              <span className="text-muted">{p.label}</span>
              <span className="tabular-nums">{i === 0 && !signed ? p.value : fmtSigned(p.value)}</span>
            </span>
          ))}
          <span className="mt-1 flex justify-between gap-4 border-t border-line pt-1 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{signed ? fmtSigned(stat.total) : stat.total}</span>
          </span>
        </span>
      )}
    </span>
  );
}

/** Box with a label and a big value (AC, HP, ...) */
export function StatBox({ label, children, small }: { label: string; children: ReactNode; small?: ReactNode }) {
  return (
    <div className="flex min-w-20 flex-col items-center rounded-lg border border-line bg-panel px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{children}</span>
      {small && <span className="text-xs text-muted">{small}</span>}
    </div>
  );
}
