import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import * as offlineStorage from "../services/offlineStorage";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "pending";

export function useNoteAutosave(noteId: number | null, content: string, delay = 1500) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContent = useRef<string>(content);

  const save = useCallback(async () => {
    if (!token || noteId == null) return;
    if (content === lastSavedContent.current) return;

    setStatus("saving");
    setError(null);

    if (!navigator.onLine) {
      try {
        await offlineStorage.queueUpdateNote(noteId, { content });
        lastSavedContent.current = content;
        setStatus("pending");
        queryClient.invalidateQueries({ queryKey: ["note", noteId] });
        setTimeout(() => setStatus("idle"), 2000);
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "Ошибка сохранения");
      }
      return;
    }

    try {
      await api.notes.update(token, noteId, { content });
      lastSavedContent.current = content;
      setStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["note", noteId] });
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }, [token, noteId, content, queryClient]);

  useEffect(() => {
    if (content === lastSavedContent.current) return;
    if (noteId == null) return;

    setStatus("idle");
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      save();
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [content, noteId, delay, save]);

  useEffect(() => {
    lastSavedContent.current = content;
  }, [noteId]);

  const saveNow = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    save();
  }, [save]);

  return { status, error, saveNow };
}
