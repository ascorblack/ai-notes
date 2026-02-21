import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, type TaskResponse, type SubtaskItem } from "../api/client";
import { useIsMobile } from "../hooks/useIsMobile";
import { useRegisterOverlay } from "../hooks/useRegisterOverlay";
import { BottomSheet } from "./ui/BottomSheet";

interface TaskEditModalProps {
  open: boolean;
  task: TaskResponse | null;
  token: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function TaskEditModal({ open, task, token, onClose, onSaved }: TaskEditModalProps) {
  const [title, setTitle] = useState("");
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  useRegisterOverlay(open, onClose);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setSubtasks(task.subtasks?.map((s) => ({ text: s.text, done: s.done })) ?? []);
      setError(null);
    }
  }, [task]);

  const addSubtask = () => {
    setSubtasks((prev) => [...prev, { text: "", done: false }]);
  };
  const removeSubtask = (idx: number) => {
    setSubtasks((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateSubtask = (idx: number, text: string, done: boolean) => {
    setSubtasks((prev) =>
      prev.map((s, i) => (i === idx ? { text, done } : s))
    );
  };

  const handleSave = async () => {
    if (!token || !task || !title.trim()) return;
    const validSubtasks = subtasks.filter((s) => s.text.trim()).map((s) => ({ text: s.text.trim(), done: s.done }));
    setSaving(true);
    setError(null);
    try {
      await api.notes.update(token, task.id, { title: title.trim() });
      await api.tasks.updateSubtasks(token, task.id, validSubtasks);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) onClose();
  };

  const contentNode = (
    <div className="flex flex-col gap-4 p-4">
      <div className="pl-4 border-l-2 border-accent/60 bg-accent-muted/20 rounded-xl py-3 px-3">
        <label htmlFor="task-edit-title" className="block text-sm font-medium text-text-muted mb-1">
          Название
        </label>
        <input
          id="task-edit-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-bg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
          placeholder="Название задачи"
          autoFocus
        />
      </div>
      <div className="pl-4 border-l-2 border-accent/60 bg-accent-muted/20 rounded-xl py-3 px-3">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-text-muted">Подзадачи</label>
          <button
            type="button"
            onClick={addSubtask}
            className="text-xs text-accent hover:underline touch-target-48"
          >
            + Добавить
          </button>
        </div>
        <div className="space-y-2">
          {subtasks.map((st, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={st.done}
                onChange={(e) => updateSubtask(idx, st.text, e.target.checked)}
                className="rounded border-border"
              />
              <input
                type="text"
                value={st.text}
                onChange={(e) => updateSubtask(idx, e.target.value, st.done)}
                placeholder="Текст подзадачи"
                className="flex-1 min-w-0 px-2 py-1.5 rounded border border-border/60 bg-bg text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => removeSubtask(idx)}
                className="touch-target-48 p-1 rounded text-text-muted hover:text-error hover:bg-error/10 shrink-0"
                aria-label="Удалить"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={handleClose}
          disabled={saving}
          className="touch-target-48 px-4 py-2 rounded-lg text-text-secondary hover:bg-accent-muted disabled:opacity-50"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="touch-target-48 px-4 py-2 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={handleClose} title="Название и подзадачи" maxHeight="85dvh">
        {contentNode}
      </BottomSheet>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-modal-overlay backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            aria-hidden={!open}
          />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl border border-l-4 border-accent/50 border-border/60 overflow-hidden bg-modal-panel backdrop-blur-md shadow-2xl"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 flex-shrink-0">
                <h2 className="text-lg font-medium text-text-primary">Название и подзадачи</h2>
                <button
                  type="button"
                  onClick={handleClose}
                  className="touch-target-48 p-2 rounded-lg text-text-secondary hover:text-accent hover:bg-accent-muted transition-colors"
                  aria-label="Закрыть"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">{contentNode}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
