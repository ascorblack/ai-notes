import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useRegisterOverlay } from "../../hooks/useRegisterOverlay";
import { BottomSheet } from "./BottomSheet";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const isMobile = useIsMobile();
  useRegisterOverlay(open, onCancel);

  const content = (
    <>
      <p className="px-4 pb-4 text-sm text-[var(--text-secondary)]">{message}</p>
      <div className="flex justify-end gap-2 px-4 pb-4">
        <button
          type="button"
          onClick={onCancel}
          className="touch-target-48 rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`touch-target-48 rounded-lg px-4 py-2 text-sm font-medium ${
            danger
              ? "bg-[var(--error)] text-white hover:opacity-90"
              : "bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={onCancel} title={title} maxHeight="50dvh">
        {content}
      </BottomSheet>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-modal-overlay"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className={`w-full max-w-md max-h-[min(85dvh,calc(100dvh-4rem))] overflow-y-auto rounded-xl border-l-4 p-4 shadow-xl pointer-events-auto bg-modal-panel backdrop-blur-md ${
                danger ? "border-error" : "border-accent/50 border-border"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
            <div className="pl-4 border-l-2 border-accent/60 bg-accent-muted/20 rounded-xl py-3 px-3">
            <h3 className="text-lg font-medium text-[var(--text-primary)]">{title}</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  danger
                    ? "bg-[var(--error)] text-white hover:opacity-90"
                    : "bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
            </div>
          </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
