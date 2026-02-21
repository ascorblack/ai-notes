import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import * as offlineStorage from "../services/offlineStorage";
function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError && e.message?.includes("fetch")) return true;
  if (e instanceof Error) {
    const msg = e.message.toLowerCase();
    return msg.includes("network") || msg.includes("failed to fetch") || msg.includes("load failed");
  }
  return false;
}

export function useOfflineTreeQuery(token: string | null) {
  return useQuery({
    queryKey: ["tree", token],
    queryFn: async () => {
      try {
        const data = await api.folders.getTree(token!);
        await offlineStorage.saveTreeOffline(data);
        return data;
      } catch (e) {
        if (isNetworkError(e)) {
          const cached = await offlineStorage.getTreeOffline();
          if (cached) return cached;
        }
        throw e;
      }
    },
    enabled: !!token,
  });
}

export function useOfflineNoteQuery(token: string | null, noteId: number | null) {
  return useQuery({
    queryKey: ["note", noteId, token],
    queryFn: async () => {
      try {
        const data = await api.notes.get(token!, noteId!);
        await offlineStorage.saveNoteOffline(data);
        return data;
      } catch (e) {
        if (isNetworkError(e)) {
          const cached = await offlineStorage.getNoteOffline(noteId!);
          if (cached) return cached;
        }
        throw e;
      }
    },
    enabled: !!token && noteId != null,
  });
}
