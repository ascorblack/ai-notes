import { openDB, DBSchema, IDBPDatabase } from "idb";
import { type NoteResponse, type NoteCreate, type FolderTree, type NoteRef } from "../api/client";

const DB_NAME = "SmartNotesDB";
const DB_VERSION = 2;

interface OfflineNote extends NoteCreate {
  id?: number;
  sync_status: "pending" | "synced" | "conflict";
  updated_at: string;
}

interface TreeCache {
  roots: FolderTree[];
  root_notes: NoteRef[];
  updated_at: string;
}

interface NotesStore extends DBSchema {
  notes: {
    key: number;
    value: OfflineNote;
    indexes: { "by_sync_status": string; "by_updated_at": string };
  };
  sync_queue: {
    key: number;
    value: { type: "create" | "update" | "delete"; note: NoteCreate | NoteResponse; queueKey: number };
  };
  tree_cache: {
    key: string;
    value: TreeCache;
  };
}

let db: IDBPDatabase<NotesStore> | null = null;

async function getDB() {
  if (!db) {
    db = await openDB<NotesStore>(DB_NAME, DB_VERSION, {
      upgrade(database: IDBPDatabase<NotesStore>) {
        if (!database.objectStoreNames.contains("notes")) {
          const store = database.createObjectStore("notes", { keyPath: "id" });
          store.createIndex("by_sync_status", "sync_status");
          store.createIndex("by_updated_at", "updated_at");
        }
        if (!database.objectStoreNames.contains("sync_queue")) {
          database.createObjectStore("sync_queue");
        }
        if (!database.objectStoreNames.contains("tree_cache")) {
          database.createObjectStore("tree_cache");
        }
      },
    });
  }
  return db;
}

export async function saveTreeOffline(tree: { roots: FolderTree[]; root_notes: NoteRef[] }) {
  const database = await getDB();
  await database.put("tree_cache", { ...tree, updated_at: new Date().toISOString() }, "tree");
}

export async function getTreeOffline(): Promise<{ roots: FolderTree[]; root_notes: NoteRef[] } | null> {
  const database = await getDB();
  const cached = await database.get("tree_cache", "tree");
  return cached ? { roots: cached.roots, root_notes: cached.root_notes } : null;
}

export async function getNoteOffline(noteId: number): Promise<NoteResponse | null> {
  const database = await getDB();
  const n = await database.get("notes", noteId);
  if (!n) return null;
  return { ...n, id: n.id ?? noteId } as unknown as NoteResponse;
}

export async function saveNoteOffline(note: NoteResponse) {
  const database = await getDB();
  const offlineNote: OfflineNote = {
    ...note,
    sync_status: "synced",
    updated_at: note.updated_at,
  };
  await database.put("notes", offlineNote);
}

export async function deleteNoteOffline(noteId: number) {
  const database = await getDB();
  await database.delete("notes", noteId);
}

export async function queueCreateNote(note: NoteCreate) {
  const database = await getDB();
  const id = Date.now();
  await database.put("sync_queue", { type: "create", note, queueKey: id }, id);
  await database.put("notes", { ...note, id, sync_status: "pending", updated_at: new Date().toISOString() } as OfflineNote);
  return id;
}

/** Create note locally for offline/simple add. Returns tempId and NoteRef for tree. */
export async function createSimpleNoteOffline(
  title: string,
  content: string,
  folderId: number | null = null
): Promise<{ tempId: number; noteRef: NoteRef }> {
  const tempId = await queueCreateNote({ title, content: content || undefined, folder_id: folderId });
  const now = new Date().toISOString();
  const noteRef: NoteRef = { id: tempId, title, updated_at: now };
  return { tempId, noteRef };
}

function addNoteToFolderInTree(roots: FolderTree[], folderId: number, noteRef: NoteRef): FolderTree[] {
  return roots.map((f) => {
    if (f.id === folderId) {
      return { ...f, notes: [...f.notes, noteRef] };
    }
    return { ...f, children: addNoteToFolderInTree(f.children, folderId, noteRef) };
  });
}

/** Append noteRef to cached tree (root_notes when folderId is null). Persists to IDB. Returns updated { roots, root_notes } for UI. */
export async function appendNoteToTreeOffline(
  noteRef: NoteRef,
  currentRoots: FolderTree[],
  currentRootNotes: NoteRef[],
  folderId: number | null = null
): Promise<{ roots: FolderTree[]; root_notes: NoteRef[] }> {
  if (folderId == null) {
    const newRootNotes = [...currentRootNotes, noteRef];
    await saveTreeOffline({ roots: currentRoots, root_notes: newRootNotes });
    return { roots: currentRoots, root_notes: newRootNotes };
  }
  const newRoots = addNoteToFolderInTree(currentRoots, folderId, noteRef);
  await saveTreeOffline({ roots: newRoots, root_notes: currentRootNotes });
  return { roots: newRoots, root_notes: currentRootNotes };
}

export async function queueUpdateNote(noteId: number, updates: Partial<NoteResponse>) {
  const database = await getDB();
  const existing = await database.get("notes", noteId);
  if (!existing) return;

  const updatedNote = { ...existing, ...updates, sync_status: "pending", updated_at: new Date().toISOString() } as OfflineNote;
  await database.put("notes", updatedNote);
  await database.put("sync_queue", { type: "update", note: updatedNote as unknown as NoteResponse, queueKey: noteId }, noteId);
}

export async function queueDeleteNote(noteId: number, note: NoteResponse) {
  const database = await getDB();
  await database.put("sync_queue", { type: "delete", note, queueKey: noteId }, noteId);
  await database.delete("notes", noteId);
}

export async function getOfflineNotes(): Promise<OfflineNote[]> {
  const database = await getDB();
  return await database.getAll("notes");
}

export interface SyncQueueItem {
  type: "create" | "update" | "delete";
  note: NoteResponse | NoteCreate;
  queueKey: number;
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const database = await getDB();
  const keys = await database.getAllKeys("sync_queue");
  const values = await database.getAll("sync_queue");
  return keys.map((key, i) => ({ ...values[i], queueKey: key as number } as SyncQueueItem));
}

export async function removeFromSyncQueue(queueKey: number) {
  const database = await getDB();
  await database.delete("sync_queue", queueKey);
}

export async function clearAllOfflineData() {
  const database = await getDB();
  await database.clear("notes");
  await database.clear("sync_queue");
}
