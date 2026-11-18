import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ROOT } from "../server/db/client";

/** Progress of a running import, shared with the server through data/import-status.json */
export interface ImportStatus {
  state: "running" | "done" | "error";
  phase: string;
  phaseDone: number;
  phaseTotal: number;
  pagesFetched: number;
  pagesFromCache: number;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  pid?: number;
}

export const STATUS_FILE = resolve(ROOT, "data/import-status.json");

let last = 0;
export function writeStatus(s: ImportStatus, force = false) {
  const now = Date.now();
  if (!force && now - last < 1000) return; // at most once per second
  last = now;
  mkdirSync(dirname(STATUS_FILE), { recursive: true });
  writeFileSync(STATUS_FILE, JSON.stringify(s), "utf8");
}

export function readStatus(): ImportStatus | null {
  if (!existsSync(STATUS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATUS_FILE, "utf8"));
  } catch {
    return null;
  }
}
