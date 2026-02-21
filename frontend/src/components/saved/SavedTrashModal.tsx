import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAppModalsStore } from "../../store/appModalsStore";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAuthStore } from "../../store/authStore";
import { BottomSheet } from "../ui/BottomSheet";
import { useRegisterOverlay } from "../../hooks/useRegisterOverlay";

const TrashContent = ({ token, onClose: _onClose }: { token: string; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["saved-messages-trash", token],
    queryFn: () => api.savedMessages.listTrash(token),
    enabled: !!token,
  });

  const handleRestore = async (id: number) => {
    await api.savedMessages.restoreFromTrash(token, id);
    await queryClient.invalidateQueries({ queryKey: ["saved-messages-trash"] });
    await queryClient.invalidateQueries({ queryKey: ["saved-messages"] });
  };

  const handlePermanentDelete = async (id: number) => {
    await api.savedMessages.permanentDelete(token, id);
    await queryClient.invalidateQueries({ queryKey: ["saved-messages-trash"] });
  };

  const formatDate = (s: string) => {
    const d = new Date(s);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Вчера";
    if (diffDays < 7) return `${diffDays} дн. назад`;
    return d.toLocaleDateString("ru-RU");
  };

  return (
    <div className="p-4">
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-text-muted">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <div className="flex justify-center mb-4">
            <div className="flex items-center justify-center w-20 h-20 rounded-full"
                 style={{ backgroundColor: "var(--accent-muted)" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                   style={{ color: "var(--accent)" }}>
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1 2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-1">Корзина пуста</h3>
          <p className="text-text-muted text-sm">Удаленные сообщения появятся здесь</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 py-3 px-4 rounded-xl border border-border/50"
              style={{
                backgroundColor: "var(--surface-elevated)",
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-primary line-clamp-2">{item.content}</p>
                <p className="text-xs text-text-muted mt-1">{formatDate(item.deleted_at)}</p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <motion.button
                  type="button"
                  onClick={() => handleRestore(item.id)}
                  className="touch-target-48 px-3 py-1.5 text-xs font-medium rounded-lg text-accent transition-colors"
                  style={{ backgroundColor: "var(--accent-muted)" }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Восстановить
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => handlePermanentDelete(item.id)}
                  className="touch-target-48 px-3 py-1.5 text-xs font-medium rounded-lg text-error transition-colors"
                  style={{ backgroundColor: "var(--error-bg)", opacity: 0.8 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Удалить
                </motion.button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export function SavedTrashModal() {
  const isMobile = useIsMobile();
  const { savedTrashOpen, setSavedTrashOpen } = useAppModalsStore();
  const token = useAuthStore((s) => s.token);

  useRegisterOverlay(savedTrashOpen, () => setSavedTrashOpen(false));

  if (isMobile) {
    return (
      <BottomSheet open={savedTrashOpen} onClose={() => setSavedTrashOpen(false)} title="Корзина" maxHeight="80dvh">
        <TrashContent token={token!} onClose={() => setSavedTrashOpen(false)} />
      </BottomSheet>
    );
  }

  return (
    <AnimatePresence>
      {savedTrashOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-modal-overlay backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSavedTrashOpen(false)}
          />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8 pointer-events-none">
            <motion.div
              className="pointer-events-auto w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border border-border overflow-hidden bg-modal-panel backdrop-blur-md shadow-2xl"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 flex-shrink-0"
                   style={{ backgroundColor: "var(--surface-elevated)" }}>
                <h2 className="text-lg font-semibold text-text-primary">Корзина</h2>
                <button
                  type="button"
                  onClick={() => setSavedTrashOpen(false)}
                  className="touch-target-48 p-2 rounded-lg text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
                  aria-label="Закрыть"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 p-4 overflow-auto">
                <TrashContent token={token!} onClose={() => setSavedTrashOpen(false)} />
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
