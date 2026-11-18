import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../api/client";
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

const SOURCE_KINDS = [
  { id: "official", label: "Official" },
  { id: "ua", label: "Unearthed Arcana" },
  { id: "homebrew", label: "Homebrew" },
];

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["meta"], queryFn: api.meta });
  const [sources, setSources] = useState<string[]>(["official"]);
  const [featsAllowed, setFeatsAllowed] = useState(false);
  const [customizeOrigin, setCustomizeOrigin] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = q.data?.settings;
    if (!s) return;
    if (Array.isArray(s.defaultSources)) setSources(s.defaultSources as string[]);
    if (typeof s.featsAllowed === "boolean") setFeatsAllowed(s.featsAllowed);
    if (typeof s.customizeOrigin === "boolean") setCustomizeOrigin(s.customizeOrigin);
  }, [q.data]);

  async function save() {
    setError(null);
    try {
      await api.saveSettings({ ...(q.data?.settings ?? {}), defaultSources: sources, featsAllowed, customizeOrigin });
      qc.invalidateQueries({ queryKey: ["meta"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const meta = q.data;
  const counts = Object.entries(meta?.counts ?? {});

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      {q.isError && <div className="text-sm text-danger">Could not load settings: {(q.error as Error).message}</div>}

      <Card title="Defaults for new characters">
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-medium text-muted">Default sources</div>
            <div className="flex flex-wrap gap-4">
              {SOURCE_KINDS.map((s) => (
                <Checkbox
                  key={s.id}
                  label={s.label}
                  checked={sources.includes(s.id)}
                  onChange={(v) => setSources((cur) => (v ? [...cur.filter((x) => x !== s.id), s.id] : cur.filter((x) => x !== s.id)))}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <Checkbox label="Feats allowed by default" checked={featsAllowed} onChange={setFeatsAllowed} />
            <Checkbox label="Customize origin by default" checked={customizeOrigin} onChange={setCustomizeOrigin} />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={save}>
              Save settings
            </Button>
            {saved && <span className="text-sm text-ok">Saved</span>}
            {error && <span className="text-sm text-danger">{error}</span>}
          </div>
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
