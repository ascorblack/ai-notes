import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type FolderTree } from "../api/client";
import { useOfflineTreeQuery, useOfflineNoteQuery } from "../hooks/useOfflineQuery";
import { useAuthStore } from "../store/authStore";
import { useTreeStore } from "../store/treeStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useIsMobile } from "../hooks/useIsMobile";
import { useRegisterOverlay } from "../hooks/useRegisterOverlay";
import { useNoteAutosave } from "../hooks/useNoteAutosave";
import { Sidebar } from "./sidebar/Sidebar";
import { NoteView } from "./editor/NoteView";
import { NoteEditor } from "./editor/NoteEditor";
import { TagInput } from "./editor/TagInput";
import { RelatedNotesPanel } from "./editor/RelatedNotesPanel";
import { ExportNoteButton } from "./editor/ExportNoteButton";
import { NoteVersionsModal } from "./editor/NoteVersionsModal";
import { InputArea } from "./input/InputArea";
import { ErrorBoundary } from "./ErrorBoundary";
import { ConfirmModal } from "./ui/ConfirmModal";
import { SearchBar } from "./SearchBar";
import { FolderModal } from "./FolderModal";
import { useAppModalsStore } from "../store/appModalsStore";
import { useThemeStore } from "../store/themeStore";
import { useToastStore } from "../store/toastStore";
import * as offlineStorage from "../services/offlineStorage";
import { addNoteToTree, removeNoteFromTree, type TreeData } from "../lib/treeUtils";
import { hapticLight } from "../lib/haptics";

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
  const roots = useTreeStore((s) => s.roots);
  const rootNotes = useTreeStore((s) => s.rootNotes);
  const setLastCreatedIds = useTreeStore((s) => s.setLastCreatedIds);
  const selectedNoteId = useTreeStore((s) => s.selectedNoteId);
  const splitOpen = useTreeStore((s) => s.splitOpen);
  const splitNoteId = useTreeStore((s) => s.splitNoteId);
  const setSelectedNote = useTreeStore((s) => s.setSelectedNote);
  const setSplitNote = useTreeStore((s) => s.setSplitNote);
  const setSplitOpen = useTreeStore((s) => s.setSplitOpen);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "note"; id: number } | { type: "folder"; id: number } | null>(null);
  const [folderModal, setFolderModal] = useState<{ mode: "create" | "rename"; folderId?: number; parentFolderId?: number | null; initialName?: string } | null>(null);
  const [versionsModalNoteId, setVersionsModalNoteId] = useState<number | null>(null);
  const [noteToolbarMenuOpen, setNoteToolbarMenuOpen] = useState(false);
  const [inputBarCollapsed, setInputBarCollapsed] = useState(false);
  const {
    setSettingsOpen,
    setProfileOpen,
    setCalendarOpen,
    setTrashOpen,
    focusMode,
  } = useAppModalsStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const showToast = useToastStore((s) => s.showToast);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isMobile = useIsMobile();
  const [sidebarWidth, setSidebarWidth] = useState(getStoredSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(SIDEBAR_WIDTH_DEFAULT);
  const lastWidthRef = useRef(sidebarWidth);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const overlayTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  const SWIPE_THRESHOLD = 50;
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useRegisterOverlay(sidebarOpen && !isDesktop, () => setSidebarOpen(false));
  useRegisterOverlay(noteToolbarMenuOpen, () => setNoteToolbarMenuOpen(false));

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

  const { data: tree, isLoading: isTreeLoading } = useOfflineTreeQuery(token);

  useEffect(() => {
    if (tree) {
      setTree(tree.roots, tree.root_notes);
    }
  }, [tree, setTree]);

  const { data: dailyNote } = useQuery({
    queryKey: ["daily", token],
    queryFn: () => api.notes.getDaily(token!),
    enabled: !!token && !isTreeLoading,
    staleTime: 1000 * 60,
  });

  useEffect(() => {
    if (!dailyNote?.created || !token) return;
    const key = `daily_toast_${dailyNote.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    showToast(`Создана заметка на сегодня: ${dailyNote.title}`, "success");
    queryClient.invalidateQueries({ queryKey: ["tree", token] });
  }, [dailyNote, queryClient, showToast, token]);

  const { data: note, isLoading } = useOfflineNoteQuery(token, selectedNoteId);

  const { data: splitNote } = useOfflineNoteQuery(token, splitNoteId);

  const [summarizing, setSummarizing] = useState(false);
  const handleSummarize = useCallback(async () => {
    if (!token || !note) return;
    setSummarizing(true);
    try {
      const updated = await api.notes.summarize(token, note.id);
      setLocalContent(updated.content);
      await queryClient.invalidateQueries({ queryKey: ["note", note.id] });
    } finally {
      setSummarizing(false);
    }
  }, [token, note, queryClient]);

  const [editMode, setEditMode] = useState(false);
  const [localContent, setLocalContent] = useState("");

  const { status: saveStatus, saveNow } = useNoteAutosave(
    editMode ? selectedNoteId : null,
    localContent
  );

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
    const prev = queryClient.getQueryData<TreeData>(["tree", token]);
    if (prev) {
      queryClient.setQueryData(["tree", token], removeNoteFromTree(prev, id));
    }
    if (selectedNoteId === id) setSelectedNote(null);
    try {
      await api.notes.delete(token!, id);
    } catch (e) {
      if (prev) queryClient.setQueryData(["tree", token], prev);
      showToast(`Ошибка: ${e instanceof Error ? e.message : "Не удалось удалить"}`);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["tree", token] });
  };

  const deleteFolder = async (id: number) => {
    await api.folders.delete(token!, id);
    await queryClient.invalidateQueries({ queryKey: ["tree", token] });
  };

  const handleMoveNote = async (noteId: number, targetFolderId: number | null) => {
    await api.notes.update(token!, noteId, { folder_id: targetFolderId });
    await queryClient.invalidateQueries({ queryKey: ["tree", token] });
    if (selectedNoteId === noteId) {
      await queryClient.invalidateQueries({ queryKey: ["note", noteId] });
    }
  };

  const handleMoveFolder = async (folderId: number, targetParentId: number | null) => {
    await api.folders.update(token!, folderId, {
      parent_folder_id: targetParentId == null ? 0 : targetParentId,
    });
    await queryClient.invalidateQueries({ queryKey: ["tree", token] });
  };

  const handleCreateFolder = (parentFolderId?: number | null) => {
    setFolderModal({ mode: "create", parentFolderId });
  };

  const findFolderName = (id: number, folders: FolderTree[]): string | undefined => {
    for (const f of folders) {
      if (f.id === id) return f.name;
      const found = findFolderName(id, f.children);
      if (found) return found;
    }
    return undefined;
  };

  const handleRenameFolder = (folderId: number) => {
    const initialName = findFolderName(folderId, roots);
    setFolderModal({ mode: "rename", folderId, initialName });
  };

  const handleCreateNoteInFolder = useCallback(
    async (folderId: number) => {
      if (!token) return;
      const title = "Без названия";
      const content = "";

      if (!navigator.onLine) {
        try {
          const { tempId, noteRef } = await offlineStorage.createSimpleNoteOffline(title, content, folderId);
          const { roots: r, root_notes: rn } = await offlineStorage.appendNoteToTreeOffline(noteRef, roots, rootNotes, folderId);
          setTree(r, rn);
          setSelectedNote(tempId);
          queryClient.invalidateQueries({ queryKey: ["tree", token] });
          hapticLight();
          showToast("Заметка создана (офлайн, синхронизируется при подключении)");
        } catch (e) {
          showToast(`Ошибка: ${e instanceof Error ? e.message : "Не удалось создать"}`);
        }
        return;
      }

      const prev = queryClient.getQueryData<TreeData>(["tree", token]);
      const tempId = -Date.now();
      const tempRef = { id: tempId, title, pinned: false };
      if (prev) {
        queryClient.setQueryData(
          ["tree", token],
          addNoteToTree(prev, tempRef, folderId)
        );
      }
      try {
        const created = await api.notes.create(token, { title, content, folder_id: folderId });
        setLastCreatedIds([created.id]);
        setSelectedNote(created.id);
        await queryClient.invalidateQueries({ queryKey: ["tree", token] });
        await queryClient.invalidateQueries({ queryKey: ["note", created.id] });
        hapticLight();
        showToast("Заметка создана");
      } catch (e) {
        if (prev) queryClient.setQueryData(["tree", token], prev);
        showToast(`Ошибка: ${e instanceof Error ? e.message : "Не удалось создать"}`);
      }
    },
    [token, roots, rootNotes, setTree, setSelectedNote, setLastCreatedIds, queryClient, showToast]
  );

  const handlePinNote = async (noteId: number, pinned: boolean) => {
    await api.notes.update(token!, noteId, { pinned });
    await queryClient.invalidateQueries({ queryKey: ["tree", token] });
    await queryClient.invalidateQueries({ queryKey: ["note", noteId] });
  };

  const handleDuplicateNote = async (noteId: number) => {
    const created = await api.notes.duplicate(token!, noteId);
    setSelectedNote(created.id);
    await queryClient.invalidateQueries({ queryKey: ["tree", token] });
  };

  const handleFolderModalClose = () => {
    setFolderModal(null);
    queryClient.invalidateQueries({ queryKey: ["tree", token] });
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
      {!focusMode && (
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
        <Link
          to="/saved"
          className="text-sm text-text-secondary hover:text-accent touch-target-48 p-2 sm:px-3 sm:py-2 rounded-lg hover:bg-accent-muted flex items-center gap-2"
          title="Сохраненные"
          aria-label="Сохраненные"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <span className="hidden sm:inline">Сохраненные</span>
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
      )}
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
              className="absolute inset-0 bg-modal-overlay backdrop-blur-[2px] w-full h-full"
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
        {!focusMode && (
        <div
          className="flex-shrink-0 relative"
          style={{ width: isDesktop ? sidebarWidth : 0 }}
        >
          <ErrorBoundary fallback={<div className="p-4 text-error text-sm">Ошибка сайдбара. <button type="button" onClick={() => window.location.reload()} className="underline">Обновить</button></div>}>
          <Sidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onNoteSelect={() => setSidebarOpen(false)}
            onDeleteNote={(id) => setConfirmDelete({ type: "note", id })}
            onDeleteFolder={(id) => setConfirmDelete({ type: "folder", id })}
            onTrashClick={() => setTrashOpen(true)}
            onMoveNote={handleMoveNote}
            onMoveFolder={handleMoveFolder}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onCreateNoteInFolder={handleCreateNoteInFolder}
            onPinNote={handlePinNote}
            onDuplicateNote={handleDuplicateNote}
            onOpenInSplit={splitOpen ? setSplitNote : undefined}
            width={isDesktop ? sidebarWidth : undefined}
            isLoading={isTreeLoading}
          />
          </ErrorBoundary>
          {isDesktop && (
            <button
              type="button"
              aria-label="Resize sidebar"
              className="absolute top-0 h-full w-2 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 z-10 -right-1"
              onMouseDown={handleResizeStart}
            />
          )}
        </div>
        )}
        <main
          className="flex-1 min-w-0 flex flex-col overflow-hidden bg-bg"
          onTouchStart={handleMainTouchStart}
          onTouchEnd={handleMainTouchEnd}
          onTouchCancel={handleMainTouchCancel}
        >
          <ErrorBoundary fallback={<div className="flex-1 flex items-center justify-center p-4"><div className="text-center text-text-muted text-sm">Ошибка отображения. <button type="button" onClick={() => window.location.reload()} className="text-accent underline">Обновить</button></div></div>}>
          {selectedNoteId == null ? (
            <motion.div
              className="flex-1 flex flex-col items-center justify-center gap-4 sm:gap-6 px-3 sm:px-4 py-4 sm:py-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-text-muted text-sm sm:text-base text-center">
                {isOnline ? "Select a note or add a new one" : "Офлайн. Выберите заметку или ПКМ по папке → Новая заметка"}
              </p>
              {isOnline && <InputArea variant="island" />}
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
                {isMobile ? (
                  <>
                    <h1 className="text-base font-medium truncate min-w-0 text-text-primary">{note.title}</h1>
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                      {note.is_task && (
                        <select
                          value={note.priority || "medium"}
                          onChange={async (e) => {
                            const p = e.target.value as "high" | "medium" | "low";
                            if (!token) return;
                            await api.notes.update(token, note.id, { priority: p });
                            await queryClient.invalidateQueries({ queryKey: ["note", note.id] });
                            queryClient.invalidateQueries({ queryKey: ["tasks"] });
                          }}
                          className="text-xs font-medium rounded border-0 py-0.5 h-7 pl-2 pr-6 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/50 shrink-0"
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "right 0.4rem center",
                            backgroundColor:
                              (note.priority || "medium") === "high"
                                ? "#EF4444"
                                : (note.priority || "medium") === "low"
                                  ? "#6B7280"
                                  : "#F97316",
                            color: "white",
                          }}
                          aria-label="Приоритет задачи"
                        >
                          <option value="high">Высокий</option>
                          <option value="medium">Средний</option>
                          <option value="low">Низкий</option>
                        </select>
                      )}
                      <div className="flex-1 min-w-0" />
                      {note.is_task && (
                        <Link
                          to="/tasks"
                          state={{ highlightTaskId: note.id }}
                          className="text-sm text-accent hover:text-accent/90 touch-target-48 px-2 py-1.5 rounded-lg hover:bg-accent-muted flex items-center gap-1.5 shrink-0"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 11l3 3L22 4" />
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                          </svg>
                          <span>В задачи</span>
                        </Link>
                      )}
                      <div className="relative">
                        <motion.button
                          type="button"
                          onClick={() => setNoteToolbarMenuOpen((o) => !o)}
                          className="touch-target-48 p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-accent-muted shrink-0"
                          aria-label="Ещё"
                          aria-expanded={noteToolbarMenuOpen}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <circle cx="12" cy="6" r="1.5" />
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="12" cy="18" r="1.5" />
                          </svg>
                        </motion.button>
                        {noteToolbarMenuOpen && (
                          <div
                            className="fixed inset-0 z-40"
                            aria-hidden="true"
                            onClick={() => setNoteToolbarMenuOpen(false)}
                          />
                        )}
                        <AnimatePresence>
                          {noteToolbarMenuOpen && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="absolute right-0 top-full mt-1 z-50 min-w-[180px] py-1 rounded-xl border border-border bg-surface shadow-xl"
                            >
                              <button
                                type="button"
                                onClick={async () => {
                                  if (editMode) await saveNow();
                                  await handleDuplicateNote(note.id);
                                  setNoteToolbarMenuOpen(false);
                                }}
                                className="touch-target-48 w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-accent-muted flex items-center gap-2"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                Дублировать
                              </button>
                              <ExportNoteButton
                                note={note}
                                asMenuItems
                                onAction={() => setNoteToolbarMenuOpen(false)}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setVersionsModalNoteId(note.id);
                                  setNoteToolbarMenuOpen(false);
                                }}
                                className="touch-target-48 w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-accent-muted flex items-center gap-2"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                                История версий
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await handleSummarize();
                                  setNoteToolbarMenuOpen(false);
                                }}
                                disabled={summarizing || !note.content?.trim() || note.content.length < 50}
                                className="touch-target-48 w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-accent-muted disabled:opacity-50 flex items-center gap-2"
                              >
                                <span className="w-4 text-center">{summarizing ? "…" : "∑"}</span>
                                Суммаризировать
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (editMode) await saveNow();
                                  setEditMode(!editMode);
                                  setNoteToolbarMenuOpen(false);
                                }}
                                className="touch-target-48 w-full text-left px-4 py-2.5 text-sm text-accent hover:bg-accent-muted flex items-center gap-2"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                {editMode ? "Preview" : "Edit"}
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <motion.button
                        type="button"
                        onClick={() => setSelectedNote(null)}
                        className="touch-target-48 p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-accent-muted shrink-0"
                        aria-label="Закрыть"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </motion.button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                  <h1 className="text-base sm:text-xl font-medium truncate min-w-0 text-text-primary">{note.title}</h1>
                  <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  {note.is_task && (
                    <>
                      <select
                        value={note.priority || "medium"}
                        onChange={async (e) => {
                          const p = e.target.value as "high" | "medium" | "low";
                          if (!token) return;
                          await api.notes.update(token, note.id, { priority: p });
                          await queryClient.invalidateQueries({ queryKey: ["note", note.id] });
                          queryClient.invalidateQueries({ queryKey: ["tasks"] });
                        }}
                        className="text-xs font-medium rounded border-0 py-0.5 h-7 pl-2 pr-6 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/50"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "right 0.4rem center",
                          backgroundColor:
                            (note.priority || "medium") === "high"
                              ? "#EF4444"
                              : (note.priority || "medium") === "low"
                                ? "#6B7280"
                                : "#F97316",
                          color: "white",
                        }}
                        aria-label="Приоритет задачи"
                      >
                        <option value="high">Высокий</option>
                        <option value="medium">Средний</option>
                        <option value="low">Низкий</option>
                      </select>
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
                    </>
                  )}
                  <motion.button
                    type="button"
                    onClick={async () => {
                      if (editMode) await saveNow();
                      await handleDuplicateNote(note.id);
                    }}
                    className="text-sm text-text-secondary hover:text-accent touch-target-48 px-2 py-1.5 rounded-lg hover:bg-accent-muted"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    title="Дублировать"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </motion.button>
                  <ExportNoteButton note={note} />
                  <motion.button
                    type="button"
                    onClick={() => setVersionsModalNoteId(note.id)}
                    className="text-sm text-text-secondary hover:text-accent touch-target-48 px-2 py-1.5 rounded-lg hover:bg-accent-muted"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    title="История версий"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={handleSummarize}
                    disabled={summarizing || !note.content?.trim() || note.content.length < 50}
                    className="text-sm text-text-secondary hover:text-accent touch-target-48 px-2 py-1.5 rounded-lg hover:bg-accent-muted disabled:opacity-50"
                    title="Суммаризировать"
                  >
                    {summarizing ? "…" : "∑"}
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setSplitOpen(!splitOpen)}
                    className={`text-sm touch-target-48 px-2 py-1.5 rounded-lg ${splitOpen ? "bg-accent/20 text-accent" : "text-text-secondary hover:text-accent hover:bg-accent-muted"} ${!isDesktop ? "hidden" : ""}`}
                    title="Split view"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="18" />
                      <rect x="14" y="3" width="7" height="18" />
                    </svg>
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={async () => {
                      if (editMode) {
                        await saveNow();
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
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-xs text-text-muted">
                    {saveStatus === "saving" ? (
                      <span className="text-accent">Saving...</span>
                    ) : saveStatus === "saved" ? (
                      <span className="text-green-500">Saved</span>
                    ) : saveStatus === "error" ? (
                      <span className="text-red-500">Error</span>
                    ) : (
                      `Modified: ${new Date(note.updated_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                    )}
                  </p>
                  <TagInput noteId={note.id} tags={note.tags || []} />
                </div>
              </div>
              <div className={`flex-1 min-h-0 flex ${splitOpen && isDesktop ? "flex-row" : "flex-col"}`}>
                <div className={`flex-1 overflow-auto min-h-0 ${splitOpen && isDesktop ? "min-w-0 border-r border-border" : ""}`}>
                  {editMode ? (
                    <>
                      <NoteEditor content={localContent} onChange={setLocalContent} />
                      <div className="px-3 sm:px-6 py-4 border-t border-border/60">
                        <RelatedNotesPanel
                          noteId={note.id}
                          onInsertWikilink={(wikilink) =>
                            setLocalContent((prev) =>
                              prev.trimEnd() ? `${prev}\n${wikilink}` : prev + wikilink
                            )
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <NoteView content={note.content} onCheckboxToggle={handleCheckboxToggle} />
                      <div className="px-3 sm:px-6 pb-4">
                        <RelatedNotesPanel noteId={note.id} />
                      </div>
                    </>
                  )}
                </div>
                {splitOpen && isDesktop && (
                  <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-l border-border/60">
                    {splitNote ? (
                      <>
                        <div className="px-3 py-2 border-b border-border/60 text-sm font-medium text-text-primary truncate flex items-center justify-between gap-2">
                          <span>{splitNote.title}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedNote(splitNote.id)}
                            className="text-xs text-accent hover:bg-accent-muted px-2 py-1 rounded"
                          >
                            Edit
                          </button>
                        </div>
                        <div className="flex-1 overflow-auto p-3">
                          <NoteView content={splitNote.content} />
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center p-6 text-center text-text-muted text-sm">
                        ПКМ по заметке → «Открыть в Split»
                      </div>
                    )}
                  </div>
                )}
              </div>
              {isOnline && (
                inputBarCollapsed ? (
                  <div className="flex-shrink-0 flex justify-center py-2 px-3 border-t border-border">
                    <motion.button
                      type="button"
                      onClick={() => setInputBarCollapsed(false)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-text-secondary hover:text-accent hover:bg-accent-muted touch-target-48 text-sm"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      aria-label="Показать поле ввода"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                      Поле ввода
                    </motion.button>
                  </div>
                ) : (
                  <div className="flex-shrink-0 flex flex-col border-t border-border">
                    <div className="flex justify-end px-2 pt-1.5 pb-0">
                      <motion.button
                        type="button"
                        onClick={() => setInputBarCollapsed(true)}
                        className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-accent-muted touch-target-48"
                        aria-label="Скрыть поле ввода"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </motion.button>
                    </div>
                    <div className="flex justify-center py-2 sm:py-3 px-3 sm:px-4">
                      <InputArea variant="island" />
                    </div>
                  </div>
                )
              )}
            </motion.div>
          ) : null}
          </ErrorBoundary>
        </main>
      </div>
      <AnimatePresence>
        {versionsModalNoteId != null && (
          <NoteVersionsModal
            key={versionsModalNoteId}
            noteId={versionsModalNoteId}
            onClose={() => setVersionsModalNoteId(null)}
          />
        )}
      </AnimatePresence>
      <FolderModal
        open={folderModal != null}
        onClose={handleFolderModalClose}
        token={token!}
        mode={folderModal?.mode ?? "create"}
        folderId={folderModal?.folderId}
        parentFolderId={folderModal?.parentFolderId}
        initialName={folderModal?.initialName}
      />
    </div>
  );
}
