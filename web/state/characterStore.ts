import { create } from "zustand";
import type { Character } from "../../shared/types/character";
import { api } from "../api/client";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface CharacterStore {
  character: Character | null;
  loading: boolean;
  error: string | null;
  status: SaveStatus;
  /** summary text for the character list, set by the page from the computed sheet */
  summary: string;
  load: (id: string) => Promise<void>;
  /** Mutate a copy of the character; triggers autosave */
  update: (fn: (c: Character) => void) => void;
  setSummary: (s: string) => void;
  flush: () => Promise<void>;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  character: null,
  loading: false,
  error: null,
  status: "idle",
  summary: "",
  load: async (id) => {
    if (timer) await get().flush();
    set({ loading: true, error: null, character: null });
    try {
      const c = await api.getCharacter(id);
      set({ character: c, loading: false, status: "idle" });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },
  update: (fn) => {
    const c = get().character;
    if (!c) return;
    const copy = structuredClone(c);
    fn(copy);
    set({ character: copy, status: "saving" });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void get().flush(), 700);
  },
  setSummary: (summary) => {
    if (summary !== get().summary) set({ summary });
  },
  flush: async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const c = get().character;
    if (!c) return;
    try {
      await api.saveCharacter(c, get().summary);
      set({ status: "saved" });
    } catch (e) {
      set({ status: "error", error: (e as Error).message });
    }
  },
}));

// save pending changes when the tab is closed
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (timer) void useCharacterStore.getState().flush();
  });
}
