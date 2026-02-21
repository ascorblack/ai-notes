import { create } from "zustand";
import type { FolderTree, NoteRef } from "../api/client";

export type TreeItem =
  | { type: "folder"; data: FolderTree }
  | { type: "note"; data: NoteRef; folderId: number | null };

interface TreeState {
  roots: FolderTree[];
  rootNotes: NoteRef[];
  selectedNoteId: number | null;
  splitOpen: boolean;
  splitNoteId: number | null;
  lastCreatedIds: Set<number>;
  setTree: (roots: FolderTree[], rootNotes: NoteRef[]) => void;
  setSelectedNote: (id: number | null) => void;
  setSplitNote: (id: number | null) => void;
  setSplitOpen: (v: boolean) => void;
  setLastCreatedIds: (ids: number[]) => void;
}

export const useTreeStore = create<TreeState>((set) => ({
  roots: [],
  rootNotes: [],
  selectedNoteId: null,
  splitOpen: false,
  splitNoteId: null,
  lastCreatedIds: new Set(),
  setTree: (roots, rootNotes) => set({ roots, rootNotes }),
  setSelectedNote: (selectedNoteId) => set({ selectedNoteId }),
  setSplitNote: (splitNoteId) => set({ splitNoteId }),
  setSplitOpen: (splitOpen) => set((s) => ({ splitOpen, splitNoteId: splitOpen ? s.splitNoteId : null })),
  setLastCreatedIds: (ids) =>
    set({ lastCreatedIds: new Set(ids) }),
}));
