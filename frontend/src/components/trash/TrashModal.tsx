import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, TrashItem } from "../../api/client";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useRegisterOverlay } from "../../hooks/useRegisterOverlay";
import { BottomSheet } from "../ui/BottomSheet";

interface TrashModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  onRestore?: (noteId: number) => void;
}

function formatDate(s: string) {
  const d = new Date(s);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Вчера";
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return d.toLocaleDateString();
}

const TrashContent = ({
  token,
  onClose,
  onRestore,
}: {
  token: string;
  onClose: () => void;
  onRestore?: (noteId: number) => void;
}) => {
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["trash", token],
    queryFn: () => api.notes.trash.list(token),
    enabled: !!token,
  });

  const handleRestore = async (item: TrashItem) => {
    await api.notes.trash.restore(token, item.id);
    await queryClient.invalidateQueries({ queryKey: ["trash", token] });
    await queryClient.invalidateQueries({ queryKey: ["tree", token] });
    onRestore?.(item.id);
    onClose();
  };

  const handleDeletePermanent = async (item: TrashItem) => {
    await api.notes.trash.deletePermanent(token, item.id);
    await queryClient.invalidateQueries({ queryKey: ["trash", token] });
  };

  return (
    <div className="p-4">
      {isLoading ? (
        <p className="text-text-muted text-sm">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-text-muted text-sm">Корзина пуста</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl bg-surface/50 border border-border/40"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary truncate">{item.title || "(untitled)"}</p>
                <p className="text-xs text-text-muted mt-0.5">{formatDate(item.deleted_at)}</p>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleRestore(item)}
                  className="touch-target-48 px-2.5 py-1.5 text-xs rounded-lg text-accent hover:bg-accent-muted transition-colors"
                >
                  Восстановить
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePermanent(item)}
                  className="touch-target-48 px-2.5 py-1.5 text-xs rounded-lg text-error hover:bg-error/10 transition-colors"
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export function TrashModal({ open, onClose, token, onRestore }: TrashModalProps) {
  const isMobile = useIsMobile();
  useRegisterOverlay(open, onClose);

  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Корзина" maxHeight="85dvh">
        <TrashContent token={token} onClose={onClose} onRestore={onRestore} />
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
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8 pointer-events-none">
            <motion.div
              className="pointer-events-auto w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border border-border overflow-hidden"
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
                <h2 className="text-lg font-medium text-text-primary">Корзина</h2>
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
                <TrashContent token={token} onClose={onClose} onRestore={onRestore} />
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
