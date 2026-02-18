import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useTreeStore } from "../store/treeStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useRegisterOverlay } from "../hooks/useRegisterOverlay";
import { Sidebar } from "./sidebar/Sidebar";
import { NoteView } from "./editor/NoteView";
import { NoteEditor } from "./editor/NoteEditor";
import { InputArea } from "./input/InputArea";
import { ConfirmModal } from "./ui/ConfirmModal";
import { SearchBar } from "./SearchBar";
import { useAppModalsStore } from "../store/appModalsStore";
import { useThemeStore } from "../store/themeStore";

const SIDEBAR_WIDTH_MIN = 200;
const SIDEBAR_WIDTH_MAX = 480;
const SIDEBAR_WIDTH_DEFAULT = 256;
const STORAGE_KEY = "sidebarWidth";

function getStoredSidebarWidth(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null) return SIDEBAR_WIDTH_DEFAULT;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return SIDEBAR_WIDTH_DEFAULT;
  return Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, n));
}

export function Layout() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const setTree = useTreeStore((s) => s.setTree);
  const selectedNoteId = useTreeStore((s) => s.selectedNoteId);
  const setSelectedNote = useTreeStore((s) => s.setSelectedNote);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "note"; id: number } | { type: "folder"; id: number } | null>(null);
  const {
    setSettingsOpen,
    setProfileOpen,
    setCalendarOpen,
    setTrashOpen,
  } = useAppModalsStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [sidebarWidth, setSidebarWidth] = useState(getStoredSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(SIDEBAR_WIDTH_DEFAULT);
  const lastWidthRef = useRef(sidebarWidth);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const overlayTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  const SWIPE_THRESHOLD = 50;

  useRegisterOverlay(sidebarOpen && !isDesktop, () => setSidebarOpen(false));

  const handleMainTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isDesktop || sidebarOpen) return;
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    },
    [isDesktop, sidebarOpen]
  );

  const handleMainTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const t = e.changedTouches[0];
      const deltaX = t.clientX - touchStartRef.current.x;
      const deltaY = t.clientY - touchStartRef.current.y;
      touchStartRef.current = null;
      if (deltaX > SWIPE_THRESHOLD && deltaX > Math.abs(deltaY)) {
        setSidebarOpen(true);
      }
    },
    []
  );

  const handleMainTouchCancel = useCallback(() => {
    touchStartRef.current = null;
  }, []);

  const handleOverlayTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!sidebarOpen || isDesktop) return;
      const t = e.touches[0];
      overlayTouchStartRef.current = { x: t.clientX, y: t.clientY };
    },
    [sidebarOpen, isDesktop]
  );

  const handleOverlayTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!overlayTouchStartRef.current || !sidebarOpen) return;
      const t = e.changedTouches[0];
      const deltaX = t.clientX - overlayTouchStartRef.current.x;
      const deltaY = t.clientY - overlayTouchStartRef.current.y;
      overlayTouchStartRef.current = null;
      if (deltaX < -SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
        setSidebarOpen(false);
      }
    },
    [sidebarOpen]
  );

  const handleOverlayTouchCancel = useCallback(() => {
    overlayTouchStartRef.current = null;
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = sidebarWidth;
    lastWidthRef.current = sidebarWidth;
    setIsResizing(true);
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const next = Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, resizeStartWidth.current + delta));
      lastWidthRef.current = next;
      setSidebarWidth(next);
    };
    const onUp = () => {
      setIsResizing(false);
      document.body.style.userSelect = prevUserSelect;
      localStorage.setItem(STORAGE_KEY, String(lastWidthRef.current));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevUserSelect;
    };
  }, [isResizing]);

  const { data: tree, isLoading: isTreeLoading } = useQuery({
    queryKey: ["tree", token],
    queryFn: () => api.folders.getTree(token!),
    enabled: !!token,
  });

  useEffect(() => {
    if (tree) {
      setTree(tree.roots, tree.root_notes);
    }
  }, [tree, setTree]);

  const { data: note, isLoading } = useQuery({
    queryKey: ["note", selectedNoteId, token],
    queryFn: () => api.notes.get(token!, selectedNoteId!),
    enabled: !!token && selectedNoteId != null,
  });

  const [editMode, setEditMode] = useState(false);
  const [localContent, setLocalContent] = useState("");

  const handleCheckboxToggle = useCallback(
    async (newContent: string) => {
      if (token == null || note == null) return;
      await api.notes.update(token, note.id, { content: newContent });
      await queryClient.invalidateQueries({ queryKey: ["note", note.id] });
    },
    [token, note, queryClient]
  );

  useEffect(() => {
    if (note) {
      setLocalContent(note.content);
    }
  }, [note]);

  if (!token) return null;

  const logout = useAuthStore((s) => s.logout);

  const deleteNote = async (id: number) => {
    await api.notes.delete(token!, id);
    if (selectedNoteId === id) setSelectedNote(null);
    await queryClient.invalidateQueries({ queryKey: ["tree", token] });
  };

  const deleteFolder = async (id: number) => {
    await api.folders.delete(token!, id);
    await queryClient.invalidateQueries({ queryKey: ["tree", token] });
  };

  const handleConfirmDelete = async () => {
    if (confirmDelete == null) return;
    if (confirmDelete.type === "note") {
      await deleteNote(confirmDelete.id);
    } else {
      await deleteFolder(confirmDelete.id);
    }
    setConfirmDelete(null);
  };

  const confirmDeleteTitle = confirmDelete?.type === "note" ? "Удалить заметку?" : "Удалить папку?";
  const confirmDeleteMessage =
    confirmDelete?.type === "note"
      ? "Заметка будет перемещена в корзину. Её можно восстановить."
      : "Папка будет удалена безвозвратно. Заметки из неё станут корневыми.";

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
      <header className="relative z-[58] h-14 sm:h-16 flex-shrink-0 flex items-center px-3 sm:px-6 border-b border-border/60 bg-surface/80 backdrop-blur-sm gap-1 sm:gap-2 min-w-0 overflow-visible">
        <div className="shrink-0 flex items-center gap-2">
          <motion.button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="lg:hidden touch-target-48 p-2.5 -ml-1 rounded-xl text-text-secondary hover:text-accent hover:bg-accent-muted active:scale-95"
            aria-label={sidebarOpen ? "Закрыть меню" : "Открыть меню"}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </motion.button>
        </div>
        <div className="hidden sm:flex flex-1 min-w-0 justify-center">
          <SearchBar token={token} onNoteSelect={() => setSidebarOpen(false)} />
        </div>
        <div className="sm:hidden flex-1 min-w-0" />
        <div className="shrink-0 flex items-center gap-1 sm:gap-2 max-sm:hidden">
        <motion.button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="text-sm text-text-secondary hover:text-accent touch-target-48 p-2 sm:px-3 sm:py-2 rounded-lg hover:bg-accent-muted flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          title="Настройки агентов"
          aria-label="Настройки агентов"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="hidden sm:inline">Настройки</span>
        </motion.button>
        <motion.button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="text-sm text-text-secondary hover:text-accent touch-target-48 p-2 sm:px-3 sm:py-2 rounded-lg hover:bg-accent-muted flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          title="Что запомнила модель"
          aria-label="Память модели"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <path d="M12 6v6l4 2" />
          </svg>
          <span className="hidden sm:inline">Память</span>
        </motion.button>
        <Link
          to="/chat"
          className="text-sm text-text-secondary hover:text-accent touch-target-48 p-2 sm:px-3 sm:py-2 rounded-lg hover:bg-accent-muted flex items-center gap-2"
          title="Обсудить"
          aria-label="Обсудить"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="hidden sm:inline">Обсудить</span>
        </Link>
        <motion.button
          type="button"
          onClick={() => setCalendarOpen(true)}
          className="text-sm text-text-secondary hover:text-accent touch-target-48 p-2 sm:px-3 sm:py-2 rounded-lg hover:bg-accent-muted flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          title="Календарь"
          aria-label="Календарь"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span className="hidden sm:inline">Календарь</span>
        </motion.button>
        <Link
          to="/tasks"
          className="text-sm text-text-secondary hover:text-accent touch-target-48 p-2 sm:px-3 sm:py-2 rounded-lg hover:bg-accent-muted flex items-center gap-2"
          title="Задачи"
          aria-label="Задачи"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <span className="hidden sm:inline">Задачи</span>
        </Link>
        <motion.button
          type="button"
          onClick={logout}
          className="text-sm text-text-secondary hover:text-accent touch-target-48 p-2 sm:px-3 sm:py-2 rounded-lg hover:bg-accent-muted flex items-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          title="Выйти"
          aria-label="Выйти"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="hidden sm:inline">Logout</span>
        </motion.button>
        <motion.button
          type="button"
          onClick={toggleTheme}
          className="touch-target-48 p-2 rounded-lg text-text-secondary hover:text-accent hover:bg-accent-muted"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          title={isDark ? "Светлая тема" : "Тёмная тема"}
          aria-label="Переключить тему"
        >
          {isDark ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </motion.button>
        </div>
      </header>
      <ConfirmModal
        open={confirmDelete != null}
        title={confirmDeleteTitle}
        message={confirmDeleteMessage}
        confirmLabel="Удалить"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="sidebar-backdrop"
            className="fixed top-[calc(env(safe-area-inset-top)+3.5rem)] sm:top-[calc(env(safe-area-inset-top)+4rem)] bottom-0 left-0 right-0 z-[58] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            aria-hidden={!sidebarOpen}
          >
            <motion.button
              type="button"
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px] w-full h-full"
              onClick={() => setSidebarOpen(false)}
              onTouchStart={handleOverlayTouchStart}
              onTouchEnd={handleOverlayTouchEnd}
              onTouchCancel={handleOverlayTouchCancel}
              aria-label="Закрыть меню (свайп влево)"
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex flex-1 overflow-hidden min-h-0 min-w-0">
        <div
          className="flex-shrink-0 relative"
          style={{ width: isDesktop ? sidebarWidth : 0 }}
        >
          <Sidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onNoteSelect={() => setSidebarOpen(false)}
            onDeleteNote={(id) => setConfirmDelete({ type: "note", id })}
            onDeleteFolder={(id) => setConfirmDelete({ type: "folder", id })}
            onTrashClick={() => setTrashOpen(true)}
            width={isDesktop ? sidebarWidth : undefined}
            isLoading={isTreeLoading}
          />
          {isDesktop && (
            <button
              type="button"
              aria-label="Resize sidebar"
              className="absolute top-0 h-full w-2 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 z-10 -right-1"
              onMouseDown={handleResizeStart}
            />
          )}
        </div>
        <main
          className="flex-1 min-w-0 flex flex-col overflow-hidden bg-bg"
          onTouchStart={handleMainTouchStart}
          onTouchEnd={handleMainTouchEnd}
          onTouchCancel={handleMainTouchCancel}
        >
          {selectedNoteId == null ? (
            <motion.div
              className="flex-1 flex flex-col items-center justify-center gap-4 sm:gap-6 px-3 sm:px-4 py-4 sm:py-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-text-muted text-sm sm:text-base text-center">Select a note or add a new one</p>
              <InputArea variant="island" />
            </motion.div>
          ) : isLoading ? (
            <motion.div
              className="flex-1 flex flex-col px-3 sm:px-6 py-4 gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <div className="skeleton h-8 w-3/4 max-w-sm" />
              <div className="skeleton h-4 w-full max-w-2xl" />
              <div className="skeleton h-4 w-full max-w-2xl" />
              <div className="skeleton h-4 w-2/3 max-w-xl" />
            </motion.div>
          ) : note ? (
            <motion.div
              className="flex-1 flex flex-col overflow-hidden min-h-0"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex flex-col gap-1 px-3 sm:px-6 py-2.5 sm:py-4 border-b border-border flex-shrink-0">
                <div className="flex items-center justify-between gap-2 sm:gap-3">
                  <h1 className="text-base sm:text-xl font-medium truncate min-w-0 text-text-primary">{note.title}</h1>
                  <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  {note.is_task && (
                    <Link
                      to="/tasks"
                      state={{ highlightTaskId: note.id }}
                      className="text-sm text-accent hover:text-accent/90 touch-target-48 px-3 py-1.5 rounded-lg hover:bg-accent-muted flex items-center gap-1.5"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                      <span>В задачи</span>
                    </Link>
                  )}
                  <motion.button
                    type="button"
                    onClick={async () => {
                      if (editMode) {
                        await api.notes.update(token!, note.id, { content: localContent });
                        queryClient.invalidateQueries({ queryKey: ["note", note.id] });
                      }
                      setEditMode(!editMode);
                    }}
                    className="text-sm text-accent hover:text-accent/90 touch-target-48 px-3 py-1.5 rounded-lg hover:bg-accent-muted"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {editMode ? "Preview" : "Edit"}
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setSelectedNote(null)}
                    className="touch-target-48 p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-accent-muted"
                    aria-label="Close note"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </motion.button>
                  </div>
                </div>
                <p className="text-xs text-text-muted">
                  Изменено: {new Date(note.updated_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <div className="flex-1 overflow-auto min-h-0">
                {editMode ? (
                  <NoteEditor content={localContent} onChange={setLocalContent} />
                ) : (
                  <NoteView content={note.content} onCheckboxToggle={handleCheckboxToggle} />
                )}
              </div>
              <div className="flex-shrink-0 flex justify-center py-3 sm:py-4 px-3 sm:px-4 border-t border-border">
                <InputArea variant="island" />
              </div>
            </motion.div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
