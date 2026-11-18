import { createContext, useContext } from "react";
import type { ContentIndex } from "../../shared/engine/contentIndex";
import type { Character } from "../../shared/types/character";
import type { Sheet } from "../../shared/types/sheet";

export interface BuilderCtx {
  character: Character;
  sheet: Sheet;
  update: (fn: (c: Character) => void) => void;
  idx: ContentIndex;
}

export const BuilderContext = createContext<BuilderCtx | null>(null);

export function useBuilder(): BuilderCtx {
  const c = useContext(BuilderContext);
  if (!c) throw new Error("useBuilder outside BuilderContext");
  return c;
}
