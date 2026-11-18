# Bauplan Prototyp – D&D 5e Character Builder

Stand: 18.11.2026 · Regelwerk: D&D 5e (2014) · Datenquelle: dnd5e.wikidot.com · Nutzung: privat, lokal

---

## 1. Ziel des Prototyps

Ein lokal laufendes Programm, gestartet per Doppelklick auf `start.bat`, das im Browserfenster läuft. Damit lässt sich ein D&D‑5e‑Charakter mit **einer Klasse von Stufe 1 bis 20** vollständig bauen, in SQLite speichern und als Charakterbogen anzeigen. Alle Klassen, Unterklassen, Völker, Hintergründe, Talente, Zauber und Gegenstände kommen aus dem Wiki. Eigene Waffen, Rüstungen, Gegenstände und Fähigkeiten lassen sich zusätzlich anlegen.

### Abnahmekriterien („fertig“, wenn …)

1. Doppelklick auf `start.bat` → nach der Erstinstallation öffnet sich die App in unter 10 s im Browser.
2. Der Server ist nur über `127.0.0.1` erreichbar, nicht von anderen Geräten im Netzwerk.
3. `import-data.bat` füllt die Datenbank mit allen Kategorien und schreibt einen Import-Bericht.
4. Die fünf Referenzcharaktere aus Abschnitt 12 lassen sich über die Oberfläche bauen, und alle berechneten Werte stimmen.
5. Eine eigene Waffe und eine eigene Fähigkeit lassen sich anlegen, einem Charakter geben, und die Werte ändern sich korrekt.
6. Nach einem Neustart sind alle Charaktere und eigenen Inhalte unverändert da.

---

## 2. Umfang

| Im Prototyp | Später (nach dem Prototyp) |
|---|---|
| Start, Stop und Backup per `.bat`, lokaler Server, SQLite | Multiclassing (das Datenmodell ist dafür vorbereitet) |
| Import **aller** Kategorien aus dem Wiki (Werte + Texte) | Regelwirkungen für Bücher außer dem PHB |
| Regelwirkungen (Automatik) für PHB-Inhalte + alles, was aus Tabellen ableitbar ist | Optionale Klassenmerkmale aus Tasha's |
| Charakterliste: neu, öffnen, duplizieren, löschen | Assistent für Startausrüstung (im Prototyp: Hinweistext + manuell hinzufügen) |
| Attribute: Point Buy, Standard Array, manuell (Würfelergebnisse manuell eintragen) | Würfeln, Zustände, Konzentration |
| Herkunft: Volk + Unterart (+ Quellenvariante), Hintergrund, „Customize Origin“-Schalter | PDF/Druck |
| Eine Klasse, Stufe 1–20, Unterklasse, alle Klassenwahlen (Fertigkeiten, Kampfstil, Expertise, ASI/Talent, Manöver, Invocations …) | Eigene Zauber, Völker, Klassen, Unterklassen |
| Zauberwirken für eine Klasse: Plätze, SG, Angriff, Anzahlen, Auswahl, immer vorbereitete Zauber | Begleiter, Wildgestalt-Statblöcke, Familiar |
| Inventar: Katalog, hinzufügen, ausrüsten, einstimmen, Gewicht, Geld | Traglast-Variante, Verlauf der Stufenaufstiege |
| Charakterbogen mit TP-Tracking, Zauberplätzen, Ressourcen, kurzer/langer Rast | |
| Homebrew-Editor: Waffe, Rüstung, Gegenstand, Fähigkeit/Talent mit Effekt-Baukasten | |
| Einmalige Boni für einen einzelnen Charakter | |
| Quellenfilter (Official / Unearthed Arcana / Homebrew aus dem Wiki) | |
| JSON-Export/Import einzelner Charaktere | |

---

## 3. Systemüberblick

```
┌───────────────┐   einmalig / bei Bedarf    ┌──────────────────────┐
│ dnd5e.wikidot │ ─────────────────────────► │ importer/            │
└───────────────┘   (1 Anfrage/s, Cache)     │ fetch → parse → write│
                                             └──────────┬───────────┘
                                                        ▼
┌──────────────────────┐   REST (JSON)   ┌──────────────────────────┐
│ Browser: web/ (React)│ ◄─────────────► │ server/ (Fastify)        │
│  + shared/engine     │  127.0.0.1 only │  + data/dndbuilder.db    │
└──────────────────────┘                 └──────────────────────────┘
```

