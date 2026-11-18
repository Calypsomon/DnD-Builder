import type { Character } from "../../shared/types/character";
import type { ContentBundle, ContentRow, ContentTable } from "../../shared/types/content";

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      msg = j.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export interface CharacterListEntry {
  id: string;
  name: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface Meta {
  counts: Record<string, { wiki: number; custom: number }>;
  lastImport: { started_at: string; finished_at: string | null; pages_fetched: number; entries_written: number; warnings: number } | null;
  settings: Record<string, unknown>;
}

export interface ImportStatusResponse {
  running: boolean;
  status: {
    state: "running" | "done" | "error";
    phase: string;
    phaseDone: number;
    phaseTotal: number;
    pagesFetched: number;
    pagesFromCache: number;
    startedAt: string;
    finishedAt?: string;
    error?: string;
  } | null;
}

export type HomebrewInput = Pick<ContentRow<any>, "name" | "description" | "data" | "effects" | "choices"> & { source?: string };

export const api = {
  meta: () => request<Meta>("GET", "/api/meta"),
  saveSettings: (s: Record<string, unknown>) => request("PUT", "/api/settings", s),
  bundle: () => request<ContentBundle>("GET", "/api/content/bundle"),
  importStatus: () => request<ImportStatusResponse>("GET", "/api/import/status"),
  startImport: (refresh = false) => request("POST", "/api/import/start", { refresh }),
  listCharacters: () => request<CharacterListEntry[]>("GET", "/api/characters"),
  createCharacter: (name?: string) => request<Character>("POST", "/api/characters", { name }),
  getCharacter: (id: string) => request<Character>("GET", `/api/characters/${id}`),
  saveCharacter: (c: Character, summary: string) =>
    request<{ ok: true }>("PUT", `/api/characters/${c.id}`, { build: c.build, state: c.state, inventory: c.inventory, custom: c.custom, summary }),
  duplicateCharacter: (id: string) => request<Character>("POST", `/api/characters/${id}/duplicate`),
  deleteCharacter: (id: string) => request("DELETE", `/api/characters/${id}`),
  exportUrl: (id: string) => `/api/characters/${id}/export`,
  importCharacter: (json: unknown) => request<Character>("POST", "/api/characters/import", json),
  createHomebrew: (table: ContentTable, row: HomebrewInput) => request<ContentRow<any>>("POST", `/api/homebrew/${table}`, row),
  updateHomebrew: (table: ContentTable, id: string, row: HomebrewInput) =>
    request<ContentRow<any>>("PUT", `/api/homebrew/${table}/${encodeURIComponent(id)}`, row),
  homebrewUsage: (table: ContentTable, id: string) =>
    request<{ id: string; name: string }[]>("GET", `/api/homebrew/${table}/${encodeURIComponent(id)}/usage`),
  deleteHomebrew: (table: ContentTable, id: string) => request("DELETE", `/api/homebrew/${table}/${encodeURIComponent(id)}`),
};
