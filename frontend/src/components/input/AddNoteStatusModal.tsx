import { motion, AnimatePresence } from "framer-motion";

export type AddNoteStep =
  | "received"
  | "classifying"
  | "loading_context"
  | "analyzing"
  | "creating"
  | "saving"
  | "done"
  | "error";

interface AddNoteStatusModalProps {
  step: AddNoteStep;
  currentMessage?: string;
  errorMessage?: string;
  intentLabel?: string;
}

function stepLabel(step: AddNoteStep): string {
  switch (step) {
    case "received":
      return "Получил запрос";
    case "classifying":
      return "Определяю тип…";
    case "loading_context":
      return "Загрузка контекста…";
    case "analyzing":
      return "Анализирую…";
    case "creating":
      return "Выполняю…";
    case "saving":
      return "Сохраняю…";
    case "done":
      return "Готово";
    case "error":
      return "Ошибка";
    default:
      return "";
  }
}

function stepOrder(s: AddNoteStep): number {
  const o: Record<AddNoteStep, number> = {
    received: 0,
    classifying: 1,
    loading_context: 2,
    analyzing: 3,
    creating: 4,
    saving: 5,
    done: 6,
    error: 7,
  };
  return o[s] ?? -1;
}

export function AddNoteStatusModal({
  step,
  currentMessage,
  errorMessage,
  intentLabel,
}: AddNoteStatusModalProps) {
  const steps: AddNoteStep[] = ["received", "classifying", "loading_context", "analyzing", "creating", "saving", "done"];
  const currentOrder = stepOrder(step);
  const isError = step === "error";

  const displayMessage = (s: AddNoteStep) => {
    if (s === "classifying" && intentLabel) return `Запрос: ${intentLabel}`;
    if (s === "creating" && currentMessage) return currentMessage;
    return stepLabel(s);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6"
      aria-modal="true"
      role="dialog"
      aria-label="Статус добавления"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="absolute inset-0 bg-modal-overlay backdrop-blur-sm"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="relative w-full max-w-sm rounded-2xl border border-l-4 border-accent/50 border-border bg-modal-panel backdrop-blur-md shadow-2xl overflow-hidden"
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4 }}
        transition={{ type: "spring", damping: 25, stiffness: 400 }}
      >
        <div className="px-5 py-4 border-b border-border/60">
          <h3 className="text-base font-semibold text-text-primary">
            Добавление
          </h3>
          <AnimatePresence mode="wait">
            {intentLabel && (
              <motion.span
                key={intentLabel}
                initial={{ opacity: 0, y: -4, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="inline-block mt-2 px-2.5 py-1 rounded-lg text-xs font-medium bg-accent/20 text-accent"
              >
                {intentLabel}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="px-5 py-5 pl-4 border-l-2 border-accent/60 bg-accent-muted/20 rounded-xl mx-3 mb-3 space-y-2.5">
          {isError ? (
            <motion.p
              className="text-error text-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {errorMessage ?? "Произошла ошибка"}
            </motion.p>
          ) : (
            <>
              {steps.map((s, idx) => {
                const order = stepOrder(s);
                const isCompleted = order < currentOrder || step === "done";
                const isActive = order === currentOrder;
                return (
                  <motion.div
                    key={s}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`flex items-center gap-3 text-sm ${
                      isActive ? "text-accent font-medium" : isCompleted ? "text-text-secondary" : "text-text-muted"
                    }`}
                  >
                    <motion.div
                      className="shrink-0 w-6 h-6 flex items-center justify-center"
                      layout
                    >
                      {isCompleted ? (
                        <motion.svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", damping: 15, stiffness: 400 }}
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </motion.svg>
                      ) : isActive ? (
                        <motion.span
                          className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                        />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-current opacity-50" />
                      )}
                    </motion.div>
                    <span className="truncate">{displayMessage(s)}</span>
                  </motion.div>
                );
              })}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
