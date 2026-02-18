import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useRegisterOverlay } from "../../hooks/useRegisterOverlay";
import { BottomSheet } from "../ui/BottomSheet";

interface ProfileFactsModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
}

const ProfileFactsContent = ({ token }: { token: string }) => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["profile-facts", token],
    queryFn: () => api.agent.getProfile(token),
    enabled: !!token,
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const deleteMutation = useMutation({
    mutationFn: (factId: number) => api.agent.deleteProfileFact(token, factId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-facts"] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, fact }: { id: number; fact: string }) =>
      api.agent.updateProfileFact(token, id, fact),
    onSuccess: () => {
      setEditingId(null);
      setEditingText("");
      queryClient.invalidateQueries({ queryKey: ["profile-facts"] });
    },
  });

  const facts = data?.facts ?? [];

  const startEdit = (item: { id: number; fact: string }) => {
    setEditingId(item.id);
    setEditingText(item.fact);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };
  const saveEdit = () => {
    if (editingId == null || !editingText.trim()) return;
    updateMutation.mutate({ id: editingId, fact: editingText.trim() });
  };

  return (
    <div className="p-4">
      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-text-muted text-sm">
          <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse mr-2" />
          Загрузка…
        </div>
      ) : facts.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-8">
          Пока ничего не запомнено. Модель сохраняет факты о вас при создании заметок (компания, сфера, проект).
        </p>
      ) : (
        <ul className="space-y-3">
          {facts.map((item: { id: number; fact: string }) => (
            <li
              key={item.id}
              className="flex items-start gap-2 text-sm text-text-primary pl-4 border-l-2 border-accent/50 py-1"
            >
              {editingId === item.id ? (
                <>
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        saveEdit();
                      }
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-border/60 text-text-primary bg-bg resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                    rows={2}
                    autoFocus
                  />
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={updateMutation.isPending || !editingText.trim()}
                      className="touch-target-48 p-1.5 rounded-lg text-success hover:bg-success/10 disabled:opacity-50"
                      aria-label="Сохранить"
                      title="Сохранить"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={updateMutation.isPending}
                      className="touch-target-48 p-1.5 rounded-lg text-text-muted hover:bg-accent-muted disabled:opacity-50"
                      aria-label="Отмена"
                      title="Отмена"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="flex-1 min-w-0">{item.fact}</span>
                  <div className="flex gap-0.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      disabled={deleteMutation.isPending}
                      className="touch-target-48 p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent-muted disabled:opacity-50"
                      aria-label="Редактировать"
                      title="Редактировать"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(item.id)}
                      disabled={deleteMutation.isPending}
                      className="touch-target-48 p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10 disabled:opacity-50"
                      aria-label="Удалить"
                      title="Удалить"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export function ProfileFactsModal({ open, onClose, token }: ProfileFactsModalProps) {
  const isMobile = useIsMobile();
  useRegisterOverlay(open, onClose);

  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Что запомнила модель" maxHeight="85dvh">
        <ProfileFactsContent token={token} />
      </BottomSheet>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden={!open}
          />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto w-full max-w-md max-h-[70vh] flex flex-col rounded-xl border border-border/60 overflow-hidden"
              style={{
                backgroundColor: "var(--surface-elevated)",
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
              }}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 flex-shrink-0">
                <h2 className="text-lg font-medium text-text-primary">Что запомнила модель</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="touch-target-48 p-2 rounded-lg text-text-secondary hover:text-accent hover:bg-accent-muted transition-colors"
                  aria-label="Закрыть"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 p-4 overflow-auto">
                <ProfileFactsContent token={token} />
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
