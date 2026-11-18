import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type CharacterListEntry } from "../api/client";
import { useContent } from "../api/content";
import { Button, Card, Empty, Input, Modal } from "../components/ui";

function formatEdited(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}

export default function CharacterListPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const content = useContent();
  const q = useQuery({ queryKey: ["characters"], queryFn: api.listCharacters });
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const create = useMutation({
    mutationFn: (n: string) => api.createCharacter(n.trim() || undefined),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      setNewOpen(false);
      nav(`/characters/${c.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => api.duplicateCharacter(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters"] }),
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteCharacter(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters"] }),
    onError: (e: Error) => setError(e.message),
  });
  const importer = useMutation({
    mutationFn: async (file: File) => api.importCharacter(JSON.parse(await file.text())),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      nav(`/characters/${c.id}`);
    },
    onError: (e: Error) => setError(`Import failed: ${e.message}`),
  });

  const list: CharacterListEntry[] = q.data ?? [];
  const noData = content.bundle.classes.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Characters</h1>
        <div className="flex gap-2">
          <Button onClick={() => fileRef.current?.click()}>Import JSON</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) {
                setError(null);
                importer.mutate(f);
              }
            }}
          />
          <Button
            variant="primary"
            onClick={() => {
              setName("");
              setError(null);
              setNewOpen(true);
            }}
          >
            New Character
          </Button>
        </div>
      </div>

      {noData && (
        <Card highlight>
          <p className="font-medium text-danger">No game data yet</p>
          <p className="text-sm">No game data yet — run import-data.bat in the program folder, then reload this page.</p>
        </Card>
      )}
      {error && <div className="rounded-md border border-danger p-2 text-sm text-danger">{error}</div>}

      {q.isLoading ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : q.isError ? (
        <div className="text-sm text-danger">Could not load characters: {(q.error as Error).message}</div>
      ) : list.length === 0 ? (
        <Empty>No characters yet. Click “New Character” to create your first hero, or import one from a JSON file.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <Card key={c.id}>
              <div className="flex h-full flex-col gap-3">
                <div>
                  <Link to={`/characters/${c.id}`} className="text-base font-semibold hover:text-accent">
                    {c.name || "Unnamed"}
                  </Link>
                  <div className="text-sm text-muted">{c.summary || "No species or class yet"}</div>
                  <div className="mt-1 text-xs text-muted" title={new Date(c.updatedAt).toLocaleString()}>
                    edited {formatEdited(c.updatedAt)}
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap gap-1.5">
                  <Link
                    to={`/characters/${c.id}`}
                    className="inline-flex items-center rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-fg hover:opacity-90"
                  >
                    Open
                  </Link>
                  <Button size="sm" onClick={() => duplicate.mutate(c.id)} disabled={duplicate.isPending}>
                    Duplicate
                  </Button>
                  <a
                    href={api.exportUrl(c.id)}
                    download
                    className="inline-flex items-center rounded-md border border-line bg-panel px-2 py-1 text-xs font-medium hover:bg-panel2"
                  >
                    Export
                  </a>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      if (window.confirm(`Delete "${c.name || "Unnamed"}"? This cannot be undone.`)) remove.mutate(c.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New Character"
        footer={
          <>
            <Button onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={create.isPending} onClick={() => create.mutate(name)}>
              Create
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(name);
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">Name</span>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Character name" />
          </label>
        </form>
      </Modal>
    </div>
  );
}
