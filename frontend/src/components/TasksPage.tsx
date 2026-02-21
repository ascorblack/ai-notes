import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useAuthStore } from "../store/authStore";
import { useTreeStore } from "../store/treeStore";
import { useIsMobile } from "../hooks/useIsMobile";
import { api, type TaskResponse } from "../api/client";
import * as reminders from "../services/reminders";
import { TaskEditModal } from "./TaskEditModal";

const PRIORITY_COLORS: Record<string, string> = {
  high: "#EF4444",
  medium: "#F97316",
  low: "#6B7280",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
};

const KANBAN_COLUMNS = [
  { id: "backlog", title: "Backlog" },
  { id: "in_progress", title: "In Progress" },
  { id: "in_test", title: "In Test" },
  { id: "done", title: "Done" },
] as const;

type KanbanStatus = (typeof KANBAN_COLUMNS)[number]["id"];

function getTaskStatus(task: TaskResponse): KanbanStatus {
  if (task.completed_at) return "done";
  return (task.task_status as KanbanStatus) || "backlog";
}

function formatDeadline(deadline: string): string {
  const d = new Date(deadline);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `Просрочено ${d.toLocaleDateString("ru-RU")}`;
  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Завтра";
  if (diffDays <= 7) return `${diffDays} дн.`;
  return d.toLocaleDateString("ru-RU");
}

function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

const PRIORITY_SELECT_STYLE = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.4rem center",
  paddingRight: "1.5rem",
};

function TaskContentPopup({
  task,
  onClose,
}: {
  task: TaskResponse;
  onClose: () => void;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] bg-modal-overlay backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="fixed inset-0 z-[81] flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none"
        aria-hidden
      >
        <div
          className="w-full max-w-[420px] max-h-[85dvh] sm:max-h-[70vh] rounded-xl border border-l-4 border-accent/50 border-border bg-modal-panel backdrop-blur-md shadow-2xl overflow-hidden flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 flex-shrink-0">
          <h3 className="font-medium text-text-primary truncate flex-1">{task.title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="touch-target-48 p-2 rounded-lg text-text-muted hover:text-accent hover:bg-accent-muted shrink-0"
            aria-label="Закрыть"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto overscroll-contain p-4 [-webkit-overflow-scrolling:touch]">
          <div className="prose dark:prose-invert prose-headings:text-text-primary prose-p:text-text-primary prose-li:text-text-primary prose-a:text-accent prose-code:text-accent prose-pre:bg-surface prose-pre:rounded-lg prose-pre:border prose-pre:border-border/40 max-w-none text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {task.content?.trim() || "*Описание отсутствует*"}
            </ReactMarkdown>
          </div>
        </div>
        </div>
      </motion.div>
    </>
  );
}

