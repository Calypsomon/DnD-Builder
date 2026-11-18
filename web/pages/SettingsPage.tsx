import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { type RuleOptions, rulesFromSettings } from "../../shared/rules/options";
import { api, type Meta } from "../api/client";
import { Button, Card, Checkbox } from "../components/ui";

/** Re-import game data from the wiki; shows progress while running */
function ImportControls({ onDone }: { onDone: () => void }) {
  const s = useQuery({ queryKey: ["importStatus"], queryFn: api.importStatus, refetchInterval: (q) => (q.state.data?.running ? 2000 : false) });
  const [wasRunning, setWasRunning] = useState(false);
  const running = !!s.data?.running;
  useEffect(() => {
    if (running) setWasRunning(true);
    else if (wasRunning) {
      setWasRunning(false);
      onDone();
    }
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = async (refresh: boolean) => {
    await api.startImport(refresh);
    await s.refetch();
  };
  const st = s.data?.status;
  return (
    <div className="flex flex-col gap-1.5">
      {running && st ? (
        <p className="text-sm">
          Importing… <b>{st.phase}</b> {st.phaseTotal ? `${st.phaseDone}/${st.phaseTotal}` : ""} · {st.pagesFetched} pages downloaded
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void start(false)}>Re-import (from cache)</Button>
          <Button size="sm" onClick={() => void start(true)}>Re-download from wiki</Button>
        </div>
      )}
      <p className="text-xs text-muted">
        Re-import applies updated parsers and rule effects quickly. Re-download fetches all ~2,000 pages again (~35 minutes). The report is in data/import-report.md.
      </p>
    </div>
  );
}

const SOURCE_KINDS: { id: RuleOptions["sources"][number]; label: string }[] = [
  { id: "official", label: "Official books" },
  { id: "ua", label: "Unearthed Arcana" },
  { id: "homebrew", label: "Wiki homebrew" },
];

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["meta"], queryFn: api.meta });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rules = rulesFromSettings(q.data?.settings);

  // saved on every change; open characters pick the new rules up right away
  async function setRules(patch: Partial<RuleOptions>) {
    setError(null);
    const next = { ...rules, ...patch };
    qc.setQueryData(["meta"], (m: Meta | undefined) => (m ? { ...m, settings: { ...m.settings, rules: next } } : m));
    try {
      await api.saveSettings({ ...(q.data?.settings ?? {}), rules: next });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      void qc.invalidateQueries({ queryKey: ["meta"] });
    }
  }
  const toggleSource = (id: RuleOptions["sources"][number], on: boolean) =>
    void setRules({ sources: on ? [...rules.sources.filter((x) => x !== id), id] : rules.sources.filter((x) => x !== id) });

  const meta = q.data;
  const counts = Object.entries(meta?.counts ?? {});

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      {q.isError && <div className="text-sm text-danger">Could not load settings: {(q.error as Error).message}</div>}

      <Card
        title="Table rules"
        actions={
          <span className="text-xs">
            {saved && <span className="text-ok">Saved</span>}
            {error && <span className="text-danger">{error}</span>}
          </span>
        }
      >
        <div className="space-y-2 text-sm">
          <p className="text-xs text-muted">These rules apply to all characters. Your own custom content is always available.</p>
          <div>
            <div className="mb-1 text-xs font-medium text-muted">Allowed sources</div>
            <div className="flex flex-wrap gap-4">
              {SOURCE_KINDS.map((s) => (
                <Checkbox key={s.id} label={s.label} checked={rules.sources.includes(s.id)} onChange={(v) => toggleSource(s.id, v)} />
              ))}
            </div>
          </div>
          <Checkbox label="Feats (choose a feat instead of an ability score improvement)" checked={rules.featsAllowed} onChange={(v) => void setRules({ featsAllowed: v })} />
          <Checkbox
            label="Optional class features (Tasha's, e.g. Primal Knowledge, Martial Versatility)"
            checked={rules.optionalFeatures}
            onChange={(v) => void setRules({ optionalFeatures: v })}
          />
          <Checkbox
            label="Customize origin (choose your own species ability increases, Tasha's)"
            checked={rules.customizeOrigin}
            onChange={(v) => void setRules({ customizeOrigin: v })}
          />
        </div>
      </Card>

      <Card title="Game data">
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-xs font-medium text-muted">Last import</div>
            {meta?.lastImport ? (
              <div>
                {fmt(meta.lastImport.finished_at ?? meta.lastImport.started_at)} — {meta.lastImport.pages_fetched} pages,{" "}
                {meta.lastImport.entries_written} entries, {meta.lastImport.warnings} warnings
              </div>
            ) : (
              <div className="text-muted">No import has been run yet.</div>
            )}
          </div>
          <ImportControls onDone={() => void qc.invalidateQueries()} />
          <table className="w-full max-w-md text-left">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="py-1 font-medium">Table</th>
                <th className="py-1 text-right font-medium">Wiki</th>
                <th className="py-1 text-right font-medium">Custom</th>
              </tr>
            </thead>
            <tbody>
              {counts.map(([t, c]) => (
                <tr key={t} className="border-b border-line last:border-0">
                  <td className="py-1">{t}</td>
                  <td className="py-1 text-right tabular-nums">{c.wiki}</td>
                  <td className="py-1 text-right tabular-nums">{c.custom}</td>
                </tr>
              ))}
              {counts.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-2 text-muted">
                    No data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Database & backup">
        <div className="space-y-1 text-sm">
          <div>
            Database location: <code className="rounded bg-panel2 px-1">data/dndbuilder.db</code>
          </div>
          <div className="text-muted">
            Run backup.bat to create a copy in <code className="rounded bg-panel2 px-1">data/backups</code>.
          </div>
        </div>
      </Card>
    </div>
  );
}