- **importer/** liest das Wiki, wandelt die Seiten in strukturierte Daten um und schreibt sie in SQLite.
- **server/** liefert die gebaute Oberfläche und eine kleine REST-API aus und verwaltet die Datenbank.
- **web/** ist die Oberfläche (Englisch). Die **Regel-Engine (`shared/engine`) läuft im Browser**: Jede Änderung wird sofort neu berechnet, der Server speichert nur.
- **shared/** enthält Typen, Zod-Schemas und die Engine. Importer, Server und Oberfläche nutzen sie gemeinsam.

### Ablauf von `start.bat`

1. Prüft, ob `node` vorhanden ist. Wenn nicht: verständliche Meldung, dann Abbruch.
2. Fehlt `node_modules/`, läuft `npm install`.
3. Fehlt der Build (`dist/`), läuft `npm run build`.
4. Startet den Server (`node dist/server/main.js`). Beim Start werden fehlende DB-Tabellen per Migration angelegt.
5. Öffnet `http://127.0.0.1:4810` im Standardbrowser (der Port ist in `config.json` änderbar).
6. Das Konsolenfenster bleibt offen. Wird es geschlossen, stoppt der Server.
7. Ist die Datenbank noch leer, zeigt die App den Hinweis „Run import-data.bat first“.

`import-data.bat` führt `npm run import` aus. Optionen: `--refresh` lädt Seiten neu statt aus dem Cache, `--only=spells` importiert nur eine Kategorie.
`backup.bat` kopiert `data/dndbuilder.db` nach `data/backups/dndbuilder-JJJJ-MM-TT-HHMM.db`.

---

## 4. Technik-Stack

| Paket | Zweck |
|---|---|
| Node.js 24 (bereits installiert) | Laufzeitumgebung |
| TypeScript | Durchgehend eine Sprache, Typen für das Regelwerk |
| Fastify | HTTP-Server: API + statische Dateien, nur an `127.0.0.1` gebunden |
| better-sqlite3 | SQLite-Treiber (synchron, schnell). Fallback: das eingebaute `node:sqlite` |
| ~~Drizzle ORM~~ | Umgesetzt: schlanke SQL-Migrationen in `server/db/schema.ts` (einfacher, keine zusätzliche Toolchain) |
| Zod | Validierung von Importdaten, API-Eingaben und Charakterdateien |
| React + Vite | Oberfläche, Build |
| React Router | Seitennavigation |
| TanStack Query | Laden und Zwischenspeichern der API-Daten |
| Zustand | Zustand des Builders (der aktuell bearbeitete Charakter) |
| Tailwind CSS + Radix UI | Styling; zugängliche Dialoge, Tabs, Selects, Tooltips |
| cheerio | HTML-Parsing im Importer |
| tsx | TypeScript-Skripte ohne Build ausführen (Importer, Dev-Server) |
| Vitest | Tests für Engine und Parser |

Es gibt **ein** `package.json` und kein Monorepo, das ist für den Prototyp einfacher. Die Versionen werden beim Setup fest eingetragen.

---

## 5. Projektstruktur

```
Dndbuilder/
├─ start.bat · import-data.bat · backup.bat
├─ config.json                  Port, DB-Pfad, Import-Optionen
├─ package.json · tsconfig.json · vite.config.ts · drizzle.config.ts
├─ docs/
│  └─ BAUPLAN_PROTOTYP.md       dieses Dokument
├─ data/
│  ├─ dndbuilder.db             SQLite (wird beim ersten Start erstellt)
│  ├─ import-report.md          Bericht des letzten Imports
│  ├─ effects/                  von Hand gepflegte Regelwirkungen, nach ID
│  │  ├─ classes.json · subclasses.json · class-options.json
│  │  ├─ species.json · backgrounds.json · feats.json · items.json
│  ├─ overrides/                Korrekturen an geparsten Werten (z. B. falsche Merkmalsstufe)
│  └─ backups/
├─ importer/
│  ├─ cache/                    rohes HTML, eine Datei pro Wiki-Seite
│  ├─ main.ts                   Ablaufsteuerung, CLI-Optionen
│  ├─ fetch.ts                  Rate-Limit (1/s), Wiederholungen, Cache
│  ├─ crawl.ts                  Seitenlisten aus den Übersichtsseiten sammeln
│  ├─ sources.ts                Buchname → Kürzel → Official/UA/Homebrew
│  ├─ parsers/
│  │  ├─ common.ts              page-content, Source-Zeile, Ordinalzahlen, Preis/Gewicht, HTML→Text
│  │  ├─ class.ts · subclass.ts · classOptions.ts
│  │  ├─ lineage.ts · background.ts · feat.ts
│  │  ├─ spell.ts · spellList.ts
│  │  ├─ equipment.ts           Waffen, Rüstungen, Ausrüstung, Werkzeuge
│  │  └─ magicItem.ts
│  ├─ applyEffects.ts           data/effects + data/overrides einmischen
│  ├─ writeDb.ts                Upsert (nur origin = 'wiki'), in einer Transaktion
│  └─ report.ts
├─ server/
│  ├─ main.ts                   Fastify-Start, Migrationen, statische Dateien
│  ├─ db/schema.ts · db/client.ts · db/migrations/
│  └─ routes/ meta.ts · content.ts · characters.ts · homebrew.ts
├─ shared/
│  ├─ types/                    content.ts · effects.ts · character.ts · sheet.ts
│  ├─ schemas/                  Zod-Schemas zu den Typen
│  ├─ rules/                    feste Regeltabellen: Point-Buy-Kosten, Zauberplätze, Skills→Attribut
│  └─ engine/
│     ├─ computeSheet.ts        Einstieg: (build, content, inventory, custom) → Sheet
│     ├─ collect.ts             alle aktiven Merkmale/Effekte einsammeln
│     ├─ choices.ts             offene und erfüllte Auswahlen ermitteln
│     ├─ abilities.ts · proficiencies.ts · hp.ts · armorClass.ts
│     ├─ attacks.ts · spellcasting.ts · resources.ts · speed.ts
│     ├─ formula.ts             sicherer Formel-Auswerter (kein eval)
│     ├─ breakdown.ts           Aufschlüsselung jedes Werts für Tooltips
│     └─ validate.ts            Warnungen
├─ web/
│  ├─ index.html · main.tsx · App.tsx
│  ├─ api/                      API-Client + Query-Hooks
│  ├─ state/builderStore.ts
│  ├─ pages/                    CharacterList · Builder · Sheet · Catalog · Homebrew · Settings
│  └─ components/               ChoiceSelect · FeatureCard · LevelTimeline · AbilityTable ·
│                               SpellTable · ItemTable · EffectEditor · StatWithBreakdown · SourceBadge …
└─ tests/
   ├─ engine/                   Referenzcharaktere R1–R5, Regeltabellen
   ├─ importer/                 Parser gegen gespeicherte HTML-Beispielseiten
   └─ fixtures/
```

Für das spätere Git-Repo gehören `node_modules/`, `dist/`, `importer/cache/`, `data/dndbuilder.db` und `data/backups/` in die `.gitignore`.

---

## 6. Datenbank (SQLite)

### 6.1 Konventionen

- **IDs** sind lesbare Schlüssel nach dem Muster der Wiki-Adressen:
  `class:fighter`, `subclass:fighter:battle-master`, `species:dwarf`, `species:dwarf@kaladesh` (Quellenvariante), `subspecies:dwarf:hill`, `background:acolyte`, `feat:alert`, `option:maneuver:riposte`, `spell:fireball`, `item:longsword`, magische Gegenstände `magic:bag-of-holding`.
  Eigene Inhalte: `custom:<typ>:<uuid>`.
- **Gemeinsame Spalten aller Inhaltstabellen:**

| Spalte | Typ | Bedeutung |
|---|---|---|
| `id` | TEXT PK | siehe oben |
| `name` | TEXT | Anzeigename |
| `source` | TEXT | Buchkürzel: PHB, XGE, TCE, SCAG, EGW, MPMM, ERLW, UA, HB … |
| `source_kind` | TEXT | `official` / `ua` / `homebrew` (für den Quellenfilter) |
| `origin` | TEXT | `wiki` / `custom` |
| `description` | TEXT | Text als leichtes Markdown (fett/kursiv, Listen, Tabellen) |
| `data` | JSON | typspezifische Struktur (siehe Abschnitt 7) |
| `effects` | JSON | Regelwirkungen (siehe Abschnitt 7.1) |
| `choices` | JSON | Auswahlen (siehe Abschnitt 7.2) |
| `updated_at` | TEXT | ISO-Zeitstempel |
| `stale` | INTEGER | 1 = beim letzten Import nicht mehr gefunden (wird nicht gelöscht) |

### 6.2 Inhaltstabellen

| Tabelle | Zusätzliche Spalten (zum Filtern) | Inhalt in `data` |
|---|---|---|
| `classes` | `hit_die`, `caster_type` (none/full/half/third/pact), `spell_ability`, `subclass_level` | Übungen, Rettungswürfe, Skill-Auswahl, Startausrüstung (Text + Struktur), Fortschrittstabelle, ASI-Stufen, Multiclass-Voraussetzung (Text) |
| `subclasses` | `class_id` | Bezeichnung (z. B. „Martial Archetype“), erweiterte Zauberliste |
| `features` | `owner_type` (class/subclass/species/subspecies/background/feat), `owner_id`, `level`, `sort` | Merkmal mit Text, Effekten und Auswahlen |
| `class_options` | `option_group` (fighting-style, maneuver, invocation, metamagic, pact-boon, infusion …), `class_id`, `level_req`, `prerequisite` | einzelne Option |
| `species` | `size`, `speed`, `base_id` (für Quellenvarianten) | Attributsboni, Sinne, Sprachen, Züge |
| `subspecies` | `species_id` | Attributsboni, Züge |
| `backgrounds` | – | Übungen, Sprachen, Ausrüstung, Merkmal, Persönlichkeitstabellen |
| `feats` | `prerequisite` | Voraussetzung strukturiert (soweit erkennbar) + Text |
| `spells` | `level`, `school`, `ritual`, `concentration`, `casting_time`, `range`, `duration` | Komponenten, Material, „At Higher Levels“ |
| `spell_lists` | `spell_id`, `list_id` (PK über beide) | Zuordnung Zauber ↔ Klasse/Unterklasse |
| `items` | `category` (weapon/armor/shield/gear/tool/ammunition/magic), `subtype`, `rarity`, `attunement`, `cost_cp`, `weight_lb` | Waffe: Schaden, Schadensart, Eigenschaften, Reichweite, Vielseitig-Würfel · Rüstung: Grund-RK, Dex-Grenze, Stärke-Voraussetzung, Heimlichkeitsnachteil · Magisch: Basisgegenstand, Bonus |

### 6.3 Charaktere und Einstellungen

| Tabelle | Spalten |
|---|---|
| `characters` | `id` (uuid), `name`, `summary` (z. B. „Hill Dwarf Cleric 5“, nur Anzeige-Cache), `build` JSON, `state` JSON, `created_at`, `updated_at` |
| `character_items` | `id`, `character_id` (FK, cascade), `item_id`, `quantity`, `equipped`, `attuned`, `custom_name`, `notes`, `sort` |
| `character_custom` | `id`, `character_id` (FK, cascade), `name`, `description`, `effects` JSON. Einmalige Boni nur für diesen Charakter |
| `settings` | `key`, `value` JSON. Standard-Quellenfilter, Talente erlaubt, Customize Origin als Standard |
| `import_runs` | `id`, `started_at`, `finished_at`, `pages_fetched`, `entries_written`, `warnings` JSON |

Eigene Inhalte liegen **in denselben Inhaltstabellen** mit `origin = 'custom'`. Dadurch erscheinen sie automatisch in allen Katalogen und Auswahllisten. Der Import fasst nur Zeilen mit `origin = 'wiki'` an.

---

## 7. Datenformate (TypeScript-Kern)

### 7.1 Effekte

```ts
type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
type Formula = string;   // z. B. "10 + dex + con", "level", "max(1, cha)", "table:Rages"

type Effect =
  | { type: "abilityIncrease"; ability: Ability; value: number; max?: number }   // +2 CON (max 20)
  | { type: "abilitySet"; ability: Ability; value: number }                      // Gauntlets of Ogre Power → 19
  | { type: "bonus"; target: BonusTarget; value: number | Formula; when?: Condition }
  | { type: "acFormula"; formula: Formula; allowsShield: boolean; when?: Condition }
  | { type: "proficiency"; kind: "skill" | "save" | "armor" | "weapon" | "tool" | "language"; ids: string[] }
  | { type: "expertise"; skills: string[] }
  | { type: "halfProficiency"; scope: "abilityChecks" }                          // Jack of All Trades
  | { type: "speed"; mode: "walk" | "fly" | "swim" | "climb" | "burrow";
      op: "add" | "set" | "equalWalk"; value?: number; when?: Condition }
  | { type: "sense"; sense: "darkvision" | "blindsight" | "tremorsense" | "truesight"; range: number }
  | { type: "damageDefense"; kind: "resistance" | "immunity" | "vulnerability"; damageTypes: string[] }
  | { type: "hpPerLevel"; value: number }                                        // Dwarven Toughness, Tough (2)
  | { type: "resource"; id: string; name: string; max: Formula; recharge: "short" | "long" | "dawn";
      die?: Formula }                                                            // Rage, Ki, Superiority Dice
  | { type: "grantSpell"; spellId: string; alwaysPrepared: boolean; ability?: Ability;
      minLevel?: number; uses?: { max: Formula; recharge: "short" | "long" } }
  | { type: "attackOption"; name: string; ability: Ability | "best"; damage: Formula; damageType: string }
  | { type: "note"; text: string };                                              // erscheint nur als Hinweis

type BonusTarget =
  | "ac" | "initiative" | "hp.max" | "save.all" | `save.${Ability}` | `skill.${string}`
  | "passive.perception" | "passive.investigation" | "attack.melee" | "attack.ranged"
  | "attack.spell" | "damage.melee" | "damage.ranged" | "spellDc";

type Condition =
  | "always" | "noArmor" | "noHeavyArmor" | "wearingArmor" | "noShield"
  | "itemEquipped" | "itemAttuned" | "oneHandedMeleeOnly" | "rangedWeapon";
```

### 7.2 Auswahlen

```ts
interface Choice {
  id: string;                 // stabil, z. B. "class:fighter@1:fighting-style"
  label: string;              // "Fighting Style"
  level: number;              // Klassen- bzw. Charakterstufe, ab der die Auswahl gilt
  count: number | Formula;    // z. B. 2 oder "table:Invocations Known"
  from:
    | { kind: "list"; ids: string[] }
    | { kind: "skills" | "tools" | "languages"; ids?: string[] }       // ohne ids = alle
    | { kind: "classOptions"; group: string; classId?: string }
    | { kind: "feats" }
    | { kind: "spells"; lists?: string[]; maxLevel?: number | Formula; school?: string[] }
    | { kind: "asiOrFeat" }
    | { kind: "subclass"; classId: string }
    | { kind: "abilities"; amount: number; distinct: boolean };          // z. B. Half-Elf +1/+1
  grants?: Effect[];          // Wirkung pro gewähltem Element (z. B. Proficiency, Expertise)
}
```

### 7.3 Klassendaten (`classes.data`)

```ts
interface ClassData {
  hitDie: 6 | 8 | 10 | 12;
  saves: Ability[];
  proficiencies: { armor: string[]; weapons: string[]; tools: string[] };
  skillChoice: { count: number; from: string[] };
  startingEquipment: { text: string; options: string[][] };
  spellcasting?: {
    type: "full" | "half" | "third" | "pact";
    ability: Ability;
    mode: "known" | "prepared" | "spellbook";
    ritual: boolean;
    preparedFormula?: Formula;  // z. B. "wis + level", "cha + floor(level/2)"
  };
  table: Array<{ level: number; pb: number; features: string[]; columns: Record<string, string> }>;
  subclassLevel: number;
  subclassLabel: string;        // "Martial Archetype"
  asiLevels: number[];          // [4,6,8,12,14,16,19] beim Kämpfer
  multiclassRequirement: string;
}
```

### 7.4 Charakter (`characters.build` / `characters.state`)

```ts
interface CharacterBuild {
  version: 1;
  name: string;
  options: { sources: ("official" | "ua" | "homebrew")[]; featsAllowed: boolean; customizeOrigin: boolean };
  abilities: { method: "pointbuy" | "standard" | "manual"; base: Record<Ability, number> };
  origin: {
    speciesId: string;
    subspeciesId?: string;
    customAsi?: Partial<Record<Ability, number>>;   // nur bei customizeOrigin
    choices: Record<string, string[]>;               // Choice.id → gewählte IDs
  };
  background: { id: string; choices: Record<string, string[]> };
  classId: string;                                   // Prototyp: genau eine Klasse
  levels: Array<{                                    // Index 0 = Stufe 1
    classId: string;                                 // für späteres Multiclassing schon vorhanden
    hp: "max" | "avg" | number;                      // Stufe 1 immer "max"
    choices: Record<string, string[] | AsiChoice>;
  }>;
  spells: { known: string[]; prepared: string[] };   // bei Wizard: known = Zauberbuch
  details: { alignment?: string; age?: string; appearance?: string; backstory?: string; notes?: string };
}
type AsiChoice = { kind: "asi"; increases: Partial<Record<Ability, number>> } | { kind: "feat"; featId: string };

interface CharacterState {
  hpCurrent: number; hpTemp: number;
  slotsUsed: Record<number, number>;                 // Zaubergrad → verbraucht
  resourcesUsed: Record<string, number>;
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
}
```

### 7.5 Berechneter Bogen (Ergebnis der Engine)

Jeder Zahlenwert ist ein `Stat = { total: number; parts: { label: string; value: number }[] }`. Daraus entstehen die Tooltips mit der Aufschlüsselung, z. B. „AC 17 = Chain Mail 16 + Defense 1“.

Inhalt: Attribute (Wert, Modifikator), Übungsbonus, Rettungswürfe, Fertigkeiten, passive Werte, Initiative, RK, max. TP, Bewegungsraten, Sinne, Resistenzen, Übungen und Sprachen, Angriffe, Zauberwirken (SG, Angriff, Plätze, Anzahlen, Zauber), Ressourcen, Merkmale (nach Herkunft gruppiert), **offene Auswahlen** und **Warnungen**.

---

## 8. Importer

### 8.1 Allgemeines

- **Abruf:** `https://dnd5e.wikidot.com/<slug>`, höchstens 1 Anfrage pro Sekunde, 3 Wiederholungen mit Wartezeit, neutraler User-Agent.
- **Cache:** `importer/cache/<slug>.html` (`:` wird zu `__`). Einmal geladen, nie wieder abgerufen, außer mit `--refresh`. Der erste vollständige Import dauert dadurch etwa **30–40 Minuten** (rund 2.000 Seiten), danach Sekunden.
- **Nur `div#page-content`** wird ausgewertet.
- **Quelle:** Die Zeile `<p>Source: Player's Handbook</p>` wird über `sources.ts` auf ein Kürzel und einen `source_kind` abgebildet. Unbekannte Quellen landen im Bericht.
- **Text:** HTML wird in leichtes Markdown umgewandelt. Links werden entfernt, ihr Text bleibt. Zaubernamen in Texten werden als Spell-ID erkannt, damit „grants Alarm“ verknüpft werden kann.
- **Hilfsparser:** Ordinalzahlen („1st“–„20th“), Preise („1,500 gp“ → 150000 cp), Gewichte („2 lb.“, „1/2 lb.“), Striche („—“, „-“) als leer.
- Die Seiten sind sauber in UTF‑8 kodiert (geprüft).

### 8.2 Seiten und Parse-Regeln

Den HTML-Aufbau habe ich an echten Seiten geprüft (Stand heute).

| Kategorie | Einstieg | Aufbau der Seite → Parse-Regel |
|---|---|---|
| **Klassen** (13 + Artificer) | feste Liste: `artificer, barbarian, bard, cleric, druid, fighter, monk, paladin, ranger, rogue, sorcerer, warlock, wizard` | Erste `table.wiki-content-table` = Fortschrittstabelle (Kopfzeilen: Level, Proficiency Bonus, Features + klassenspezifische Spalten wie Rages, Cantrips Known, 1st–9th). Danach `h1 "Class Features"` mit `h5` **Hit Points / Proficiencies / Equipment** (Label-Wert-Paare in Kursivschrift) und je ein `h3` pro Merkmal. Multiclass-Voraussetzung steht im Satz „You must have … 13 or higher“. |
| **Unterklassen** | Tabelle unter dem Unterklassen-Merkmal der Klassenseite (Spalten: Name, Source). Die Zeile „Archived Unearthed Arcana“ trennt alte UA-Versionen ab. | `/<klasse>:<unterklasse>`: Zeile „Source: …“, dann ein `h3` pro Merkmal. **Stufe** aus dem Text („At 3rd level“, „Starting at 7th level“, „Beginning at“, „When you reach“), gegengeprüft mit den Stufen, an denen die Klassentabelle „… feature“ nennt. Tabellen mit Zaubern (Domain Spells, Oath Spells) → `spell_lists` mit `alwaysPrepared`. |
| **Klassenoptionen** | Kampfstile: `li` auf den Klassenseiten mit Quellenkürzel in Klammern („Archery (PHB).“). Weitere Seiten über eine Liste im Importer, z. B. `/fighter:battle-master:maneuvers`, Invocations, Metamagic, Infusions. Die genauen Adressen werden in AP5 geprüft. | Ein Eintrag pro Option mit Voraussetzung („Prerequisite: 5th level“) |
| **Völker** | `/lineage` (83 Verweise, gruppiert: Standard, Exotic, Monstrous, Setting, UA) | `/lineage:<name>`: **mehrere Quellenvarianten auf einer Seite**, jeweils ein `h1` (z. B. Player's Handbook, Eberron, Plane Shift: Kaladesh). Jedes `h1` wird eine eigene Variante (`species:dwarf`, `species:dwarf@kaladesh`), jedes `h2` darunter eine Unterart. Züge sind `li` mit kursivem Label („*Ability Score Increase.*“, „*Speed.*“, „*Darkvision.*“). ASI-Muster: „Your X score increases by N“, „two different ability scores of your choice increase by 1“, MPMM-Stil „increase one score by 2 and another by 1“. |
| **Hintergründe** | Verweise `/background:*` auf der Startseite | „Source:“, dann ein Absatz mit *Skill Proficiencies* / *Tool Proficiencies* / *Languages* / *Equipment*. `h1 "Features"` → `h2` = Hintergrundmerkmal. Die Tabellen Personality Traits / Ideals / Bonds / Flaws werden mitgespeichert. |
| **Talente** | Verweise `/feat:*` auf der Startseite | „Source:“, optional „Prerequisite: …“, Einleitung + `li` mit den Vorteilen. Erkannt werden: „Increase your X or Y score by 1, to a maximum of 20“ → Attributs-Auswahl. |
| **Zauber** | `/spells` (574 Zauber, Tabs pro Grad, Tabelle: Name, School, Casting Time, Range, Duration, Components) | `/spell:<name>`: „Source:“, dann „*3rd-level evocation*“ bzw. „*Evocation cantrip*“ (+ „(ritual)“), dann *Casting Time / Range / Components / Duration*, Beschreibung, „**At Higher Levels.**“, „**Spell Lists.** Sorcerer, Wizard“ → `spell_lists`. Konzentration aus „Concentration, up to …“. |
| **Waffen** | `/weapons` (nur Tabellen) | Tabellen je Kategorie (Simple Melee, Martial Ranged …; Spalten: Name, Cost, Damage, Weight, Properties). Eigenschaften: finesse, light, heavy, reach, two-handed, loading, special, thrown (20/60), ammunition (range 80/320), versatile (1d10). Abschnitt „Setting Specific Weapons“ bekommt die jeweilige Quelle. |
| **Rüstungen** | `/armor` | `h2` Light / Medium / Heavy / Shield; Spalten Name, AC („11 + Dex modifier“, „(max 2)“, „16“, „+2“), Strength („Str 13“), Stealth („Disadvantage“), Weight, Cost |
| **Ausrüstung/Werkzeuge** | `/adventuring-gear` (+ Werkzeugseite, wird in AP4 geprüft) | Tabellen Name, Cost, Weight; Packs mit Inhaltsliste |
| **Magische Gegenstände** | `/wondrous-items` (887 Verweise; Tabs pro Seltenheit, Spalten: Item Name, Type, Attuned, Source) | `/wondrous-items:<name>`: „Source:“, dann Kursivzeile „*Wondrous item, uncommon*“ bzw. „*Weapon (any sword), rare (requires attunement)*“, dann Text. Automatisch erkannt: „+1 bonus to attack and damage rolls“, „+N bonus to AC“, „+N to saving throws“. Homebrew-Gegenstände aus dem Wiki erhalten `source_kind = homebrew`. |

### 8.3 Effekt-Schicht und Korrekturen

- Was sich **automatisch** aus den Daten ergibt, braucht keinen Eintrag: Volks-ASI, Größe, Bewegungsrate, Dunkelsicht, Sprachen, Übungen aus Klasse und Hintergrund, Trefferwürfel, Fortschrittstabellen, Zauberdaten, Waffen- und Rüstungswerte, einfache Boni magischer Gegenstände.
- **Von Hand** kommen in `data/effects/*.json` (Schlüssel = ID) die Wirkungen und Auswahlen von Merkmalen. Für den Prototyp ist das die PHB-Liste:
  - **Klassen:** Rage (Ressource aus Spalte „Rages“), Unarmored Defense (Barbar/Mönch), Fast Movement, Bardic Inspiration, Jack of All Trades, Expertise (Barde/Schurke), Channel Divinity, Wild Shape (Zähler), Fighting Style, Second Wind, Action Surge, Indomitable, Martial Arts (Würfel aus Tabelle), Ki, Unarmored Movement, Lay on Hands, Divine Sense, Aura of Protection, Sneak Attack (Würfel), Sorcery Points, Pact Magic, Eldritch Invocations, Pact Boon, Arcane Recovery, Spellbook.
  - **Unterklassen (PHB):** Domänenzauber, Bonusübungen (z. B. Life Domain: Heavy Armor), Draconic Resilience, Champion (Improved Critical, Remarkable Athlete), Battle Master (Superiority Dice, Maneuvers, Student of War), Eldritch Knight / Arcane Trickster (Drittel-Zauberwirker) usw.
  - **Talente (PHB):** u. a. Alert, Tough, Mobile, Observant, Resilient, Skilled, Lucky, Lightly/Moderately/Heavily Armored, Weapon Master, Linguist; reine Hinweise für situative Talente.
  - **Völker (PHB):** Variant Human, Half-Elf Skill Versatility, High Elf Cantrip, Hill Dwarf Toughness, Dragonborn-Abstammung (Resistenz + Odemwaffe), Tiefling-Zauber usw.
- `data/overrides/*.json` korrigiert einzelne geparste Felder, z. B. eine falsch erkannte Merkmalsstufe. Die Korrekturen überleben jeden neuen Import.
- Alles ohne Wirkung wird als **Text** angezeigt. Fehlt etwas, hilft der „Custom bonus“ direkt am Charakter.

### 8.4 Schreiben und Bericht

- Alles wird in **einer Transaktion** geschrieben. Upsert nach `id`, nur für `origin = 'wiki'`. Nicht mehr gefundene Einträge bekommen `stale = 1`.
- `data/import-report.md` enthält: Anzahl pro Kategorie, fehlgeschlagene Seiten, unbekannte Quellen, Merkmale ohne erkannte Stufe, Gegenstände ohne erkannte Werte, Völker ohne erkannte ASI.

---

## 9. Regel-Engine

### 9.1 Grundsatz

`computeSheet(build, content, inventory, custom) → Sheet` ist eine **reine Funktion** ohne Seiteneffekte und läuft im Browser. Die Inhalte lädt die App beim Start einmal über `/api/content/bundle` und hält sie im Speicher. Das sind lokal einige MB; ist es zu viel, werden die langen Beschreibungstexte nachgeladen.

### 9.2 Berechnungsreihenfolge

1. **Einsammeln** aller aktiven Quellen: Volk/Unterart, Hintergrund, Klassenmerkmale bis zur aktuellen Stufe, Unterklassenmerkmale, gewählte Talente und Klassenoptionen, ausgerüstete bzw. eingestimmte Gegenstände, einmalige Boni.
2. **Auswahlen auflösen:** gewählte Elemente werden aktiv; fehlende oder ungültige landen in `openChoices`.
3. **Attribute:** Grundwert (Point Buy prüft 27 Punkte, Werte 8–15, Kosten 8=0, 9=1, 10=2, 11=3, 12=4, 13=5, 14=7, 15=9) → + Volk (oder Customize Origin) → + ASI/Talente (Obergrenze 20) → `abilitySet` (höherer Wert gewinnt) → Modifikator `floor((Wert − 10) / 2)`.
4. **Übungsbonus:** `2 + floor((Stufe − 1) / 4)`.
5. **Übungen:** Vereinigung aller Quellen; Rettungswürfe von der Klasse.
6. **Fertigkeiten:** Mod + PB × (0 / ½ abgerundet bei Jack of All Trades / 1 / 2 bei Expertise) + Boni. Passive Wahrnehmung = 10 + Perception + Boni.
7. **Trefferpunkte:** Stufe 1 = Trefferwürfel + KON; jede weitere Stufe Durchschnitt (`hitDie/2 + 1`) oder Wurf + KON (mindestens 1); + `hpPerLevel` × Stufe; + Boni.
8. **Rüstungsklasse:** Kandidaten sind ungerüstet (10 + GES), Rüstung (Grund + GES bis zur Dex-Grenze) und alle `acFormula`-Effekte, deren Bedingung erfüllt ist. Der **höchste** zählt, dann + Schild (falls erlaubt) + Boni. Warnungen bei Rüstung ohne Übung und bei unterschrittener Stärke-Voraussetzung (−10 ft).
9. **Bewegung:** Volk + Effekte (mit Bedingungen, z. B. Fast Movement nur ohne schwere Rüstung).
10. **Initiative:** GES + Boni (Alert +5; Jack of All Trades gilt auch hier).
11. **Angriffe:** pro ausgerüsteter Waffe. Attribut: STR (Nahkampf), GES (Fernkampf), Finesse = besseres der beiden; Mönchswaffen dürfen GES. Treffer = Mod + PB (falls geübt) + magischer Bonus + Kampfstil. Schaden = Würfel + Mod + Boni; Vielseitig zeigt beide Würfel. Dazu ein waffenloser Schlag (1 + STR bzw. Martial-Arts-Würfel).
12. **Zauberwirken:** Platztabellen für voll/halb/Drittel/Pakt aus `shared/rules`. SG = 8 + PB + Mod, Angriff = PB + Mod. Zaubertricks und bekannte Zauber aus den Tabellenspalten; vorbereitete Zauber über `preparedFormula` (min. 1). Zauberbuch des Magiers: 6 + 2 pro Stufe ab Stufe 2. Höchster Zaubergrad aus den Plätzen. Immer vorbereitete Zauber zählen nicht mit.
13. **Ressourcen:** `max`-Formel auswerten (z. B. `table:Rages`, `level`, `max(1, cha)`), Würfel (z. B. `table:Martial Arts`), Erholung.
14. **Prüfungen:** Point Buy überzogen, Attribut > 20, mehr als 3 Einstimmungen, zu viele Zauber gewählt/vorbereitet, Rüstung ohne Übung, Talent-Voraussetzung nicht erfüllt, Traglast (STR × 15) überschritten.

### 9.3 Formel-Auswerter

Erlaubt sind nur Zahlen, `+ - * /`, Klammern, `floor`, `ceil`, `min`, `max` sowie die Variablen `str…cha` (Modifikatoren), `pb`, `level`, `classLevel` und `table:<Spaltenname>` (Wert der Klassentabelle auf der aktuellen Stufe). Kein `eval`. Ein Tokenizer mit kleinem Parser genügt.

---

## 10. API

Der Server lauscht ausschließlich auf `127.0.0.1`. Es gibt weder Anmeldung noch CORS. Alle Eingaben werden mit Zod geprüft.

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/meta` | Datenbankstatus (Anzahlen pro Kategorie, letzter Import), Einstellungen |
| PUT | `/api/settings` | Einstellungen speichern |
| GET | `/api/content/bundle` | alle Inhalte (wiki + custom) in einem Paket, mit ETag |
| GET | `/api/content/:table/:id` | ein Eintrag mit vollem Text (falls das Bundle ohne Texte geladen wird) |
| GET | `/api/characters` | Liste (id, name, summary, updated_at) |
| POST | `/api/characters` | neuer Charakter |
| GET | `/api/characters/:id` | build, state, inventory, custom |
| PUT | `/api/characters/:id` | speichern (Autosave, 1 s verzögert) |
| POST | `/api/characters/:id/duplicate` | duplizieren |
| DELETE | `/api/characters/:id` | löschen |
| GET | `/api/characters/:id/export` | Download als JSON-Datei |
| POST | `/api/characters/import` | JSON-Datei importieren (fehlende Inhalts-IDs → Warnung) |
| POST | `/api/homebrew/:table` | eigenen Inhalt anlegen (`items`, `feats`, `features`) |
| PUT / DELETE | `/api/homebrew/:table/:id` | ändern / löschen. Ist der Inhalt noch bei einem Charakter in Verwendung, wird erst eine Warnung mit Liste angezeigt. |

---

## 11. Oberfläche (Englisch)

### 11.1 Grundlayout

- **Obere Leiste:** App-Name · *Characters* · *Catalog* · *Homebrew* · *Settings*
- **Charakteransicht:** links eine schmale Zusammenfassung (Name, Volk, Klasse + Stufe, AC, HP, PB, Anzahl offener Auswahlen als roter Zähler); rechts der Inhalt in Tabs.
- Jeder Zahlenwert hat einen **Tooltip mit Aufschlüsselung**. Jede Quelle zeigt ein **Quellen-Badge** (PHB, XGE, UA, Custom …).
- **Autosave** mit Anzeige „Saved“ / „Saving…“.

### 11.2 Seite „Characters“

Karten mit Name, Volk, Klasse/Stufe und letzter Änderung. Buttons: *New Character*, *Import JSON*. Pro Karte: *Open*, *Duplicate*, *Export*, *Delete* (mit Bestätigung).

### 11.3 Builder-Tabs

| Tab | Inhalt |
|---|---|
| **Overview** | Name, Gesinnung, Details (Alter, Aussehen, Hintergrundgeschichte, Notizen). Optionen: erlaubte Quellen, Talente an/aus, Customize Origin. Liste aller **offenen Auswahlen** mit Sprung zur Stelle. |
| **Abilities** | Methode umschalten. Point Buy mit +/−, Restpunkten und Kostentabelle. Standard Array per Dropdown je Attribut (jeder Wert nur einmal). Manuell als Eingabefelder. Tabelle: *Base · Species · ASI/Feats · Other · Total · Mod*. |
| **Origin** | Volk: durchsuchbare Liste, gruppiert nach Quelle, mit Quellenvariante. Unterart, Auswahlen des Volks (Sprachen, Fertigkeiten, Zaubertrick, Abstammung). Züge als aufklappbare Karten. Hintergrund mit Auswahlen und Merkmalstext. |
| **Class** | Klassenwahl (Karten mit Trefferwürfel, Hauptattribut, Rettungswürfen). Stufe per *Level up* / *Level down*. **Zeitleiste**: eine Karte pro Stufe mit den neuen Merkmalen (Text aufklappbar), den Auswahlfeldern dieser Stufe, TP-Eingabe (*Average* oder gewürfelter Wert) und dem ASI/Talent-Widget (+2 / +1+1 oder Talent aus gefilterter Liste). Auf der Unterklassen-Stufe: Unterklassen-Karten mit Beschreibung. Roter Punkt an Karten mit offenen Auswahlen. |
| **Spells** | Kopfzeile: SG, Angriff, Plätze, Zähler „Cantrips 3/3 · Prepared 5/7“. Links die eigene Liste (bekannt/vorbereitet, immer vorbereitete markiert), rechts die Klassenliste mit Filtern (Grad, Schule, Ritual, Konzentration, Textsuche). Detailansicht als Seitenleiste. |
| **Inventory** | Eigenes Inventar: Menge, *Equipped*, *Attuned* (max. 3), Gewicht gesamt, Münzen. Katalogsuche mit Kategorie-Filter und *Add*. Hinweistext zur Startausrüstung von Klasse und Hintergrund. |
| **Sheet** | Lesefreundlicher Bogen: Attributsblock, Rettungswürfe, Fertigkeiten, AC/HP/Initiative/Speed/PB/Passive, Angriffstabelle, Zauberwirken mit **Platz-Checkboxen**, Ressourcen mit Zählern, Merkmale nach Herkunft, Übungen und Sprachen. **HP**: Schaden/Heilung/temporär. Buttons *Short Rest* (Kurzrast-Ressourcen + Pakt-Plätze) und *Long Rest* (alles). *Add custom bonus*. |

Skizze des Class-Tabs:

```
┌ Thorga · Mountain Dwarf Barbarian 6 ─────────────────────────────────────┐
│ AC 14 │ HP 65 │ PB +3 │ ● 1 open choice    [Overview][Abilities][Origin] │
│                                             [Class][Spells][Inventory]…  │
├──────────────────────────────────────────────────────────────────────────┤
│ Class: Barbarian (d12)               [Level down]  Level 6  [Level up]   │
│ ┌ Level 1 ──────────────────────────────────────────────────────────────┐│
│ │ Rage · Unarmored Defense                         HP: 12 + CON (max)   ││
│ │ Skills (choose 2): [Intimidation ▾] [Perception ▾]                    ││
│ └───────────────────────────────────────────────────────────────────────┘│
│ ┌ Level 3 ● ────────────────────────────────────────────────────────────┐│
│ │ Primal Path: [ Choose subclass … ▾ ]                    HP: [Average] ││
│ └───────────────────────────────────────────────────────────────────────┘│
│ ┌ Level 4 ──────────────────────────────────────────────────────────────┐│
│ │ Ability Score Improvement: (•) +1 STR +1 CON  ( ) Feat [ … ▾ ]        ││
│ └───────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

### 11.4 Catalog

Durchsuchbare Ansicht aller Inhalte (Classes, Species, Backgrounds, Feats, Spells, Items) mit Filtern nach Quelle, Typ, Grad und Seltenheit. Volltext jedes Eintrags. Bei Gegenständen und Talenten: **Copy & edit as homebrew**.

### 11.5 Homebrew

Liste der eigenen Inhalte nach Typ, mit *New*, *Edit*, *Duplicate*, *Delete*.

| Editor | Felder |
|---|---|
| **Weapon** | Name, Simple/Martial, Melee/Ranged, Schadenswürfel, Schadensart, Eigenschaften (Checkboxen; bei Thrown/Ammunition die Reichweite, bei Versatile der Würfel), magischer Bonus, Preis, Gewicht, Seltenheit, Einstimmung, Beschreibung, weitere Effekte |
| **Armor** | Name, Light/Medium/Heavy/Shield, Grund-RK, Dex-Grenze, Stärke-Voraussetzung, Heimlichkeitsnachteil, magischer Bonus, Preis, Gewicht, Seltenheit, Einstimmung, Beschreibung, Effekte |
| **Item** | Name, Typ (Gear, Wondrous, Ring, Potion …), Seltenheit, Einstimmung, Preis, Gewicht, Beschreibung, Effekte |
| **Ability / Feat** | Name, Art (Feat oder Feature), Voraussetzung (Text + optional Mindestattribut), Beschreibung, Effekte, einfache Auswahl (Fertigkeit/Werkzeug/Sprache/Attribut) |

**Effect Editor:** Liste von Zeilen. Pro Zeile: *Effect type* (Dropdown) → passende Felder → *Condition* (Dropdown). Darunter steht eine Vorschau im Klartext, z. B. „+1 bonus to AC while equipped“. Derselbe Editor dient für einmalige Boni am Charakter.

### 11.6 Settings

Standard-Quellenfilter, Standardoptionen für neue Charaktere, Importstatus (Anzahlen, Datum, Link zum Bericht), Pfad der Datenbank, Hinweis auf `backup.bat`.

---

## 12. Tests und Referenzcharaktere

### 12.1 Engine: Referenzcharaktere mit Sollwerten

**R1 – Hill Dwarf Cleric 1 (Life Domain), Acolyte**
Point Buy STR 14, DEX 8, CON 15, INT 8, WIS 15, CHA 10 (27 Punkte) → mit Volk STR 14, DEX 8, CON 17, INT 8, WIS 16, CHA 10.
Skills: Insight, Religion (Hintergrund) + Medicine, Persuasion. Ausrüstung: Chain Mail + Shield.
**Sollwerte:** AC 18 · HP 12 (8 + 3 + 1 Dwarven Toughness) · PB +2 · Spell DC 13 · Spell Attack +5 · Prepared 4 (+ Bless, Cure Wounds immer vorbereitet) · Cantrips 3 · Plätze 1. Grad: 2 · Speed 25 · Initiative −1 · Save WIS +5, CHA +2 · Passive Perception 13 · Darkvision 60 · Resistenz Poison.

**R2 – Variant Human Fighter 5 (Champion), Soldier**
Standard Array STR 15, DEX 13, CON 14, INT 10, WIS 12, CHA 8; Variant Human +1 STR, +1 CON, Skill Acrobatics, Talent Alert; Stufe 4: +2 STR → STR 18, DEX 13, CON 15, INT 10, WIS 12, CHA 8.
Skills: Athletics, Intimidation (Hintergrund) + Perception, Survival. Fighting Style Defense. Chain Mail + Greatsword.
**Sollwerte:** AC 17 · HP 44 (12 + 4 × 8) · PB +3 · Initiative +6 · Greatsword +7, 2d6+4 slashing · Save STR +7, CON +5 · Passive Perception 14 · Ressourcen: Second Wind 1, Action Surge 1 (Kurzrast) · Hinweise: Extra Attack, Improved Critical.

**R3 – Wood Elf Monk 3 (Way of the Open Hand), Hermit**
Point Buy STR 8, DEX 15, CON 14, INT 10, WIS 15, CHA 8 → DEX 17, WIS 16.
Skills: Medicine, Religion (Hintergrund) + Acrobatics, Insight; Perception (Keen Senses).
**Sollwerte:** AC 16 (10 + 3 + 3) · HP 24 (10 + 2 × 7) · PB +2 · Speed 45 (35 + 10) · Unarmed Strike +5, 1d4+3 bludgeoning · Ki 3 · Ki Save DC 13 · Save STR +1, DEX +5 · Passive Perception 15 · Initiative +3 · Darkvision 60.

**R4 – High Elf Wizard 5 (School of Evocation), Sage**
Point Buy STR 8, DEX 14, CON 14, INT 15, WIS 10, CHA 10 → DEX 16, INT 16; Stufe 4: +2 INT → 18.
Skills: Arcana, History (Hintergrund) + Insight, Investigation; Perception (Keen Senses).
**Sollwerte:** AC 13 · HP 32 (8 + 4 × 6) · PB +3 · Spell DC 15 · Spell Attack +7 · Plätze 4/3/2 · Cantrips 4 + 1 (High Elf) · Prepared 9 · Zauberbuch 14 · Save INT +7, WIS +3 · Passive Perception 13 · Initiative +3 · Arcane Recovery 1 (lange Rast).

**R5 – Mountain Dwarf Barbarian 6 (Path of the Berserker), Outlander – mit Homebrew**
Standard Array STR 15, DEX 13, CON 14, INT 8, WIS 12, CHA 10 → STR 17, CON 16; Stufe 4: +1 STR, +1 CON → STR 18, CON 17.
Skills: Athletics, Survival (Hintergrund) + Intimidation, Perception. Keine Rüstung.
Homebrew-Waffe „Frostbite Axe“: Martial Melee, 1d12 slashing, heavy, two-handed, +1. Einmaliger Bonus am Charakter: +1 Initiative.
**Sollwerte:** AC 14 (10 + 1 + 3) · HP 65 (15 + 5 × 10) · PB +3 · Speed 35 (25 + 10 Fast Movement) · Frostbite Axe +8, 1d12+5 slashing · Rage 4 (Rage Damage +2 als Hinweis) · Save STR +7, CON +6 · Initiative +2 · Passive Perception 14 · Darkvision 60 · Resistenz Poison.

Zusätzlich gibt es **Tabellentests**: Zauberplätze für voll/halb/Drittel/Pakt auf allen 20 Stufen, Übungsbonus, Point-Buy-Kosten und den Formel-Auswerter.

### 12.2 Importer: Parser-Tests gegen gespeicherte Seiten

| Seite | Erwartung |
|---|---|
| `/fighter` | Trefferwürfel 10, Saves STR/CON, 20 Tabellenzeilen, Unterklasse ab 3, ASI-Stufen 4/6/8/12/14/16/19, ≥ 10 offizielle Unterklassen |
| `/fighter:battle-master` | Quelle PHB, Merkmale auf 3/3/7/10/15 |
| `/lineage:dwarf` | 3 Varianten (PHB, Eberron, Kaladesh); PHB: CON +2, Speed 25, Darkvision 60, Unterarten Hill (WIS +1) und Mountain (STR +2) |
| `/background:acolyte` | Insight, Religion, 2 Sprachen nach Wahl, Merkmal „Shelter of the Faithful“ |
| `/feat:alert` | Quelle PHB, keine Voraussetzung |
| `/spell:fireball` | Grad 3, Evocation, 150 ft, V/S/M, Instantaneous, keine Konzentration, Listen Sorcerer + Wizard |
| `/weapons` | Longsword: 15 gp, 1d8 slashing, 3 lb, versatile 1d10 |
| `/armor` | Chain Mail: AC 16, Str 13, Heimlichkeitsnachteil, 55 lb |
| `/wondrous-items:bag-of-holding` | Quelle DMG, Wondrous Item, uncommon, keine Einstimmung |

---

## 13. Arbeitspakete

Größen: S = klein, M = mittel, L = groß. Daten kommen zuerst, weil Engine und Oberfläche sich an echten Datenformen orientieren müssen.

| # | Paket | Größe | Abnahme |
|---|---|---|---|
| AP1 | **Projektgerüst & Start-Skripte:** package.json, TS-, Vite- und Fastify-Grundgerüst, `config.json`, `start.bat`, `backup.bat` | S | Doppelklick öffnet eine leere App im Browser; von einem anderen Gerät nicht erreichbar |
| AP2 | **Datenbank:** Drizzle-Schema nach Abschnitt 6, automatische Migration, `/api/meta` | S | `dndbuilder.db` wird angelegt, alle Tabellen existieren |
| AP3 | **Importer-Basis:** fetch + Cache, crawl, `sources.ts`, Hilfsparser, Schreiben, Bericht, `import-data.bat` | M | Alle Übersichtsseiten liegen im Cache, ein Bericht entsteht |
| AP4 | **Parser Ausrüstung & Zauber:** Waffen, Rüstungen, Ausrüstung, Werkzeuge, Zauber, Zauberlisten, magische Gegenstände | M | Parser-Tests grün; ~574 Zauber, ~887 magische Gegenstände in der DB |
| AP5 | **Parser Klassen, Unterklassen, Optionen** | L | 13 Klassen + Artificer mit je 20 Tabellenzeilen; Unterklassenmerkmale haben eine Stufe; offene Fälle stehen im Bericht |
| AP6 | **Parser Völker, Hintergründe, Talente** | M | Quellenvarianten getrennt; ASI bei allen PHB-Völkern erkannt |
| AP7 | **Effekt-Schicht PHB** nach Abschnitt 8.3, `applyEffects.ts`, Overrides | M | Alle Effekte für R1–R5 vorhanden und gegen das Zod-Schema gültig |
| AP8 | **Engine-Kern:** Schritte 1–11 + 13–14, Formel-Auswerter, Aufschlüsselungen, Auswahlen | L | R1–R5 stimmen (ohne Zauberwerte) |
| AP9 | **Engine Zauberwirken:** Schritt 12, Platztabellen | M | Zauberwerte von R1 und R4 stimmen; Tabellentests grün |
| AP10 | **Oberflächen-Gerüst & Charakterliste:** Routing, Layout, CRUD, Autosave, Inhalte laden | S | Charaktere anlegen/umbenennen/duplizieren/löschen, nach Neustart noch da |
| AP11 | **Builder: Overview, Abilities, Origin** | M | R1–R5 lassen sich bis einschließlich Herkunft eingeben, die Attribute stimmen |
| AP12 | **Builder: Class & Zeitleiste:** Auswahlen, ASI/Talent, Unterklasse, TP pro Stufe | L | R1–R5 komplett baubar, offene Auswahlen werden rot markiert |
| AP13 | **Builder: Spells** | M | R1 und R4 vollständig mit Zaubern |
| AP14 | **Inventar & Catalog** | M | Ausrüsten/Einstimmen wirkt sich auf AC und Angriffe aus |
| AP15 | **Charakterbogen & Tracking:** TP, Plätze, Ressourcen, Rasten, Tooltips | M | Lange Rast setzt alles korrekt zurück; jeder Wert hat eine Aufschlüsselung |
| AP16 | **Homebrew-Editor & Custom-Boni:** Editoren, Effect Editor, Copy & edit | M | R5 mit Frostbite Axe und +1 Initiative stimmt |
| AP17 | **Export/Import, Settings, Feinschliff:** JSON-Export/Import, Einstellungen, Leerzustände, Fehlermeldungen | S | Alle Abnahmekriterien aus Abschnitt 1 erfüllt |

---

## 14. Risiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Merkmalsstufen auf Unterklassenseiten stehen nur im Fließtext | Mehrere Textmuster + Abgleich mit den „… feature“-Stufen der Klassentabelle; Restfälle im Bericht und über `data/overrides` korrigieren |
| Völkerseiten enthalten mehrere Quellenvarianten; MPMM-Völker haben flexible ASI | Jedes `h1` wird eine eigene Variante; eigenes Muster für flexible ASI; Standardfilter blendet Doppelungen sinnvoll aus |
| Uneinheitliches HTML (Listen vs. Absätze, fett vs. kursiv) | Parser arbeiten auf normalisiertem Text statt starrem DOM-Pfad; im Zweifel nur Text übernehmen und eine Warnung schreiben |
| UA und Homebrew aus dem Wiki mischen sich unter offizielle Inhalte | `source_kind` aus der Quelle bzw. der Abschnittsüberschrift („Archived Unearthed Arcana“, „Homebrew“); Standardfilter „Official“ |
| Umfang ufert aus (jedes Merkmal automatisieren) | Feste Regel: Im Prototyp nur PHB + Tabellenwerte automatisieren; der Rest ist Text + Custom Bonus |
| Native Installation von better-sqlite3 unter Windows schlägt fehl | Für Node 24 gibt es vorgefertigte Binaries; sonst Wechsel auf das eingebaute `node:sqlite` (die DB-Schicht ist gekapselt) |
| Das Inhaltspaket wird zu groß | Messen; dann Beschreibungstexte über `/api/content/:table/:id` nachladen |
| Das Wiki ändert sich oder ist nicht erreichbar | HTML-Cache macht den Import reproduzierbar; die DB hängt nach dem Import nicht mehr vom Wiki ab |

---

## 15. Nach dem Prototyp

Multiclassing (Voraussetzungen, Teil-Übungen, kombinierte Zauberplätze) · Optionale Klassenmerkmale aus Tasha's · Assistent für Startausrüstung · Würfeln mit Vorteil/Nachteil · Zustände und Konzentration · Druckansicht/PDF · Eigene Zauber, Völker und Unterklassen im Homebrew-Editor · Automatisierung für XGE/TCE/MPMM · Begleiter und Wildgestalt · Verlauf der Stufenaufstiege.

---

## 16. Umsetzungsnotizen (Stand Prototyp)

- Charakter-Build speichert alle Auswahlen flach in `build.choices` (Schlüssel = Choice-ID, z. B. `class:fighter@4:asi`, `class:fighter:skills`, `class:fighter/fighting-style:choice`).
- Optionale Klassenmerkmale (Tasha's) werden angezeigt, aber nicht angewendet.
- Unterarten wie „Variant Human“ ersetzen die Attributserhöhungen des Volks (`replacesSpeciesAsi`).
- Der Server baut das Inhaltspaket nach jedem Import automatisch neu (kein Neustart nötig).
