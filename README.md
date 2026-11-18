# D&D Builder

Local character builder for D&D 5e (2014 rules), inspired by Pathbuilder 2e. Game data comes from dnd5e.wikidot.com; everything is stored locally in SQLite. Runs only on your own PC (`127.0.0.1`), nothing is reachable from the network.

## Quick start (Windows)

1. Download the repository (green **Code** button → **Download ZIP**) and unpack it.
2. Double-click **`start.bat`**.

That's it — nothing to install:

- If Node.js 22.13+ is not installed, `start.bat` downloads a portable Node.js once into `runtime\` (about 30 MB, verified against the official checksums, no admin rights needed).
- On the first start the app downloads the game data from dnd5e.wikidot.com in the background (about 2,000 pages, ~35 minutes, needs internet). The browser shows the progress. This happens only once.
- Close the console window to stop the app.

| File | Purpose |
|---|---|
| `start.bat` | Starts the app and opens it in the browser |
| `import-data.bat` | Re-imports the game data (`--refresh` downloads all pages again, `--only=spells` one category, `--offline` cache only). Also available in the app under **Settings**. |
| `backup.bat` | Copies the database to `data\backups\` |

Your characters and homebrew live in `data\dndbuilder.db`.

The game data is not part of this repository: most of it is copyrighted by Wizards of the Coast and is only downloaded for personal use on your own PC.

## Development

Requires Node.js 22.13+ and npm.

```
npm install
npm run dev:server   # API on 127.0.0.1:4810 (TypeScript sources)
npm run dev:web      # UI with hot reload on 127.0.0.1:5173
npm test             # engine and parser tests (reference characters need imported data)
npm run typecheck
npm run build        # builds dist/ (UI + bundled server/importer) — commit dist/ so start.bat works without npm
```

## Structure

- `importer/` – wiki download (cache in `importer/cache/`), parsers, writing to SQLite
- `data/effects/*.json` – hand-maintained rule effects (Rage, Unarmored Defense, Alert …), applied on import
- `data/overrides/*.json` – corrections of parsed values, survive every import
- `server/` – Fastify API, Node's built-in SQLite (`node:sqlite`)
- `shared/engine/` – rules engine (`computeSheet`), runs in the browser
- `web/` – React UI
- `dist/` – prebuilt app used by `start.bat`
- `docs/BAUPLAN_PROTOTYP.md` – design document (German)

Nils leck eier 