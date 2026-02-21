import { create } from "zustand";

interface AppModalsStore {
  settingsOpen: boolean;
  profileOpen: boolean;
  calendarOpen: boolean;
  trashOpen: boolean;
  graphOpen: boolean;
  commandPaletteOpen: boolean;
  moreSheetOpen: boolean;
  chatSessionsOpen: boolean;
  savedTrashOpen: boolean;
  focusMode: boolean;
  setSettingsOpen: (v: boolean) => void;
  setProfileOpen: (v: boolean) => void;
  setCalendarOpen: (v: boolean) => void;
  setTrashOpen: (v: boolean) => void;
  setGraphOpen: (v: boolean) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setMoreSheetOpen: (v: boolean) => void;
  setChatSessionsOpen: (v: boolean) => void;
  setSavedTrashOpen: (v: boolean) => void;
  setFocusMode: (v: boolean) => void;
  toggleFocusMode: () => void;
}

export const useAppModalsStore = create<AppModalsStore>((set) => ({
  settingsOpen: false,
  profileOpen: false,
  calendarOpen: false,
  trashOpen: false,
  graphOpen: false,
  commandPaletteOpen: false,
  moreSheetOpen: false,
  chatSessionsOpen: false,
  savedTrashOpen: false,
  focusMode: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setProfileOpen: (v) => set({ profileOpen: v }),
  setCalendarOpen: (v) => set({ calendarOpen: v }),
  setTrashOpen: (v) => set({ trashOpen: v }),
  setGraphOpen: (v) => set({ graphOpen: v }),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  setMoreSheetOpen: (v) => set({ moreSheetOpen: v }),
  setChatSessionsOpen: (v) => set({ chatSessionsOpen: v }),
  setSavedTrashOpen: (v) => set({ savedTrashOpen: v }),
  setFocusMode: (v) => set({ focusMode: v }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
}));
