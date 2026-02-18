import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRegisterOverlay } from "../../hooks/useRegisterOverlay";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Max height as CSS value, default 85dvh */
  maxHeight?: string;
  /** Optional title shown in header */
  title?: string;
  /** Show header with title and close button; default true. When false, close by swipe-down or backdrop tap */
  showHeader?: boolean;
}

export function BottomSheet({
  open,
  onClose,
  children,
  maxHeight = "85dvh",
  title,
  showHeader = true,
}: BottomSheetProps) {
  useRegisterOverlay(open, onClose);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleBackdropClick}
            aria-hidden="true"
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-[91] flex flex-col rounded-t-2xl border-t border-border shadow-2xl overflow-hidden"
            style={{
              backgroundColor: "var(--surface-elevated)",
              maxHeight,
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            onClick={(e) => e.stopPropagation()}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 300) onClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? "Панель"}
          >
            {/* Grab handle — swipe down to close */}
            <div className="flex-shrink-0 flex flex-col items-center justify-center pt-2 pb-3 cursor-grab active:cursor-grabbing min-h-[32px]">
              <div className="w-10 h-1 rounded-full bg-border" aria-hidden="true" />
            </div>
            {showHeader && (
              <div className="flex-shrink-0 flex items-center justify-between px-4 pb-2 gap-2">
                {title != null && (
                  <h2 className="text-lg font-medium text-text-primary truncate flex-1">{title}</h2>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="touch-target-48 p-2 rounded-lg text-text-secondary hover:text-accent hover:bg-accent-muted -mr-2"
                  aria-label="Закрыть"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
