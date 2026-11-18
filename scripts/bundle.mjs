// Bundles server, importer and backup into self-contained files in dist/.
// The bundles only need Node.js (no node_modules), so a downloaded repo runs without `npm install`.
import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  // CommonJS dependencies (fastify, ...) need `require` inside an ES module bundle
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
};

await build({ ...common, entryPoints: { server: "server/main.ts", importer: "importer/main.ts", backup: "server/backup.ts" }, outdir: "dist" });
// rename to .mjs so Node treats them as ES modules without a package.json next to them
import { renameSync } from "node:fs";
for (const n of ["server", "importer", "backup"]) renameSync(`dist/${n}.js`, `dist/${n}.mjs`);
console.log("Bundled dist/server.mjs, dist/importer.mjs, dist/backup.mjs");
