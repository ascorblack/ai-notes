import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "../store/authStore";
import { api } from "../api/client";
import { useThemeStore } from "../store/themeStore";
import { useTreeStore } from "../store/treeStore";
import { useAddInputStore } from "../store/addInputStore";
import { useAppModalsStore } from "../store/appModalsStore";
import { FolderTree, NoteRef } from "../api/client";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
  category: "navigation" | "action" | "settings";
}

function flattenTree(trees: FolderTree[], notes: NoteRef[]): Array<{ type: "folder" | "note"; id: number; name: string; path: string }> {
  const result: Array<{ type: "folder" | "note"; id: number; name: string; path: string }> = [];

  function walk(items: FolderTree[], path: string) {
    for (const item of items) {
      const newPath = path ? `${path}/${item.name}` : item.name;
      result.push({ type: "folder", id: item.id, name: item.name, path: newPath });
      for (const note of item.notes) {
        result.push({ type: "note", id: note.id, name: note.title, path: `${newPath}/${note.title}` });
      }
      walk(item.children, newPath);
    }
  }

  walk(trees, "");
  for (const note of notes) {
    result.push({ type: "note", id: note.id, name: note.title, path: `/${note.title}` });
  }

  return result;
}

export function CommandPalette() {
  const open = useAppModalsStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useAppModalsStore((s) => s.setCommandPaletteOpen);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();

  const logout = useAuthStore((s) => s.logout);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const isDark = useThemeStore((s) => s.isDark);
  const setSelectedNote = useTreeStore((s) => s.setSelectedNote);
  const roots = useTreeStore((s) => s.roots);
  const rootNotes = useTreeStore((s) => s.rootNotes);
  const focusAddInput = useAddInputStore((s) => s.focus);
  const { setSettingsOpen, setCalendarOpen, setTrashOpen, setGraphOpen, toggleFocusMode } = useAppModalsStore();

  const flatItems = useMemo(() => flattenTree(roots, rootNotes), [roots, rootNotes]);

  const commands: Command[] = useMemo(() => {
    const cmds: Command[] = [
      {
        id: "new-note",
        label: "Новая заметка",
        shortcut: "N",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
        action: () => {
          navigate("/");
          setSelectedNote(null);
          setCommandPaletteOpen(false);
          setTimeout(() => focusAddInput?.(), 150);
        },
        category: "action",
      },
      {
        id: "notes",
        label: "Go to Notes",
        shortcut: "G N",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
        action: () => { navigate("/"); setCommandPaletteOpen(false); },
        category: "navigation",
      },
      {
        id: "tasks",
        label: "Go to Tasks",
        shortcut: "G T",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
        action: () => { navigate("/tasks"); setCommandPaletteOpen(false); },
        category: "navigation",
      },
      {
        id: "chat",
        label: "Go to Chat",
        shortcut: "G C",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
        action: () => { navigate("/chat"); setCommandPaletteOpen(false); },
        category: "navigation",
      },
      {
        id: "calendar",
        label: "Open Calendar",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
        action: () => { setCalendarOpen(true); setCommandPaletteOpen(false); },
        category: "action",
      },
      {
        id: "settings",
        label: "Open Settings",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
        action: () => { setSettingsOpen(true); setCommandPaletteOpen(false); },
        category: "settings",
      },
      {
        id: "export-obsidian",
        label: "Export to Obsidian (zip)",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
        action: () => {
          const t = useAuthStore.getState().token;
          if (t) void api.export.obsidianVault(t);
          setCommandPaletteOpen(false);
        },
        category: "action",
      },
      {
        id: "graph",
        label: "Open Graph View",
        shortcut: "G G",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2" /><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /><line x1="8" y1="8" x2="10" y2="10" /><line x1="14" y1="10" x2="16" y2="8" /><line x1="10" y1="14" x2="8" y2="16" /><line x1="16" y1="16" x2="14" y2="14" /></svg>,
        action: () => { setGraphOpen(true); setCommandPaletteOpen(false); },
        category: "action",
      },
      {
        id: "trash",
        label: "Open Trash",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
        action: () => { setTrashOpen(true); setCommandPaletteOpen(false); },
        category: "action",
      },
      {
        id: "focus",
        label: "Toggle Focus Mode",
        shortcut: "⌘⇧F",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v4" /><path d="M9 21H5a2 2 0 0 1-2-2v-4" /><path d="M21 9v4a2 2 0 0 1-2 2h-4" /><path d="M3 15v-4a2 2 0 0 1 2-2h4" /></svg>,
        action: () => { toggleFocusMode(); setCommandPaletteOpen(false); },
        category: "action",
      },
      {
        id: "theme",
        label: isDark ? "Switch to Light Mode" : "Switch to Dark Mode",
        icon: isDark ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
        ),
        action: () => { toggleTheme(); setCommandPaletteOpen(false); },
        category: "settings",
      },
      {
        id: "logout",
        label: "Logout",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
        action: () => { logout(); setCommandPaletteOpen(false); },
        category: "settings",
      },
    ];
    return cmds;
  }, [navigate, setCalendarOpen, setSettingsOpen, setTrashOpen, setGraphOpen, setCommandPaletteOpen, toggleTheme, toggleFocusMode, isDark, logout]);

  const filteredCommands = useMemo(() => {
    if (!query) return commands;
    const lower = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(lower));
  }, [commands, query]);

  const filteredItems = useMemo(() => {
    if (!query || query.length < 2) return [];
    const lower = query.toLowerCase();
    return flatItems.filter((item) => item.name.toLowerCase().includes(lower)).slice(0, 10);
  }, [flatItems, query]);

  const allResults = useMemo(() => {
    const results: Array<{ type: "command"; item: Command } | { type: "note"; item: typeof flatItems[0] }> = [];
    filteredCommands.forEach((cmd) => results.push({ type: "command", item: cmd }));
    filteredItems.forEach((item) => results.push({ type: "note", item }));
    return results;
  }, [filteredCommands, filteredItems]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        useAppModalsStore.getState().setCommandPaletteOpen(!useAppModalsStore.getState().commandPaletteOpen);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        toggleFocusMode();
      }
      if (e.key === "Escape" && open) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, setCommandPaletteOpen, toggleFocusMode]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  const handleSelect = useCallback((result: typeof allResults[0]) => {
    if (result.type === "command") {
      result.item.action();
    } else {
      if (result.item.type === "note") {
        setSelectedNote(result.item.id);
        navigate("/");
      }
      setCommandPaletteOpen(false);
    }
  }, [setSelectedNote, navigate, setCommandPaletteOpen]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, allResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && allResults[selectedIndex]) {
        e.preventDefault();
        handleSelect(allResults[selectedIndex]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, allResults, selectedIndex, handleSelect]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setCommandPaletteOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-xl bg-surface border border-border rounded-xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command or search..."
                className="flex-1 bg-transparent outline-none text-text-primary placeholder:text-text-muted"
                autoFocus
              />
              <kbd className="px-2 py-0.5 text-xs rounded bg-bg border border-border text-text-muted">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {allResults.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-text-muted text-sm">Ничего не найдено</p>
                  <p className="text-text-muted text-xs mt-1">Введите 2+ символа для поиска заметок и папок</p>
                </div>
              ) : (
                <ul className="py-2">
                  {allResults.map((result, idx) => (
                    <li key={result.type === "command" ? result.item.id : `${result.item.type}-${result.item.id}`}>
                      <button
                        type="button"
                        onClick={() => handleSelect(result)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          idx === selectedIndex ? "bg-accent/10 text-accent" : "text-text-primary hover:bg-accent/5"
                        }`}
                      >
                        {result.type === "command" ? (
                          <>
                            <span className={idx === selectedIndex ? "text-accent" : "text-text-muted"}>{result.item.icon}</span>
                            <span className="flex-1">{result.item.label}</span>
                            {result.item.shortcut && (
                              <kbd className="px-1.5 py-0.5 text-xs rounded bg-bg border border-border text-text-muted">{result.item.shortcut}</kbd>
                            )}
                          </>
                        ) : (
                          <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={idx === selectedIndex ? "text-accent" : "text-text-muted"}>
                              {result.item.type === "folder" ? (
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                              ) : (
                                <>
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                </>
                              )}
                            </svg>
                            <span className="flex-1 truncate">{result.item.name}</span>
                            <span className="text-xs text-text-muted truncate max-w-[200px]">{result.item.path}</span>
                          </>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 px-4 py-2 border-t border-border text-xs text-text-muted">
              <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-bg border border-border">↑↓</kbd> Navigate</span>
              <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-bg border border-border">↵</kbd> Select</span>
              <span className="hidden sm:flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-bg border border-border">⌘K</kbd> Toggle</span>
              <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-bg border border-border">?</kbd> Shortcuts</span>
            </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
