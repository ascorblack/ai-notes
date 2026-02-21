import type { FolderTree, NoteRef } from "../api/client";

export type TreeData = { roots: FolderTree[]; root_notes: NoteRef[] };

function cloneFolder(f: FolderTree): FolderTree {
  return {
    ...f,
    notes: [...f.notes],
    children: f.children.map(cloneFolder),
  };
}

export function removeNoteFromTree(
  tree: TreeData,
  noteId: number
): TreeData {
  const roots = tree.roots.map(cloneFolder);
  const rootNotes = tree.root_notes.filter((n) => n.id !== noteId);

  function removeFromFolders(folders: FolderTree[]): boolean {
    for (const f of folders) {
      const idx = f.notes.findIndex((n) => n.id === noteId);
      if (idx >= 0) {
        f.notes = f.notes.filter((n) => n.id !== noteId);
        return true;
      }
      if (removeFromFolders(f.children)) return true;
    }
    return false;
  }
  removeFromFolders(roots);

  return { roots, root_notes: rootNotes };
}

export function addNoteToTree(
  tree: TreeData,
  note: NoteRef,
  folderId: number | null
): TreeData {
  const roots = tree.roots.map(cloneFolder);
  const rootNotes = [...tree.root_notes];

  const noteRef: NoteRef = { id: note.id, title: note.title, pinned: note.pinned, updated_at: note.updated_at };

  if (folderId == null || folderId === 0) {
    rootNotes.push(noteRef);
    return { roots, root_notes: rootNotes };
  }

  function addToFolder(folders: FolderTree[]): boolean {
    for (const f of folders) {
      if (f.id === folderId) {
        f.notes = [...f.notes, noteRef];
        return true;
      }
      if (addToFolder(f.children)) return true;
    }
    return false;
  }
  if (!addToFolder(roots)) {
    rootNotes.push(noteRef);
  }

  return { roots, root_notes: rootNotes };
}
