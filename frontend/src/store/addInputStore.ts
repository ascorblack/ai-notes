import { create } from "zustand";

interface AddInputStore {
  focus: (() => void) | null;
  setFocus: (fn: (() => void) | null) => void;
}

export const useAddInputStore = create<AddInputStore>((set) => ({
  focus: null,
  setFocus: (fn) => set({ focus: fn }),
}));
