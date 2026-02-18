import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "../store/authStore";
import { api, type TaskResponse } from "../api/client";

export function TasksPage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);


  const { data: categories } = useQuery({
    queryKey: ["tasksCategories", token],
    queryFn: () => api.tasks.categories(token!),
    enabled: !!token,
  });
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", token, showCompleted, categoryId],
    queryFn: () => api.tasks.list(token!, showCompleted, categoryId),
    enabled: !!token,
  });

  const handleComplete = async (taskId: number, isCompleted: boolean) => {
    if (!token) return;
    if (isCompleted) {
      await api.tasks.uncomplete(token, taskId);
    } else {
      await api.tasks.complete(token, taskId);
    }
    queryClient.invalidateQueries({ queryKey: ["tasks", token] });
  };

  const handleCategoryChange = (id: number | null) => {
    setCategoryId(id);
  };

  const handleSubtaskToggle = async (task: TaskResponse, idx: number) => {
    if (!token || !task.subtasks) return;
    const newSubtasks = [...task.subtasks];
    newSubtasks[idx] = { ...newSubtasks[idx], done: !newSubtasks[idx].done };
    await api.tasks.updateSubtasks(token, task.id, newSubtasks);
    queryClient.invalidateQueries({ queryKey: ["tasks", token] });
  };

  const pendingTasks = tasks?.filter((t) => !t.completed_at) ?? [];
  const completedTasks = tasks?.filter((t) => t.completed_at) ?? [];

  if (!token) return null;

  return (
    <div
      className="h-full flex flex-col min-h-0 w-full max-w-[100vw] overflow-x-hidden overflow-y-hidden"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
    >
      <header className="h-14 sm:h-16 flex-shrink-0 flex items-center justify-between px-3 sm:px-6 border-b border-border/60 bg-surface/80 backdrop-blur-sm gap-2 min-w-0 overflow-hidden">
        <Link
          to="/"
          className="touch-target-48 flex items-center gap-2 shrink-0 text-text-secondary hover:text-accent transition-colors"
          aria-label="Назад к заметкам"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline text-sm">Заметки</span>
        </Link>
        <h1 className="text-lg sm:text-xl font-medium text-text-primary truncate min-w-0 flex-1 text-center px-2">Задачи</h1>
        <button
          type="button"
          onClick={() => setShowCompleted((v) => !v)}
          className={`text-sm touch-target-48 shrink-0 px-3 py-1.5 rounded-lg transition-colors ${
            showCompleted
              ? "bg-accent text-white"
              : "text-text-secondary hover:text-accent hover:bg-accent-muted"
          }`}
        >
          {showCompleted ? "Скрыть выполненные" : "Показать выполненные"}
        </button>
      </header>

      {categories && categories.length > 0 && (
        <div className="flex-shrink-0 flex gap-2 px-3 sm:px-6 py-2 border-b border-border/40 overflow-x-auto">
          <button
            type="button"
            onClick={() => handleCategoryChange(null)}
            className={`touch-target-48 shrink-0 px-3 py-2 rounded-lg text-sm transition-colors ${
              categoryId === null
                ? "bg-accent text-white"
                : "text-text-secondary hover:text-accent hover:bg-accent-muted"
            }`}
          >
            Все
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryChange(cat.id)}
              className={`touch-target-48 shrink-0 px-3 py-2 rounded-lg text-sm transition-colors ${
                categoryId === cat.id
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-accent hover:bg-accent-muted"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      <main className="flex-1 overflow-auto p-3 sm:p-6">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {pendingTasks.length === 0 && !showCompleted && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-text-muted py-12"
                >
                  Нет активных задач
                </motion.div>
              )}

              {pendingTasks.map((task) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-surface border border-border/60 rounded-xl p-4 hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => handleComplete(task.id, false)}
                      className="mt-0.5 touch-target-48 w-5 h-5 rounded-md border-2 border-accent/60 hover:bg-accent/20 flex-shrink-0 flex items-center justify-center transition-colors"
                      aria-label="Отметить выполненным"
                    />
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                        className="touch-target-48 w-full text-left"
                      >
                        <h3 className="font-medium text-text-primary truncate">{task.title}</h3>
                      </button>
                      {task.subtasks && task.subtasks.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {task.subtasks.map((st, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleSubtaskToggle(task, idx)}
                              className="touch-target-48 w-full flex items-center gap-2 text-left rounded-lg -mx-1 px-1 -my-0.5 py-0.5 hover:bg-accent/10 transition-colors"
                            >
                              <span
                                className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                  st.done
                                    ? "bg-accent border-accent text-white"
                                    : "border-border"
                                }`}
                              >
                                {st.done && (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                )}
                              </span>
                              <span
                                className={`text-sm flex-1 min-w-0 ${
                                  st.done ? "text-text-muted line-through" : "text-text-secondary"
                                }`}
                              >
                                {st.text}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <AnimatePresence>
                        {expandedTask === task.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 pt-3 border-t border-border/40 text-sm text-text-secondary whitespace-pre-wrap">
                              {task.content}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              ))}

              {showCompleted && completedTasks.length > 0 && (
                <>
                  <div className="text-sm text-text-muted mt-6 mb-2">Выполненные</div>
                  {completedTasks.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-surface/50 border border-border/40 rounded-xl p-4 opacity-60"
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => handleComplete(task.id, true)}
                          className="mt-0.5 touch-target-48 w-5 h-5 rounded-md bg-accent flex-shrink-0 flex items-center justify-center text-white"
                          aria-label="Вернуть в активные"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        </button>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-text-muted line-through truncate">
                            {task.title}
                          </h3>
                          {task.completed_at && (
                            <p className="text-xs text-text-muted mt-1">
                              Выполнено: {new Date(task.completed_at).toLocaleDateString("ru-RU")}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
