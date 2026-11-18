import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "./db/client";
import { readStatus } from "../importer/status";

let child: ChildProcess | null = null;

/** Command to run the importer: the prebuilt bundle next to the server bundle, or the TypeScript source in development */
function importerCommand(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const bundled = resolve(here, "importer.mjs");
  if (existsSync(bundled)) return ["--disable-warning=ExperimentalWarning", bundled];
  return ["--import", "tsx", resolve(ROOT, "importer/main.ts")];
}

export function importRunning(): boolean {
  return !!child && child.exitCode === null;
}

/** Start the importer as a separate process (no-op if one is already running) */
export function startImport(args: string[] = []): boolean {
  if (importRunning()) return false;
  child = spawn(process.execPath, [...importerCommand(), ...args], { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
  child.on("exit", (code) => {
    console.log(code === 0 ? "Game data import finished." : `Game data import stopped (exit code ${code}).`);
  });
  return true;
}

export function importStatus() {
  const s = readStatus();
  return { running: importRunning(), status: s };
}
