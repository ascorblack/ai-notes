import { motion, AnimatePresence } from "framer-motion";
import { CalendarView } from "./CalendarView";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useRegisterOverlay } from "../../hooks/useRegisterOverlay";
import { BottomSheet } from "../ui/BottomSheet";

interface CalendarModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  onEventClick: (noteId: number) => void;
}

export function CalendarModal({
  open,
  onClose,
  token,
  onEventClick,
}: CalendarModalProps) {
  const isMobile = useIsMobile();
  useRegisterOverlay(open, onClose);
  const handleEventClick = (noteId: number) => {
    onEventClick(noteId);
    onClose();
  };

  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Календарь" maxHeight="90dvh">
        <div className="p-4">
          <CalendarView token={token} onEventClick={handleEventClick} />
        </div>
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
              className="pointer-events-auto w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl border border-border overflow-hidden"
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
              <h2 className="text-lg font-medium text-text-primary">Календарь</h2>
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
              <CalendarView token={token} onEventClick={handleEventClick} />
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
