import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useRegisterOverlay } from "../../hooks/useRegisterOverlay";
import { BottomSheet } from "../ui/BottomSheet";

export interface NoteCandidate {
  note_id: number;
  title: string;
}

interface NoteSelectionModalProps {
  open: boolean;
  candidates: NoteCandidate[];
  onSelect: (noteId: number) => void;
  onCancel: () => void;
}

export function NoteSelectionModal({
  open,
  candidates,
  onSelect,
  onCancel,
}: NoteSelectionModalProps) {
  const isMobile = useIsMobile();
  useRegisterOverlay(open, onCancel);

  if (isMobile) {
    return (
      <BottomSheet
        open={open}
        onClose={onCancel}
        title="Выберите заметку для редактирования"
        maxHeight="70dvh"
      >
        <p className="px-4 pb-2 text-sm text-text-muted">
          К какую заметку применить изменения?
        </p>
        <div className="max-h-72 overflow-y-auto">
          {candidates.map((c) => (
            <button
              key={c.note_id}
              type="button"
              onClick={() => onSelect(c.note_id)}
              className="touch-target-48 w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-accent-muted/50 transition-colors border-b border-border last:border-b-0"
            >
              <span className="text-text-primary font-medium truncate flex-1">
                {c.title || `Заметка #${c.note_id}`}
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="touch-target-48 px-4 py-2 text-sm text-text-muted hover:text-text-primary"
          >
            Отмена
          </button>
        </div>
      </BottomSheet>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-label="Выбор заметки для редактирования"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onCancel}
      />
      <motion.div
        className="relative w-full max-w-md rounded-2xl border border-border bg-surface-elevated shadow-2xl overflow-hidden"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-text-primary">
            Выберите заметку для редактирования
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            К какую заметку применить изменения?
          </p>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {candidates.map((c) => (
            <button
              key={c.note_id}
              type="button"
              onClick={() => onSelect(c.note_id)}
              className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-accent-muted/50 transition-colors border-b border-border last:border-b-0"
            >
              <span className="text-text-primary font-medium truncate flex-1">
                {c.title || `Заметка #${c.note_id}`}
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary"
          >
            Отмена
          </button>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
