import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { type ContentIndex, indexContent } from "../../shared/engine/contentIndex";
import { api } from "./client";

const ContentContext = createContext<ContentIndex | null>(null);

/** Loads the full content bundle once and provides the index to all components */
export function ContentProvider({ children }: { children: ReactNode }) {
  const q = useQuery({ queryKey: ["bundle"], queryFn: api.bundle, staleTime: Infinity });
  const idx = useMemo(() => (q.data ? indexContent(q.data) : null), [q.data]);
  if (q.isError) return <div className="p-8 text-danger">Could not load game data: {(q.error as Error).message}</div>;
  if (!idx) return <div className="p-8 text-muted">Loading game data…</div>;
  if (idx.bundle.classes.length === 0) return <ImportScreen />;
  return <ContentContext.Provider value={idx}>{children}</ContentContext.Provider>;
}

/** Shown while the database is empty: progress of the first import */
function ImportScreen() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["importStatus"], queryFn: api.importStatus, refetchInterval: 2000 });
  const st = s.data?.status;
  const running = s.data?.running;
  useEffect(() => {
    if (st?.state === "done" && !running) void qc.invalidateQueries({ queryKey: ["bundle"] });
  }, [st?.state, running, qc]);
  const pct = st?.phaseTotal ? Math.round((st.phaseDone / st.phaseTotal) * 100) : 0;
  const pages = st?.pagesFetched ?? 0;
  return (
    <div className="mx-auto mt-12 max-w-lg rounded-lg border border-line bg-panel p-5">
      <h1 className="font-serif text-xl font-bold">Preparing game data</h1>
      <p className="mt-1 text-sm text-muted">
        On the first start the app downloads classes, species, spells and items from dnd5e.wikidot.com (about 2,000 pages, ~35 minutes). This only happens once — you can leave this tab open.
      </p>
      {running && st ? (
        <div className="mt-4">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{st.phase}</span>
            <span className="text-muted">{st.phaseTotal ? `${st.phaseDone}/${st.phaseTotal}` : ""}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded bg-panel2">
            <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {pages} of ~2000 pages downloaded · step {["Classes & subclasses", "Species", "Backgrounds", "Feats", "Spells", "Items", "Saving"].indexOf(st.phase) + 1}/7
          </p>
        </div>
      ) : st?.state === "error" ? (
        <div className="mt-4 text-sm text-danger">
          Import failed: {st.error}
          <div className="mt-2">
            <button className="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-accent-fg" onClick={() => void api.startImport().then(() => s.refetch())}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 text-sm">
          <button className="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-accent-fg" onClick={() => void api.startImport().then(() => s.refetch())}>
            Start import
          </button>
        </div>
      )}
    </div>
  );
}

export function useContent(): ContentIndex {
  const idx = useContext(ContentContext);
  if (!idx) throw new Error("useContent outside ContentProvider");
  return idx;
}

/** Call after homebrew changes to reload the bundle */
export function useReloadContent() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["bundle"] });
}
