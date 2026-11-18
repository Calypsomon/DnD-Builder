import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONFIG, ROOT } from "../server/db/client";

const CACHE_DIR = resolve(ROOT, CONFIG.import.cacheDir);
const MIN_INTERVAL = 1000 / CONFIG.import.requestsPerSecond;
let lastRequest = 0;

export const stats = { fetched: 0, cached: 0, failed: [] as string[] };

export function cachePath(slug: string) {
  const safe = slug === "" ? "_home" : slug.replace(/:/g, "__").replace(/[\/\\?*"<>|]/g, "_");
  return resolve(CACHE_DIR, `${safe}.html`);
}

export function isCached(slug: string) {
  return existsSync(cachePath(slug));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Get the HTML of a wiki page, from cache if present. Returns null when the page could not be fetched. */
export async function getPage(slug: string, opts: { refresh?: boolean } = {}): Promise<string | null> {
  const file = cachePath(slug);
  if (!opts.refresh && existsSync(file)) {
    stats.cached++;
    return readFileSync(file, "utf8");
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  const url = `${CONFIG.import.baseUrl}/${slug}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const wait = lastRequest + MIN_INTERVAL - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (local character builder; personal use)" } });
      if (res.status === 404) {
        stats.failed.push(`${slug} (404)`);
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      writeFileSync(file, html, "utf8");
      stats.fetched++;
      return html;
    } catch (err) {
      if (attempt === 3) {
        stats.failed.push(`${slug} (${(err as Error).message})`);
        return null;
      }
      await sleep(2000 * attempt);
    }
  }
  return null;
}

/** Read a cached page synchronously (used by parsers and tests) */
export function readCached(slug: string): string | null {
  const file = cachePath(slug);
  if (!existsSync(file)) return null;
  stats.cached++;
  return readFileSync(file, "utf8");
}
