import { Link } from "react-router-dom";
import { Card, Field, Input, TextArea } from "../components/ui";
import { useBuilder } from "./context";

export default function OverviewTab({ goTo }: { goTo: (tab: string) => void }) {
  const { character, sheet, update } = useBuilder();
  const b = character.build;
  const setDetail = (k: keyof typeof b.details, v: string) => update((c) => void (c.build.details[k] = v));

  const todo: { text: string; tab: string }[] = [];
  if (!b.speciesId) todo.push({ text: "Choose a species", tab: "origin" });
  if (!b.backgroundId) todo.push({ text: "Choose a background", tab: "origin" });
  if (!b.classId) todo.push({ text: "Choose a class", tab: "class" });
  for (const c of sheet.openChoices) {
    todo.push({
      text: `${c.choice.label} — ${c.ownerName}${c.location === "class" ? ` (level ${c.charLevel})` : ""}`,
      tab: c.location === "class" ? "class" : "origin",
    });
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Character">
        <div className="grid gap-3">
          <Field label="Name">
            <Input value={b.name} onChange={(e) => update((c) => void (c.build.name = e.target.value))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Alignment">
              <Input value={b.details.alignment} onChange={(e) => setDetail("alignment", e.target.value)} />
            </Field>
            <Field label="Age">
              <Input value={b.details.age} onChange={(e) => setDetail("age", e.target.value)} />
            </Field>
          </div>
          <Field label="Appearance">
            <TextArea rows={2} value={b.details.appearance} onChange={(e) => setDetail("appearance", e.target.value)} />
          </Field>
          <Field label="Backstory">
            <TextArea rows={4} value={b.details.backstory} onChange={(e) => setDetail("backstory", e.target.value)} />
          </Field>
          <Field label="Notes">
            <TextArea rows={3} value={b.details.notes} onChange={(e) => setDetail("notes", e.target.value)} />
          </Field>
        </div>
      </Card>
      <div className="flex flex-col gap-3">
        <Card title={todo.length ? `To do (${todo.length})` : "To do"} highlight={todo.length > 0}>
          {todo.length === 0 ? (
            <p className="text-sm text-ok">All choices made.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {todo.map((t, i) => (
                <li key={i}>
                  <button className="cursor-pointer text-left hover:text-accent" onClick={() => goTo(t.tab)}>
                    <span className="text-danger">●</span> {t.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {sheet.warnings.length > 0 && (
          <Card title="Warnings">
            <ul className="space-y-1 text-sm text-warn">
              {sheet.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          </Card>
        )}
        <p className="text-xs text-muted">
          Sources, feats, optional class features and custom origins are table rules for all characters. Change them in{" "}
          <Link to="/settings" className="text-accent hover:underline">
            Settings
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
