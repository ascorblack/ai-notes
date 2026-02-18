import { create } from "zustand";

interface AppModalsStore {
  settingsOpen: boolean;
  profileOpen: boolean;
  calendarOpen: boolean;
  trashOpen: boolean;
  moreSheetOpen: boolean;
  chatSessionsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  setProfileOpen: (v: boolean) => void;
  setCalendarOpen: (v: boolean) => void;
  setTrashOpen: (v: boolean) => void;
  setMoreSheetOpen: (v: boolean) => void;
  setChatSessionsOpen: (v: boolean) => void;
}

export const useAppModalsStore = create<AppModalsStore>((set) => ({
  settingsOpen: false,
  profileOpen: false,
  calendarOpen: false,
  trashOpen: false,
  moreSheetOpen: false,
  chatSessionsOpen: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setProfileOpen: (v) => set({ profileOpen: v }),
  setCalendarOpen: (v) => set({ calendarOpen: v }),
  setTrashOpen: (v) => set({ trashOpen: v }),
  setMoreSheetOpen: (v) => set({ moreSheetOpen: v }),
  setChatSessionsOpen: (v) => set({ chatSessionsOpen: v }),
}));
