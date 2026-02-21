import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "../api/client";
import { useRegisterOverlay } from "../hooks/useRegisterOverlay";

interface FolderModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  onSuccess?: () => void;
  mode: "create" | "rename";
  folderId?: number;
  parentFolderId?: number | null;
  initialName?: string;
}

export function FolderModal({ open, onClose, token, onSuccess, mode, folderId, parentFolderId, initialName }: FolderModalProps) {
  useRegisterOverlay(open, onClose);
  const [name, setName] = useState("");

  useEffect(() => {
    if (open && mode === "rename" && initialName != null) {
      setName(initialName);
    } else if (open && mode === "create") {
      setName("");
    }
  }, [open, mode, initialName]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!name.trim()) {
      setError("Введите название папки");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "create") {
        await api.folders.create(token, { name: name.trim(), parent_folder_id: parentFolderId });
      } else if (mode === "rename" && folderId != null) {
        await api.folders.update(token, folderId, { name: name.trim() });
      }
      setName("");
      onClose();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при сохранении");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-modal-overlay backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="rounded-2xl border border-l-4 border-accent/50 border-border/60 shadow-2xl w-full max-w-md overflow-hidden bg-modal-panel backdrop-blur-md"
      >
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <h2 className="text-lg font-medium text-text-primary mb-4">
              {mode === "create" ? "Новая папка" : "Переименовать папку"}
            </h2>
            <div className="space-y-4">
              <div className="pl-4 border-l-2 border-accent/60 bg-accent-muted/20 rounded-xl py-3 px-3">
                <label htmlFor="folder-name" className="block text-sm font-medium text-text-secondary mb-2">
                  Название
                </label>
                <input
                  id="folder-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Мои заметки"
                  className="w-full px-4 py-2.5 rounded-xl border border-border/60 bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
                  autoFocus
                  disabled={isSubmitting}
                />
                {error && (
                  <p className="mt-2 text-sm text-error">{error}</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-3 p-4 border-t border-border/60 bg-bg/50">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-accent-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Сохранение..." : mode === "create" ? "Создать" : "Сохранить"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
