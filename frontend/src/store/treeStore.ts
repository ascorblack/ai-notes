import { create } from "zustand";
import type { FolderTree, NoteRef } from "../api/client";

export type TreeItem =
  | { type: "folder"; data: FolderTree }
  | { type: "note"; data: NoteRef; folderId: number | null };

interface TreeState {
  roots: FolderTree[];
  rootNotes: NoteRef[];
  selectedNoteId: number | null;
  lastCreatedIds: Set<number>;
  setTree: (roots: FolderTree[], rootNotes: NoteRef[]) => void;
  setSelectedNote: (id: number | null) => void;
  setLastCreatedIds: (ids: number[]) => void;
}

export const useTreeStore = create<TreeState>((set) => ({
  roots: [],
  rootNotes: [],
  selectedNoteId: null,
  lastCreatedIds: new Set(),
  setTree: (roots, rootNotes) => set({ roots, rootNotes }),
  setSelectedNote: (selectedNoteId) => set({ selectedNoteId }),
  setLastCreatedIds: (ids) =>
    set({ lastCreatedIds: new Set(ids) }),
}));
