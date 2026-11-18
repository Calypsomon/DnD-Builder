import { Fragment, type ReactNode } from "react";

/** Inline: **bold**, *italic* */
function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = key;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2]) out.push(<strong key={i++}>{m[2]}</strong>);
    else out.push(<em key={i++}>{m[3]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Minimal renderer for the light markdown produced by the importer */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = (text ?? "").split(/\n{2,}/);
  const out: ReactNode[] = [];
  blocks.forEach((block, bi) => {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) return;
    if (lines.every((l) => l.trim().startsWith("|"))) {
      const rows = lines.filter((l) => !/^\|\s*-{3}/.test(l.trim()) && !/^\|(-{3}\|)+$/.test(l.trim()));
      const cells = rows.map((r) =>
        r
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim()),
      );
      out.push(
        <table key={bi}>
          <tbody>
            {cells.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (ri === 0 ? <th key={ci}>{inline(c)}</th> : <td key={ci}>{inline(c)}</td>))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      return;
    }
    const nodes: ReactNode[] = [];
    let list: string[] = [];
    const flush = () => {
      if (list.length) {
        nodes.push(
          <ul key={`l${nodes.length}`}>
            {list.map((li, i) => (
              <li key={i}>{inline(li)}</li>
            ))}
          </ul>,
        );
        list = [];
      }
    };
    for (const l of lines) {
      const t = l.trim();
      if (t.startsWith("- ")) list.push(t.slice(2));
      else if (t.startsWith("### ")) {
        flush();
        nodes.push(<h3 key={`h${nodes.length}`}>{inline(t.slice(4))}</h3>);
      } else {
        flush();
        nodes.push(<p key={`p${nodes.length}`}>{inline(t)}</p>);
      }
    }
    flush();
    out.push(<Fragment key={bi}>{nodes}</Fragment>);
  });
  return <div className={`md leading-relaxed ${className?.includes("text-") ? className : `text-sm ${className ?? ""}`}`}>{out}</div>;
}
