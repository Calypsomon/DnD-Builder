import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ZodError } from "zod";
import { CONFIG, ROOT, openDb } from "./db/client";
import { characterRoutes } from "./routes/characters";
import { contentRoutes } from "./routes/content";
import { contentCounts } from "./db/client";
import { startImport } from "./importRunner";

const HOST = "127.0.0.1"; // never reachable from other machines
const db = openDb();
const app = Fastify({ logger: false, bodyLimit: 20 * 1024 * 1024 });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: "Invalid data", issues: err.issues.slice(0, 10) });
  }
  console.error(err);
  return reply.code((err as any).statusCode ?? 500).send({ error: (err as Error).message });
});

contentRoutes(app, db);
characterRoutes(app, db);

const webDir = resolve(ROOT, "dist/web");
if (existsSync(webDir)) {
  await app.register(fastifyStatic, { root: webDir });
  // client-side routing: unknown non-API paths serve index.html
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
    return reply.sendFile("index.html");
  });
} else {
  app.get("/", async () => "UI not built yet. Run: npm run build");
}

await app.listen({ host: HOST, port: CONFIG.port });

// First start: no game data yet → download and import it in the background (progress is shown in the UI)
if (contentCounts(db).classes.wiki === 0) {
  console.log("No game data found. Importing from dnd5e.wikidot.com in the background (first time only, about 35 minutes)...");
  startImport();
}
console.log(`D&D Builder running at http://${HOST}:${CONFIG.port}  (close this window to stop)`);
