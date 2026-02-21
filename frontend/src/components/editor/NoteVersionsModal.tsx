import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type NoteVersionResponse } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { useRegisterOverlay } from "../../hooks/useRegisterOverlay";

interface NoteVersionsProps {
  noteId: number;
  onClose: () => void;
}

export function NoteVersionsModal({ noteId, onClose }: NoteVersionsProps) {
  useRegisterOverlay(true, onClose);
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const { data: versions, isLoading } = useQuery({
    queryKey: ["note-versions", noteId],
    queryFn: () => api.notes.getVersions(token!, noteId, 50),
    enabled: !!token,
  });

  const restoreMutation = useMutation({
    mutationFn: (version: number) => api.notes.restoreVersion(token!, noteId, version),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["note", noteId] });
      onClose();
    },
  });

  const handleRestore = (version: number) => {
    restoreMutation.mutate(version);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-modal-overlay"
      onClick={onClose}
    >
      <div
        className="border border-l-4 border-accent/50 border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col bg-modal-panel backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">История версий</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="text-center text-text-muted">Загрузка...</div>
          ) : !versions || versions.length === 0 ? (
            <div className="text-center text-text-muted">Нет сохраненных версий</div>
          ) : (
            <div className="space-y-3">
              {versions.map((v: NoteVersionResponse) => (
                <motion.div
                  key={v.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`p-4 rounded-xl pl-4 border-l-2 border-accent/60 transition-all cursor-pointer ${
                    selectedVersion === v.id
                      ? "bg-accent-muted/30"
                      : "bg-accent-muted/20 hover:bg-accent-muted/30"
                  }`}
                  onClick={() => setSelectedVersion(v.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-accent">
                          Версия {v.version}
                        </span>
                        <span className="text-xs text-text-muted">
                          {new Date(v.created_at).toLocaleString("ru-RU", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {v.content_delta && (() => {
                        try {
                          const d = JSON.parse(v.content_delta) as { old?: string; new?: string };
                          const oldLen = (d.old ?? "").length;
                          const newLen = (d.new ?? "").length;
                          return (
                            <div className="text-xs text-text-muted">
                              {oldLen} → {newLen} символов
                            </div>
                          );
                        } catch {
                          return null;
                        }
                      })()}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestore(v.id);
                      }}
                      disabled={restoreMutation.isPending}
                      className="px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {restoreMutation.isPending ? "Восстановление..." : "Восстановить"}
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
