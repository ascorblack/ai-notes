import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const SHORTCUTS = [
  { keys: ["⌘", "K"], desc: "Command Palette" },
  { keys: ["⌘", "⇧", "F"], desc: "Focus mode" },
  { keys: ["G", "N"], desc: "Заметки" },
  { keys: ["G", "T"], desc: "Задачи" },
  { keys: ["G", "C"], desc: "Чат" },
  { keys: ["?"], desc: "Горячие клавиши" },
  { keys: ["Esc"], desc: "Закрыть" },
];

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-surface border border-border rounded-xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-medium text-text-primary mb-4">Горячие клавиши</h2>
            <ul className="space-y-3">
              {SHORTCUTS.map((s) => (
                <li key={s.desc} className="flex items-center justify-between gap-4">
                  <span className="text-text-secondary text-sm">{s.desc}</span>
                  <div className="flex gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="px-2 py-0.5 text-xs rounded bg-bg border border-border text-text-muted font-mono"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-text-muted mt-4">Нажмите ? для закрытия</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
