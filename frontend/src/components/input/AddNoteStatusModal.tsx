import { motion } from "framer-motion";

export type AddNoteStep =
  | "received"
  | "loading_context"
  | "analyzing"
  | "creating"
  | "done"
  | "error";

interface AddNoteStatusModalProps {
  step: AddNoteStep;
  currentMessage?: string;
  errorMessage?: string;
}

function stepLabel(step: AddNoteStep): string {
  switch (step) {
    case "received":
      return "Получил запрос";
    case "loading_context":
      return "Загрузка контекста…";
    case "analyzing":
      return "Анализирую…";
    case "creating":
      return "Создаю…";
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
    loading_context: 1,
    analyzing: 2,
    creating: 3,
    done: 4,
    error: 5,
  };
  return o[s] ?? -1;
}

export function AddNoteStatusModal({
  step,
  currentMessage,
  errorMessage,
}: AddNoteStatusModalProps) {
  const steps: AddNoteStep[] = ["received", "loading_context", "analyzing", "creating", "done"];
  const currentOrder = stepOrder(step);
  const isError = step === "error";

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-label="Статус добавления заметки"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
      />
      <motion.div
        className="relative w-full max-w-sm rounded-2xl border border-border bg-surface-elevated shadow-2xl overflow-hidden"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2 }}
      >
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-text-primary">
            Добавление заметки
          </h3>
        </div>
        <div className="px-5 py-5 space-y-3">
          {isError ? (
            <p className="text-error text-sm">{errorMessage ?? "Произошла ошибка"}</p>
          ) : (
            <>
              {steps.map((s) => {
                const order = stepOrder(s);
                const isCompleted = order < currentOrder || step === "done";
                const isActive = order === currentOrder;
                return (
                  <div
                    key={s}
                    className={`flex items-center gap-3 text-sm ${
                      isActive ? "text-accent" : isCompleted ? "text-text-secondary" : "text-text-muted"
                    }`}
                  >
                    <div className="shrink-0 w-6 h-6 flex items-center justify-center">
                      {isCompleted ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : isActive ? (
                        <span className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-current opacity-50" />
                      )}
                    </div>
                    <span>
                      {isActive && s === "creating" && currentMessage
                        ? currentMessage
                        : stepLabel(s)}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
