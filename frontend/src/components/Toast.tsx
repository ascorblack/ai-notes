import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToastStore } from "../store/toastStore";

const DURATION_MS = 4000;

export function Toast() {
  const message = useToastStore((s) => s.message);
  const variant = useToastStore((s) => s.variant);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(dismiss, DURATION_MS);
    return () => clearTimeout(t);
  }, [message, dismiss]);

  const isSuccess = variant === "success";

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="alert"
          className={`fixed bottom-6 right-6 z-50 max-w-sm px-4 py-3 rounded-xl shadow-lg text-sm ${
            isSuccess
              ? "border-success/40 text-success bg-surface-elevated"
              : "border-error/40 text-error bg-surface-elevated"
          }`}
          style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
