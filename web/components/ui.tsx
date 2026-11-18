import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useEffect } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({ variant = "secondary", size = "md", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer",
        size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
        variant === "primary" && "bg-accent text-accent-fg hover:opacity-90",
        variant === "secondary" && "border border-line bg-panel hover:bg-panel2",
        variant === "ghost" && "hover:bg-panel2",
        variant === "danger" && "border border-danger text-danger hover:bg-danger hover:text-white",
        className,
      )}
    />
  );
}

export function Card({ title, actions, children, className, highlight }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; highlight?: boolean }) {
  return (
    <section className={cx("rounded-lg border bg-panel", highlight ? "border-danger" : "border-line", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-2.5 py-1.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-2.5">{children}</div>
    </section>
  );
}

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "accent" | "danger" | "ok" | "warn"; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tone === "neutral" && "bg-panel2 text-muted",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "danger" && "bg-danger text-white",
        tone === "ok" && "bg-ok text-white",
        tone === "warn" && "bg-warn text-white",
      )}
    >
      {children}
    </span>
  );
}

export function SourceBadge({ source, origin }: { source?: string; origin?: string }) {
  if (origin === "custom") return <Badge tone="accent">Custom</Badge>;
  if (!source) return null;
  return <Badge tone={source === "UA" ? "warn" : "neutral"}>{source}</Badge>;
}

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={cx("rounded-md border border-line bg-panel px-2 py-1 text-sm outline-none focus:border-accent", p.className)}
    />
  );
}

export function TextArea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...p}
      className={cx("w-full rounded-md border border-line bg-panel px-2 py-1 text-sm outline-none focus:border-accent", p.className)}
    />
  );
}

export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...p}
      className={cx("rounded-md border border-line bg-panel px-2 py-1 text-sm outline-none focus:border-accent", className)}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cx("inline-flex items-center gap-1.5 text-sm", disabled ? "opacity-50" : "cursor-pointer")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--color-accent)]" />
      {label}
    </label>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "-mb-px border-b-2 px-2.5 py-1.5 text-sm font-medium cursor-pointer",
            value === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[6vh]" onMouseDown={onClose}>
      <div
        className={cx("flex max-h-[88vh] w-full flex-col rounded-lg border border-line bg-panel shadow-xl", wide ? "max-w-4xl" : "max-w-xl")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="text-muted hover:text-fg cursor-pointer text-xl leading-none" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

export function confirmDialog(message: string) {
  return window.confirm(message);
}