function TaskCard({
  task,
  onComplete,
  onExpand,
  onShowContent,
  onEdit,
  onOpenNote,
  expanded,
  onSubtaskToggle,
  onPriorityChange,
}: {
  task: TaskResponse;
  onComplete: (id: number, done: boolean) => void;
  onExpand: (id: number | null) => void;
  onShowContent?: (task: TaskResponse) => void;
  onEdit?: (task: TaskResponse) => void;
  onOpenNote?: (taskId: number) => void;
  expanded: boolean;
  onSubtaskToggle: (task: TaskResponse, idx: number) => void;
  onPriorityChange?: (taskId: number, priority: "high" | "medium" | "low") => void;
}) {
  return (
    <div
      className={`bg-surface border rounded-xl p-4 hover:border-accent/40 transition-all duration-200 cursor-pointer active:scale-[0.99] ${
        isOverdue(task.deadline) ? "border-red-400/60" : "border-border/60"
      }`}
      onClick={() => onShowContent?.(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onShowContent?.(task);
        }
      }}
    >
      <div className="flex items-start gap-3">
        {!task.completed_at && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onComplete(task.id, false); }}
            className="mt-0.5 touch-target-48 w-5 h-5 rounded-md border-2 border-accent/60 hover:bg-accent/20 flex-shrink-0 flex items-center justify-center transition-all duration-200 active:scale-95"
            aria-label="Отметить выполненным"
          />
        )}
        {task.completed_at && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onComplete(task.id, true); }}
            className="mt-0.5 touch-target-48 w-5 h-5 rounded-md bg-accent flex-shrink-0 flex items-center justify-center text-white transition-transform duration-200 active:scale-95"
            aria-label="Вернуть в активные"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className={`font-medium text-sm break-words flex-1 min-w-0 ${task.completed_at ? "text-text-muted line-through" : "text-text-primary"}`}>
              {task.title}
            </h3>
            <div className="flex items-center gap-0.5 shrink-0">
              {onEdit && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                  className="touch-target-48 p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent-muted transition-all duration-200 active:scale-95"
                  aria-label="Редактировать название и подзадачи"
                  title="Название и подзадачи"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}
              {onOpenNote && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenNote(task.id); }}
                  className="touch-target-48 p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent-muted transition-all duration-200 active:scale-95"
                  aria-label="Полное описание"
                  title="Полное описание"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </button>
              )}
            </div>
            {onPriorityChange ? (
              <select
                value={task.priority || "medium"}
                onChange={(e) => onPriorityChange(task.id, e.target.value as "high" | "medium" | "low")}
                className="shrink-0 touch-target-48 text-xs font-medium text-white rounded border-0 py-0.5 pl-2 pr-6 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/50"
                style={{
                  ...PRIORITY_SELECT_STYLE,
                  backgroundColor: PRIORITY_COLORS[task.priority || "medium"] || PRIORITY_COLORS.medium,
                }}
                aria-label="Приоритет задачи"
                onClick={(e) => e.stopPropagation()}
              >
                <option value="high">Высокий</option>
                <option value="medium">Средний</option>
                <option value="low">Низкий</option>
              </select>
            ) : (
              task.priority && (
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium text-white shrink-0"
                  style={{ backgroundColor: PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium }}
                >
                  {PRIORITY_LABELS[task.priority]}
                </span>
              )
            )}
          </div>
          {task.deadline && (
            <p className={`text-xs mt-1 ${isOverdue(task.deadline) ? "text-red-500 font-medium" : "text-text-muted"}`}>
              {formatDeadline(task.deadline)}
            </p>
          )}
          {task.subtasks && task.subtasks.length > 0 && (
            <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
              {!expanded ? (
                <div className="flex items-center gap-1.5 text-xs text-text-muted mb-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  <span>{task.subtasks.filter((s) => s.done).length}/{task.subtasks.length} подзадач</span>
                </div>
              ) : null}
              {!expanded
                ? task.subtasks.map((st, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onExpand(task.id)}
                      className="touch-target-48 w-full flex items-center gap-2 text-left rounded-lg -mx-1 px-1 -my-0.5 py-0.5 hover:bg-accent/10 transition-all duration-200 active:scale-[0.99]"
                    >
                      <span className={`text-sm flex-1 min-w-0 truncate ${st.done ? "text-text-muted line-through" : "text-text-secondary"}`}>
                        {st.text}
                      </span>
                    </button>
                  ))
                : null}
              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 400 }}
                    className="overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => onExpand(null)}
                      className="mt-2 touch-target-48 flex items-center gap-1.5 text-xs text-text-muted hover:text-accent -ml-1 pl-1 transition-colors duration-200 active:scale-95"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="rotate-180">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                      Свернуть
                    </button>
                    <div className="mt-1 pt-2 border-t border-border/40 space-y-2">
                      {task.subtasks.map((st, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => onSubtaskToggle(task, idx)}
                          className="touch-target-48 w-full flex items-center gap-2 text-left rounded-lg -mx-1 px-1 -my-0.5 py-0.5 hover:bg-accent/10 transition-all duration-200 active:scale-[0.99]"
                        >
                          <span
                            className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-all duration-200 ${
                              st.done ? "bg-accent border-accent text-white" : "border-border"
                            }`}
                          >
                            {st.done && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            )}
                          </span>
                          <span className={`text-sm flex-1 min-w-0 ${st.done ? "text-text-muted line-through" : "text-text-secondary"}`}>
                            {st.text}
                          </span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TasksPage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setSelectedNote = useTreeStore((s) => s.setSelectedNote);
  const [showCompleted, setShowCompleted] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban");
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TaskResponse | null>(null);
  const [mobileKanbanTab, setMobileKanbanTab] = useState<KanbanStatus>("backlog");
  const [editingTask, setEditingTask] = useState<TaskResponse | null>(null);
  const [contentPopupTask, setContentPopupTask] = useState<TaskResponse | null>(null);
  const isMobile = useIsMobile();

  const { data: categories } = useQuery({
    queryKey: ["tasksCategories", token],
    queryFn: () => api.tasks.categories(token!),
    enabled: !!token,
  });
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", token, true, categoryId],
    queryFn: () => api.tasks.list(token!, true, categoryId),
    enabled: !!token,
  });

  useEffect(() => {
    if (!tasks) return;
    for (const t of tasks) {
      if (t.deadline && !t.completed_at && new Date(t.deadline) > new Date()) {
        reminders.scheduleReminder(t.id, t.title, t.deadline);
      } else {
        reminders.cancelReminder(t.id);
      }
    }
  }, [tasks]);

  const handleComplete = async (taskId: number, isCompleted: boolean) => {
    if (!token) return;
    if (isCompleted) {
      await api.tasks.uncomplete(token, taskId);
    } else {
      import("../lib/haptics").then(({ hapticLight }) => hapticLight());
      await api.tasks.complete(token, taskId);
    }
    queryClient.invalidateQueries({ queryKey: ["tasks", token] });
  };

  const handleStatusChange = useCallback(
    async (taskId: number, newStatus: KanbanStatus) => {
      if (!token) return;
      const task = tasks?.find((t) => t.id === taskId);
      if (newStatus === "done") {
        if (!task?.completed_at) await api.tasks.complete(token, taskId);
      } else {
        if (task?.completed_at) await api.tasks.uncomplete(token, taskId);
        await api.tasks.update(token, taskId, { task_status: newStatus });
      }
      queryClient.invalidateQueries({ queryKey: ["tasks", token] });
    },
    [token, tasks]
  );

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

  const handlePriorityChange = async (taskId: number, priority: "high" | "medium" | "low") => {
    if (!token) return;
    await api.tasks.update(token, taskId, { priority });
    queryClient.invalidateQueries({ queryKey: ["tasks", token] });
  };

  const handleOpenNote = useCallback(
    (taskId: number) => {
      setSelectedNote(taskId);
      navigate("/");
    },
    [setSelectedNote, navigate]
  );

  const filteredTasks = tasks?.filter((t) => {
    if (priorityFilter && t.priority !== priorityFilter) return false;
    if (!showCompleted && t.completed_at) return false;
    return true;
  }) ?? [];

  const pendingTasks = filteredTasks.filter((t) => !t.completed_at);
  const completedTasks = filteredTasks.filter((t) => t.completed_at);

  const backlogTasks = pendingTasks.filter((t) => getTaskStatus(t) === "backlog");
  const inProgressTasks = pendingTasks.filter((t) => getTaskStatus(t) === "in_progress");
  const inTestTasks = pendingTasks.filter((t) => getTaskStatus(t) === "in_test");
  const doneTasks = completedTasks;

  const overdueCount = pendingTasks.filter((t) => isOverdue(t.deadline)).length;

  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 8 },
    }),
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = (e: DragStartEvent) => {
    const id = e.active.id as number;
    const task = tasks?.find((t) => t.id === id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const taskId = e.active.id as number;
    const overId = e.over?.id;
    const task = tasks?.find((t) => t.id === taskId);
    const currentStatus = task ? getTaskStatus(task) : null;
    setActiveTask(null);

    if (overId === "kanban-prev" && currentStatus) {
      const idx = KANBAN_COLUMNS.findIndex((c) => c.id === currentStatus);
      if (idx > 0) {
        import("../lib/haptics").then(({ hapticLight }) => hapticLight());
        handleStatusChange(taskId, KANBAN_COLUMNS[idx - 1].id);
      }
      return;
    }
    if (overId === "kanban-next" && currentStatus) {
      const idx = KANBAN_COLUMNS.findIndex((c) => c.id === currentStatus);
      if (idx >= 0 && idx < KANBAN_COLUMNS.length - 1) {
        import("../lib/haptics").then(({ hapticLight }) => hapticLight());
        handleStatusChange(taskId, KANBAN_COLUMNS[idx + 1].id);
      }
      return;
    }
    if (overId && typeof overId === "string" && KANBAN_COLUMNS.some((c) => c.id === overId)) {
      handleStatusChange(taskId, overId as KanbanStatus);
    }
  };

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
          className="touch-target-48 flex items-center gap-2 shrink-0 text-text-secondary hover:text-accent transition-all duration-200 active:scale-95"
          aria-label="Назад к заметкам"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline text-sm">Заметки</span>
        </Link>
        <h1 className="text-lg sm:text-xl font-medium text-text-primary truncate min-w-0 flex-1 text-center px-2">
          Задачи
          {overdueCount > 0 && (
            <span className="ml-2 text-xs text-red-500 font-normal">({overdueCount} просрочено)</span>
          )}
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === "kanban" ? "list" : "kanban")}
            className="text-sm touch-target-48 px-2 py-1.5 rounded-lg text-text-secondary hover:text-accent hover:bg-accent-muted transition-all duration-200 active:scale-95"
            title={viewMode === "kanban" ? "Список" : "Kanban"}
          >
            {viewMode === "kanban" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
                className={`text-sm touch-target-48 shrink-0 px-3 py-1.5 rounded-lg transition-all duration-200 active:scale-95 ${
                  showCompleted ? "bg-accent text-white" : "text-text-secondary hover:text-accent hover:bg-accent-muted"
                }`}
          >
            {showCompleted ? "Скрыть" : "Выполн."}
          </button>
        </div>
      </header>

      <div className="flex-shrink-0 flex flex-wrap sm:flex-nowrap gap-2 px-3 sm:px-6 py-2 border-b border-border/40 overflow-x-auto items-center min-h-[44px]">
        {categories && categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 shrink-0 -mx-1 px-1 [&::-webkit-scrollbar]:h-1">
            <button
              type="button"
              onClick={() => handleCategoryChange(null)}
              className={`touch-target-48 shrink-0 px-3 py-2 rounded-lg text-sm transition-all duration-200 active:scale-95 whitespace-nowrap ${
                categoryId === null ? "bg-accent text-white" : "text-text-secondary hover:text-accent hover:bg-accent-muted"
              }`}
            >
              Все
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryChange(cat.id)}
                className={`touch-target-48 shrink-0 px-3 py-2 rounded-lg text-sm transition-all duration-200 active:scale-95 whitespace-nowrap ${
                  categoryId === cat.id ? "bg-accent text-white" : "text-text-secondary hover:text-accent hover:bg-accent-muted"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <label htmlFor="tasks-priority-filter" className="text-sm text-text-muted shrink-0 hidden sm:inline">
            Приоритет:
          </label>
          <select
            id="tasks-priority-filter"
            value={priorityFilter ?? ""}
            onChange={(e) => setPriorityFilter(e.target.value || null)}
            className={`touch-target-48 h-9 min-w-0 w-[100px] sm:w-[130px] px-3 py-1.5 rounded-lg text-sm bg-bg border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent appearance-none cursor-pointer transition-colors duration-200 ${
              priorityFilter ? "border-accent/50" : "border-border"
            }`}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 0.5rem center",
              paddingRight: "1.75rem",
            }}
            aria-label="Фильтр по приоритету"
          >
            <option value="">Все</option>
            <option value="high">Высокий</option>
            <option value="medium">Средний</option>
            <option value="low">Низкий</option>
          </select>
        </div>
      </div>

      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {isLoading ? (
          <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : viewMode === "kanban" ? (
          isMobile ? (
            <>
              <div
                className="flex-1 min-h-0 overflow-auto p-3 sm:p-6 touch-pan-y"
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  (e.currentTarget as HTMLDivElement & { _swipe?: { x: number; y: number; onTask: boolean } })._swipe = {
                    x: t.clientX,
                    y: t.clientY,
                    onTask: !!(e.target as HTMLElement).closest("[data-swipe-target='task']"),
                  };
                }}
                onTouchEnd={(e) => {
                  const el = e.currentTarget as HTMLDivElement & { _swipe?: { x: number; y: number; onTask: boolean } };
                  const swipe = el._swipe;
                  el._swipe = undefined;
                  if (!swipe || swipe.onTask) return;
                  const t = e.changedTouches[0];
                  const dx = t.clientX - swipe.x;
                  const dy = t.clientY - swipe.y;
                  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
                  const idx = KANBAN_COLUMNS.findIndex((c) => c.id === mobileKanbanTab);
                  if (dx > 0 && idx > 0) {
                    setMobileKanbanTab(KANBAN_COLUMNS[idx - 1].id);
                    import("../lib/haptics").then(({ hapticLight }) => hapticLight());
                  } else if (dx < 0 && idx < KANBAN_COLUMNS.length - 1) {
                    setMobileKanbanTab(KANBAN_COLUMNS[idx + 1].id);
                    import("../lib/haptics").then(({ hapticLight }) => hapticLight());
                  }
                }}
              >
                <MobileKanbanColumn
                  currentStatus={mobileKanbanTab}
                  tasks={
                    mobileKanbanTab === "backlog"
                      ? backlogTasks
                      : mobileKanbanTab === "in_progress"
                        ? inProgressTasks
                        : mobileKanbanTab === "in_test"
                          ? inTestTasks
                          : doneTasks
                  }
                  onComplete={handleComplete}
                  onExpand={setExpandedTask}
                  onShowContent={setContentPopupTask}
                  onEdit={setEditingTask}
                  onOpenNote={handleOpenNote}
                  expandedTask={expandedTask}
                  onSubtaskToggle={handleSubtaskToggle}
                  onPriorityChange={handlePriorityChange}
                  onStatusChange={handleStatusChange}
                />
              </div>
              <div className="flex-shrink-0 flex border-t border-border/60 bg-surface/95 pb-[env(safe-area-inset-bottom)]">
                {KANBAN_COLUMNS.map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => setMobileKanbanTab(col.id)}
                    className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-all duration-200 active:scale-95 touch-target-48 ${
                      mobileKanbanTab === col.id ? "text-accent font-medium" : "text-text-muted"
                    }`}
                  >
                    <span className="text-sm">{col.title}</span>
                    <span className="text-xs opacity-80">
                      {col.id === "backlog"
                        ? backlogTasks.length
                        : col.id === "in_progress"
                          ? inProgressTasks.length
                          : col.id === "in_test"
                            ? inTestTasks.length
                            : doneTasks.length}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="flex-1 overflow-auto p-3 sm:p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-full min-h-[400px]">
                  <KanbanColumn
                    column={KANBAN_COLUMNS[0]}
                    tasks={backlogTasks}
                    onComplete={handleComplete}
                    onExpand={setExpandedTask}
                    onShowContent={setContentPopupTask}
                    onEdit={setEditingTask}
                    onOpenNote={handleOpenNote}
                    expandedTask={expandedTask}
                    onSubtaskToggle={handleSubtaskToggle}
                    onPriorityChange={handlePriorityChange}
                  />
                  <KanbanColumn
                    column={KANBAN_COLUMNS[1]}
                    tasks={inProgressTasks}
                    onComplete={handleComplete}
                    onExpand={setExpandedTask}
                    onShowContent={setContentPopupTask}
                    onEdit={setEditingTask}
                    onOpenNote={handleOpenNote}
                    expandedTask={expandedTask}
                    onSubtaskToggle={handleSubtaskToggle}
                    onPriorityChange={handlePriorityChange}
                  />
                  <KanbanColumn
                    column={KANBAN_COLUMNS[2]}
                    tasks={inTestTasks}
                    onComplete={handleComplete}
                    onExpand={setExpandedTask}
                    onShowContent={setContentPopupTask}
                    onEdit={setEditingTask}
                    onOpenNote={handleOpenNote}
                    expandedTask={expandedTask}
                    onSubtaskToggle={handleSubtaskToggle}
                    onPriorityChange={handlePriorityChange}
                  />
                  <KanbanColumn
                    column={KANBAN_COLUMNS[3]}
                    tasks={doneTasks}
                    onComplete={handleComplete}
                    onExpand={setExpandedTask}
                    onShowContent={setContentPopupTask}
                    onEdit={setEditingTask}
                    onOpenNote={handleOpenNote}
                    expandedTask={expandedTask}
                    onSubtaskToggle={handleSubtaskToggle}
                    onPriorityChange={handlePriorityChange}
                  />
                </div>
              </div>
              <DragOverlay>
                {activeTask ? (
                  <div className="opacity-90 shadow-xl rounded-xl">
                    <TaskCard
                      task={activeTask}
                      onComplete={() => {}}
                      onExpand={() => {}}
                      expanded={false}
                      onSubtaskToggle={() => {}}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )
        ) : (
          <div className="flex-1 overflow-auto p-3 sm:p-6">
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
              {pendingTasks.length === 0 && !showCompleted && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 px-4">
                  <p className="text-text-muted font-medium">Нет активных задач</p>
                  <p className="text-text-muted text-sm mt-1">Создайте задачу через ⌘K → «Новая заметка» или добавьте через агента</p>
                </motion.div>
              )}
              {pendingTasks.map((task) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ type: "spring", damping: 25, stiffness: 400 }}
                >
                  <TaskCard
                    task={task}
                    onComplete={handleComplete}
                    onExpand={setExpandedTask}
                    onShowContent={setContentPopupTask}
                    onEdit={setEditingTask}
                    onOpenNote={handleOpenNote}
                    expanded={expandedTask === task.id}
                    onSubtaskToggle={handleSubtaskToggle}
                    onPriorityChange={handlePriorityChange}
                  />
                </motion.div>
              ))}
              {showCompleted && completedTasks.length > 0 && (
                <>
                  <div className="text-sm text-text-muted mt-6 mb-2">Выполненные</div>
                  {completedTasks.map((task) => (
                    <motion.div key={task.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25, ease: "easeOut" }}>
                      <TaskCard
                        task={task}
                        onComplete={handleComplete}
                        onExpand={setExpandedTask}
                        onShowContent={setContentPopupTask}
                        onEdit={setEditingTask}
                        onOpenNote={handleOpenNote}
                        expanded={expandedTask === task.id}
                        onSubtaskToggle={handleSubtaskToggle}
                        onPriorityChange={handlePriorityChange}
                      />
                    </motion.div>
                  ))}
                </>
              )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>
      <TaskEditModal
        open={editingTask != null}
        task={editingTask}
        token={token}
        onClose={() => setEditingTask(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["tasks", token] })}
      />
      {contentPopupTask &&
        createPortal(
          <AnimatePresence mode="wait">
            <TaskContentPopup
              key={contentPopupTask.id}
              task={contentPopupTask}
              onClose={() => setContentPopupTask(null)}
            />
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}

function KanbanTaskItem({
  task,
  onComplete,
  onExpand,
  onShowContent,
  onEdit,
  onOpenNote,
  expanded,
  onSubtaskToggle,
  onPriorityChange,
}: {
  task: TaskResponse;
  onComplete: (id: number, done: boolean) => void;
  onExpand: (id: number | null) => void;
  onShowContent?: (task: TaskResponse) => void;
  onEdit?: (task: TaskResponse) => void;
  onOpenNote?: (taskId: number) => void;
  expanded: boolean;
  onSubtaskToggle: (task: TaskResponse, idx: number) => void;
  onPriorityChange?: (taskId: number, priority: "high" | "medium" | "low") => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={isDragging ? "opacity-50" : ""}
      style={{ touchAction: "none" }}
    >
      <TaskCard
        task={task}
        onComplete={onComplete}
        onExpand={onExpand}
        onShowContent={onShowContent}
        onEdit={onEdit}
        onOpenNote={onOpenNote}
        expanded={expanded}
        onSubtaskToggle={onSubtaskToggle}
        onPriorityChange={onPriorityChange}
      />
    </div>
  );
}

const SWIPE_THRESHOLD = 60;
const SWIPE_HINT_THRESHOLD = 30;
const SWIPE_MAX = 120;

function SwipeableKanbanTaskItem({
  task,
  currentStatus,
  onStatusChange,
  onComplete,
  onExpand,
  onShowContent,
  onEdit,
  onOpenNote,
  expanded,
  onSubtaskToggle,
  onPriorityChange,
}: {
  task: TaskResponse;
  currentStatus: KanbanStatus;
  onStatusChange: (taskId: number, newStatus: KanbanStatus) => void;
  onComplete: (id: number, done: boolean) => void;
  onExpand: (id: number | null) => void;
  onShowContent?: (task: TaskResponse) => void;
  onEdit?: (task: TaskResponse) => void;
  onOpenNote?: (taskId: number) => void;
  expanded: boolean;
  onSubtaskToggle: (task: TaskResponse, idx: number) => void;
  onPriorityChange?: (taskId: number, priority: "high" | "medium" | "low") => void;
}) {
  const [deltaX, setDeltaX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipingRef = useRef(false);

  const idx = KANBAN_COLUMNS.findIndex((c) => c.id === currentStatus);
  const prevCol = idx > 0 ? KANBAN_COLUMNS[idx - 1] : null;
  const nextCol = idx >= 0 && idx < KANBAN_COLUMNS.length - 1 ? KANBAN_COLUMNS[idx + 1] : null;

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    []
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    if (!swipingRef.current && Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    if (!swipingRef.current && Math.abs(dx) > Math.abs(dy)) {
      swipingRef.current = true;
      setIsSwiping(true);
    }
    if (swipingRef.current) {
      e.preventDefault();
      const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx));
      setDeltaX(clamped);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (deltaX > SWIPE_THRESHOLD && nextCol) {
      import("../lib/haptics").then(({ hapticLight }) => hapticLight());
      onStatusChange(task.id, nextCol.id);
    } else if (deltaX < -SWIPE_THRESHOLD && prevCol) {
      import("../lib/haptics").then(({ hapticLight }) => hapticLight());
      onStatusChange(task.id, prevCol.id);
    }
    setDeltaX(0);
    setIsSwiping(false);
    swipingRef.current = false;
    touchStartRef.current = null;
  }, [deltaX, nextCol, prevCol, task.id, onStatusChange]);

  const handleTouchCancel = useCallback(() => {
    setDeltaX(0);
    setIsSwiping(false);
    swipingRef.current = false;
    touchStartRef.current = null;
  }, []);

  const showRightHint = deltaX > SWIPE_HINT_THRESHOLD && nextCol;
  const showLeftHint = deltaX < -SWIPE_HINT_THRESHOLD && prevCol;

  return (
    <div
      data-swipe-target="task"
      className="overflow-visible"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      style={{ touchAction: isSwiping ? "none" : "pan-y" }}
    >
      <div
        className="relative transition-transform duration-75"
        style={{ transform: `translateX(${deltaX}px)` }}
      >
        <div className="relative">
          {showRightHint && (
            <div className="absolute right-full top-0 bottom-0 flex items-center justify-end pr-2 min-w-[80px]">
              <div className="flex items-center gap-1 rounded-lg bg-accent/25 px-2 py-1.5 border border-accent/40">
                <span className="text-xs font-medium text-accent">{nextCol.title}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent shrink-0">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          )}
          <TaskCard
            task={task}
            onComplete={onComplete}
            onExpand={onExpand}
            onShowContent={onShowContent}
            onEdit={onEdit}
            onOpenNote={onOpenNote}
            expanded={expanded}
            onSubtaskToggle={onSubtaskToggle}
            onPriorityChange={onPriorityChange}
          />
          {showLeftHint && (
            <div className="absolute left-full top-0 bottom-0 flex items-center justify-start pl-2 min-w-[80px]">
              <div className="flex items-center gap-1 rounded-lg bg-accent/25 px-2 py-1.5 border border-accent/40">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent shrink-0">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span className="text-xs font-medium text-accent">{prevCol.title}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileKanbanColumn({
  currentStatus,
  tasks,
  onComplete,
  onExpand,
  onShowContent,
  onEdit,
  onOpenNote,
  expandedTask,
  onSubtaskToggle,
  onPriorityChange,
  onStatusChange,
}: {
  currentStatus: KanbanStatus;
  tasks: TaskResponse[];
  onComplete: (id: number, done: boolean) => void;
  onExpand: (id: number | null) => void;
  onShowContent?: (task: TaskResponse) => void;
  onEdit?: (task: TaskResponse) => void;
  onOpenNote?: (taskId: number) => void;
  expandedTask: number | null;
  onSubtaskToggle: (task: TaskResponse, idx: number) => void;
  onPriorityChange?: (taskId: number, priority: "high" | "medium" | "low") => void;
  onStatusChange: (taskId: number, newStatus: KanbanStatus) => void;
}) {
  const column = KANBAN_COLUMNS[KANBAN_COLUMNS.findIndex((c) => c.id === currentStatus)];
  return (
    <div className="flex flex-col">
      <div className="text-sm font-medium text-text-muted mb-3">{column.title}</div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <SwipeableKanbanTaskItem
            key={task.id}
            task={task}
            currentStatus={currentStatus}
            onStatusChange={onStatusChange}
            onComplete={onComplete}
            onExpand={onExpand}
            onShowContent={onShowContent}
            onEdit={onEdit}
            onOpenNote={onOpenNote}
            expanded={expandedTask === task.id}
            onSubtaskToggle={onSubtaskToggle}
            onPriorityChange={onPriorityChange}
          />
        ))}
        {tasks.length === 0 && <div className="text-center text-text-muted text-sm py-12">—</div>}
      </div>
    </div>
  );
}

function KanbanColumn({
  column,
  tasks,
  onComplete,
  onExpand,
  onShowContent,
  onEdit,
  onOpenNote,
  expandedTask,
  onSubtaskToggle,
  onPriorityChange,
}: {
  column: (typeof KANBAN_COLUMNS)[number];
  tasks: TaskResponse[];
  onComplete: (id: number, done: boolean) => void;
  onExpand: (id: number | null) => void;
  onShowContent?: (task: TaskResponse) => void;
  onEdit?: (task: TaskResponse) => void;
  onOpenNote?: (taskId: number) => void;
  expandedTask: number | null;
  onSubtaskToggle: (task: TaskResponse, idx: number) => void;
  onPriorityChange?: (taskId: number, priority: "high" | "medium" | "low") => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border p-3 min-h-[200px] transition-all duration-300 ${
        isOver ? "bg-accent-muted/50 border-accent" : "bg-surface/50 border-border/60"
      }`}
    >
      <div className="text-sm font-medium text-text-muted mb-3 flex items-center justify-between">
        <span>{column.title}</span>
        <span className="px-2 py-0.5 rounded-full bg-bg text-xs">{tasks.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {tasks.map((task) => (
          <KanbanTaskItem
            key={task.id}
            task={task}
            onComplete={onComplete}
            onExpand={onExpand}
            onShowContent={onShowContent}
            onEdit={onEdit}
            onOpenNote={onOpenNote}
            expanded={expandedTask === task.id}
            onSubtaskToggle={onSubtaskToggle}
            onPriorityChange={onPriorityChange}
          />
        ))}
        {tasks.length === 0 && <div className="text-center text-text-muted text-sm py-6">—</div>}
      </div>
    </div>
  );
}
