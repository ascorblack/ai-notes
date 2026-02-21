import { useEffect, useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as offlineStorage from "../services/offlineStorage";
import { api, type NoteResponse } from "../api/client";
import { useAuthStore } from "../store/authStore";

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "error">("idle");

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const syncMutation = useMutation({
    mutationFn: async (queueItem: { type: string; note: any; queueKey: number }) => {
      if (!token) return;
      setSyncStatus("syncing");
      try {
        if (queueItem.type === "create") {
          const created = await api.notes.create(token, queueItem.note);
          await offlineStorage.deleteNoteOffline(queueItem.queueKey);
          await offlineStorage.saveNoteOffline(created);
          await offlineStorage.removeFromSyncQueue(queueItem.queueKey);
          queryClient.invalidateQueries({ queryKey: ["tree"] });
        } else if (queueItem.type === "update") {
          const id = queueItem.note.id;
          await api.notes.update(token, id, {
            title: queueItem.note.title,
            content: queueItem.note.content,
          });
          await offlineStorage.saveNoteOffline(queueItem.note as NoteResponse);
          await offlineStorage.removeFromSyncQueue(queueItem.queueKey);
          queryClient.invalidateQueries({ queryKey: ["note", queueItem.note.id] });
        } else if (queueItem.type === "delete") {
          await api.notes.delete(token, queueItem.note.id);
          await offlineStorage.removeFromSyncQueue(queueItem.queueKey);
          queryClient.invalidateQueries({ queryKey: ["tree"] });
        }
      } catch (e) {
        setSyncStatus("error");
        throw e;
      } finally {
        setSyncStatus("idle");
      }
    },
  });

  const sync = useCallback(async () => {
    if (!isOnline || syncStatus === "syncing") return;
    const queue = await offlineStorage.getSyncQueue();
    for (const item of queue) {
      await syncMutation.mutateAsync(item);
    }
  }, [isOnline, syncStatus, syncMutation]);

  useEffect(() => {
    if (isOnline && token) {
      sync();
    }
  }, [isOnline, token, sync]);

  return { isOnline, sync, syncStatus };
}
