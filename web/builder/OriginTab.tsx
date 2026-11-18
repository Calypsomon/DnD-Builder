import { visible } from "../../shared/engine/contentIndex";
import type { BackgroundData, ContentRow, SpeciesData } from "../../shared/types/content";
import { Markdown } from "../components/Markdown";
import { Card, Empty, Select, SourceBadge } from "../components/ui";
import { useBuilder } from "./context";
import { ChoiceList, FeatureItem, RowPicker } from "./shared";

const ABBR: Record<string, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };

function asiText(row: ContentRow<any> | undefined): string {
  if (!row) return "";
  const parts = row.effects.filter((e) => e.type === "abilityIncrease").map((e: any) => `${ABBR[e.ability]} +${e.value}`);
  if (row.choices.some((c) => c.from.kind === "abilities")) parts.push("flexible");
  return parts.join(", ");
}

export default function OriginTab() {
  const { character, sheet, update, idx } = useBuilder();
  const b = character.build;
  const species = b.speciesId ? (idx.byId.get(b.speciesId) as ContentRow<SpeciesData> | undefined) : undefined;
  const subspecies = b.subspeciesId ? idx.byId.get(b.subspeciesId) : undefined;
  const background = b.backgroundId ? (idx.byId.get(b.backgroundId) as ContentRow<BackgroundData> | undefined) : undefined;

  const speciesRows = idx.bundle.species.filter((r) => visible(r, b));
  const subRows = species
    ? [...(idx.subspeciesBySpecies.get(species.id) ?? []), ...(species.data.baseId !== species.id ? idx.subspeciesBySpecies.get(species.data.baseId) ?? [] : [])].filter((r) =>
        visible(r, b),
      )
    : [];
  const bgRows = idx.bundle.backgrounds.filter((r) => visible(r, b));

  const originChoices = sheet.choices.filter((c) => c.location === "origin");
  const bgChoices = sheet.choices.filter((c) => c.location === "background");

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Species" actions={<RowPicker label="Species" rows={speciesRows} value={b.speciesId} detail={(r) => r.data.variantLabel || r.data.category} onPick={(id) => update((c) => {
        c.build.speciesId = id;
        c.build.subspeciesId = null;
      })} />}>
        {!species ? (
          <Empty>No species chosen yet.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-serif text-lg font-semibold">{species.name}</h3>
              <SourceBadge source={species.source} origin={species.origin} />
            </div>
            <p className="text-sm text-muted">
              {species.data.size} · Speed {species.data.speed?.walk ?? 30} ft.
              {species.data.darkvision ? ` · Darkvision ${species.data.darkvision} ft.` : ""}
              {asiText(species) ? ` · ${asiText(species)}` : ""}
              {species.data.languages?.length ? ` · Languages: ${species.data.languages.join(", ")}` : ""}
            </p>
            {subRows.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <span className="font-medium">Subrace</span>
                <Select value={b.subspeciesId ?? ""} onChange={(e) => update((c) => void (c.build.subspeciesId = e.target.value || null))}>
                  <option value="">— choose —</option>
                  {subRows.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {asiText(s) ? ` (${asiText(s)})` : ""}
                    </option>
                  ))}
                </Select>
                {!b.subspeciesId && <span className="text-xs text-danger">●</span>}
              </label>
            )}
            {species.description && (
              <details>
                <summary className="cursor-pointer text-sm text-muted">Description</summary>
                <Markdown text={species.description} />
              </details>
            )}
            <ChoiceList items={originChoices} />
            <div>
              <h4 className="mb-1 text-sm font-semibold">Traits</h4>
              {[...(idx.featuresByOwner.get(species.id) ?? []), ...(subspecies ? idx.featuresByOwner.get(subspecies.id) ?? [] : [])].map((f) => (
                <FeatureItem key={f.id} row={f} />
              ))}
            </div>
          </div>
        )}
      </Card>
      <Card
        title="Background"
        actions={<RowPicker label="Background" rows={bgRows} value={b.backgroundId} detail={(r) => r.data.skills?.join(", ")} onPick={(id) => update((c) => void (c.build.backgroundId = id))} />}
      >
        {!background ? (
          <Empty>No background chosen yet.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-lg font-semibold">{background.name}</h3>
              <SourceBadge source={background.source} origin={background.origin} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">Skills</dt>
              <dd>{background.data.skills?.join(", ") || "—"}</dd>
              <dt className="text-muted">Tools</dt>
              <dd>{background.data.tools?.join(", ") || "—"}</dd>
              <dt className="text-muted">Languages</dt>
              <dd>{background.data.languagesText || "—"}</dd>
              <dt className="text-muted">Equipment</dt>
              <dd>{background.data.equipmentText || "—"}</dd>
            </dl>
            <ChoiceList items={bgChoices} />
            <div>
              {(idx.featuresByOwner.get(background.id) ?? []).map((f) => (
                <FeatureItem key={f.id} row={f} />
              ))}
            </div>
            {background.description && (
              <details>
                <summary className="cursor-pointer text-sm text-muted">Description</summary>
                <Markdown text={background.description} />
              </details>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
