import { useState, useCallback, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../../store/authStore";
import { api } from "../../api/client";
import { useTreeStore } from "../../store/treeStore";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useRegisterOverlay } from "../../hooks/useRegisterOverlay";
import { useLongPress } from "../../hooks/useLongPress";
import { FolderNode } from "./FolderNode";
import { BottomSheet } from "../ui/BottomSheet";

const container = {
  hidden: { opacity: 0 },
  visible: (i: number) => ({
    opacity: 1,
    transition: { delay: i * 0.03, duration: 0.2 },
  }),
};

type ContextTarget = { x: number; y: number; noteId?: number; folderId?: number };

function collectPinnedNotes(roots: import("../../api/client").FolderTree[], rootNotes: import("../../api/client").NoteRef[]) {
  const out: import("../../api/client").NoteRef[] = [];
  for (const n of rootNotes) {
    if (n.pinned) out.push(n);
  }
  function walk(folders: import("../../api/client").FolderTree[]) {
    for (const f of folders) {
      for (const n of f.notes) {
        if (n.pinned) out.push(n);
      }
      walk(f.children);
    }
  }
  walk(roots);
  return out;
}

function filterUnpinned<T extends { pinned?: boolean }>(items: T[]) {
  return items.filter((x) => !x.pinned);
}

function PinIcon() {
  return (
    <svg className="shrink-0 w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78 0.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-0.76a2 2 0 0 0-1.11-1.79l-1.78-0.9A2 2 0 0 1 15 10.76V10" />
      <path d="M12 2v5" />
      <path d="M12 7v3" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg className="shrink-0 w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function DeleteIcon({ onClick, ariaLabel }: { onClick: (e: React.MouseEvent) => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className="shrink-0 touch-target-48 p-1 rounded-md opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 hover:bg-error/20 text-text-muted hover:text-error transition-opacity"
      aria-label={ariaLabel}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    </button>
  );
}

function noteAgingOpacity(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 1;
  const days = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days > 90) return 0.5;
  if (days > 30) return 0.65;
  if (days > 14) return 0.8;
  return 1;
}

function flattenFolders(roots: import("../../api/client").FolderTree[]): Array<{ id: number | null; name: string }> {
  const out: Array<{ id: number | null; name: string }> = [{ id: null, name: "Корень" }];
  function walk(folders: import("../../api/client").FolderTree[]) {
    for (const f of folders) {
      out.push({ id: f.id, name: f.name });
      walk(f.children);
    }
  }
  walk(roots);
  return out;
}

function filterFolderNotes(
  roots: import("../../api/client").FolderTree[],
  allowedIds: Set<number> | null
): import("../../api/client").FolderTree[] {
  return roots.map((f) => {
    const filteredNotes = f.notes.filter((n) => allowedIds == null || allowedIds.has(n.id));
    return {
      ...f,
      notes: filteredNotes,
      children: filterFolderNotes(f.children, allowedIds),
    };
  });
}

interface PinnedNoteRowProps {
  note: import("../../api/client").NoteRef;
  isNew: boolean;
  isSelected: boolean;
  isMobile: boolean;
  onNoteClick: (id: number) => void;
  onLongPressNote: (id: number) => void;
  onContextMenuNote: (e: React.MouseEvent, noteId: number) => void;
  onDeleteNote?: (id: number) => void | Promise<void>;
}

function PinnedNoteRow({ note, isNew, isSelected, isMobile, onNoteClick, onLongPressNote, onContextMenuNote, onDeleteNote }: PinnedNoteRowProps) {
  const longPress = useLongPress({
    onLongPress: () => onLongPressNote(note.id),
    onClick: () => onNoteClick(note.id),
  });

  return (
    <motion.div
      className="group flex items-center gap-2 w-full min-w-0"
      variants={container}
      initial="hidden"
      animate="visible"
      custom={0}
    >
      <motion.button
        type="button"
        {...(isMobile ? longPress : {
          onClick: () => onNoteClick(note.id),
          onContextMenu: (e: React.MouseEvent) => onContextMenuNote(e, note.id),
        })}
        style={{ opacity: noteAgingOpacity(note.updated_at) }}
        className={`flex-1 min-w-0 flex items-center gap-2 text-left py-2 px-3 rounded-xl text-sm min-h-[48px] sm:min-h-0 border-l-2 border-accent/60 bg-accent-muted/30 ${
          isSelected ? "bg-accent-muted text-accent" : "hover:bg-accent-muted text-text-secondary"
        }`}
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.98 }}
      >
        <PinIcon />
        <motion.span
          initial={isNew ? { backgroundColor: "rgba(45, 212, 191, 0.2)" } : false}
          animate={{ backgroundColor: "transparent" }}
          transition={{ duration: 2 }}
          className="block min-w-0 flex-1 truncate"
        >
          {note.title || "(untitled)"}
        </motion.span>
      </motion.button>
      {onDeleteNote && (
        <DeleteIcon ariaLabel="Delete note" onClick={() => onDeleteNote(note.id)} />
      )}
    </motion.div>
  );
}

interface UnpinnedRootNoteRowProps {
  note: import("../../api/client").NoteRef;
  index: number;
  isNew: boolean;
  isSelected: boolean;
  isMobile: boolean;
  container: { hidden: { opacity: number }; visible: (i: number) => { opacity: number; transition: { delay: number; duration: number } } };
  onNoteClick: (id: number) => void;
  onLongPressNote: (id: number) => void;
  onContextMenuNote: (e: React.MouseEvent, noteId: number) => void;
  onDeleteNote?: (id: number) => void | Promise<void>;
}

function UnpinnedRootNoteRow({ note, index, isNew, isSelected, isMobile, container, onNoteClick, onLongPressNote, onContextMenuNote, onDeleteNote }: UnpinnedRootNoteRowProps) {
  const longPress = useLongPress({
    onLongPress: () => onLongPressNote(note.id),
    onClick: () => onNoteClick(note.id),
  });

  return (
    <motion.div
      className="group flex items-center gap-2 w-full min-w-0"
      variants={container}
      initial="hidden"
      animate="visible"
      custom={index}
    >
      <motion.button
        type="button"
        {...(isMobile ? longPress : {
          onClick: () => onNoteClick(note.id),
          onContextMenu: (e: React.MouseEvent) => onContextMenuNote(e, note.id),
        })}
        style={{ opacity: noteAgingOpacity(note.updated_at) }}
        className={`flex-1 min-w-0 flex items-center gap-2 text-left py-2.5 px-3 rounded-xl text-sm min-h-[48px] sm:min-h-0 ${
          isSelected ? "bg-accent-muted text-accent" : "hover:bg-accent-muted text-text-secondary"
        }`}
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.98 }}
      >
        <NoteIcon />
        <motion.span
          initial={isNew ? { backgroundColor: "rgba(45, 212, 191, 0.2)" } : false}
          animate={{ backgroundColor: "transparent" }}
          transition={{ duration: 2, ease: "easeOut" }}
          className="block min-w-0 flex-1 line-clamp-2 break-words"
        >
          {note.title || "(untitled)"}
        </motion.span>
      </motion.button>
      {onDeleteNote && (
        <DeleteIcon ariaLabel="Delete note" onClick={() => onDeleteNote(note.id)} />
      )}
    </motion.div>
  );
}

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  onNoteSelect?: () => void;
  onDeleteNote?: (id: number) => void | Promise<void>;
  onDeleteFolder?: (id: number) => void | Promise<void>;
  onTrashClick?: () => void;
  onMoveNote?: (noteId: number, targetFolderId: number | null) => Promise<void>;
  onMoveFolder?: (folderId: number, targetParentId: number | null) => Promise<void>;
  onCreateFolder?: (parentFolderId?: number | null) => void;
  onRenameFolder?: (folderId: number) => void;
  onCreateNoteInFolder?: (folderId: number) => void | Promise<void>;
  onPinNote?: (noteId: number, pinned: boolean) => void | Promise<void>;
  onDuplicateNote?: (noteId: number) => void | Promise<void>;
  onOpenInSplit?: (noteId: number) => void;
  /** When set (desktop), sidebar uses this width instead of fixed w-64 */
  width?: number;
  isLoading?: boolean;
}

export function Sidebar({ open = false, onClose, onNoteSelect, onDeleteNote, onDeleteFolder, onTrashClick, onMoveNote, onMoveFolder, onCreateFolder, onRenameFolder, onCreateNoteInFolder, onPinNote, onDuplicateNote, onOpenInSplit, width, isLoading = false }: SidebarProps) {
  const token = useAuthStore((s) => s.token);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isMobile = useIsMobile();
  const [tagFilterId, setTagFilterId] = useState<number | null>(null);
  const roots = useTreeStore((s) => s.roots);
  const rootNotes = useTreeStore((s) => s.rootNotes);

  const { data: tags = [] } = useQuery({
    queryKey: ["tags", token],
    queryFn: () => api.tags.list(token!),
    enabled: !!token,
  });
  const { data: noteIdsByTag } = useQuery({
    queryKey: ["notesByTag", tagFilterId, token],
    queryFn: () => api.tags.getNotesByTag(token!, tagFilterId!),
    enabled: !!token && tagFilterId != null,
  });
  const allowedNoteIds = useMemo(() => (noteIdsByTag ? new Set(noteIdsByTag) : null), [noteIdsByTag]);

  const pinnedNotes = useMemo(() => {
    const p = collectPinnedNotes(roots, rootNotes);
    return allowedNoteIds ? p.filter((n) => allowedNoteIds.has(n.id)) : p;
  }, [roots, rootNotes, allowedNoteIds]);
  const unpinnedRootNotes = useMemo(() => {
    const u = filterUnpinned(rootNotes);
    return allowedNoteIds ? u.filter((n) => allowedNoteIds.has(n.id)) : u;
  }, [rootNotes, allowedNoteIds]);
  const rootsFiltered = useMemo(() => filterFolderNotes(roots, allowedNoteIds), [roots, allowedNoteIds]);
  const selectedNoteId = useTreeStore((s) => s.selectedNoteId);
  const setSelectedNote = useTreeStore((s) => s.setSelectedNote);
  const lastCreatedIds = useTreeStore((s) => s.lastCreatedIds);
  const [contextMenu, setContextMenu] = useState<ContextTarget | null>(null);
  const [moveNoteId, setMoveNoteId] = useState<number | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  useRegisterOverlay(contextMenu != null && !isMobile, closeContextMenu);
  useEffect(() => {
    if (!contextMenu) return;
    const onGlobalClick = () => closeContextMenu();
    window.addEventListener("click", onGlobalClick);
    return () => window.removeEventListener("click", onGlobalClick);
  }, [contextMenu, closeContextMenu]);

  const handleNoteClick = (id: number) => {
    setSelectedNote(id);
    onNoteSelect?.();
  };

  const handleContextMenuNote = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, noteId: id });
  };

  const handleContextMenuFolder = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, folderId: id });
  };

  const onRenameFolderClick = () => {
    if (contextMenu?.folderId != null && onRenameFolder) {
      onRenameFolder(contextMenu.folderId);
      closeContextMenu();
    }
  };

  const handleLongPressNote = (id: number) => {
    setContextMenu({ x: 0, y: 0, noteId: id });
  };

  const handleLongPressFolder = (id: number) => {
    setContextMenu({ x: 0, y: 0, folderId: id });
  };

  const onDeleteNoteClick = async () => {
    if (contextMenu?.noteId != null && onDeleteNote) {
      await onDeleteNote(contextMenu.noteId);
      closeContextMenu();
    }
  };

  const onDeleteFolderClick = async () => {
    if (contextMenu?.folderId != null && onDeleteFolder) {
      await onDeleteFolder(contextMenu.folderId);
      closeContextMenu();
    }
  };

  const [isRootDroppableHovered, setIsRootDroppableHovered] = useState(false);

  const handleRootDrop = async (e: React.DragEvent) => {
    if (isMobile) return;
    e.preventDefault();
    setIsRootDroppableHovered(false);
    const noteId = e.dataTransfer.getData("noteId");
    if (noteId && onMoveNote) {
      await onMoveNote(parseInt(noteId), null);
      return;
    }
    const folderId = e.dataTransfer.getData("folderId");
    if (folderId && onMoveFolder) {
      await onMoveFolder(parseInt(folderId), null);
    }
  };

  const handleRootDragOver = (e: React.DragEvent) => {
    if (isMobile) return;
    e.preventDefault();
    setIsRootDroppableHovered(true);
  };

  const handleRootDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsRootDroppableHovered(false);
    }
  };

  const SWIPE_THRESHOLD = 60;
  const VELOCITY_THRESHOLD = 300;
  const isMobileOpen = !isDesktop && open;

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
      const { offset, velocity } = info;
      const shouldClose = offset.x < -SWIPE_THRESHOLD || velocity.x < -VELOCITY_THRESHOLD;
      if (shouldClose && onClose) onClose();
    },
    [onClose]
  );

  return (
    <motion.aside
      className={`h-full min-h-0 self-stretch bg-sidebar border-r border-border overflow-hidden flex flex-col fixed top-[calc(env(safe-area-inset-top)+3.5rem)] sm:top-[calc(env(safe-area-inset-top)+4rem)] bottom-0 left-0 lg:static lg:inset-auto z-[59] lg:z-auto shrink-0 ${
        width == null
          ? "w-[min(400px,calc(100vw-16px))] lg:w-64"
          : ""
      }`}
      initial={false}
      animate={{
        x: isDesktop || open ? 0 : "-100%",
      }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 30,
        mass: 0.8,
      }}
      drag={isMobileOpen ? "x" : false}
      dragDirectionLock
      dragConstraints={{ left: -400, right: 0 }}
      dragElastic={{ left: 0.2, right: 0 }}
      onDragEnd={handleDragEnd}
      style={{
        ...(width != null ? { width } : {}),
        ...(!isDesktop && open ? { boxShadow: "4px 0 24px rgba(0,0,0,0.25), 2px 0 8px rgba(0,0,0,0.15)" } : {}),
      }}
    >
      <div className="lg:hidden absolute top-4 right-4 z-10">
        <motion.button
          type="button"
          onClick={onClose}
          className="touch-target-48 p-2 rounded-xl text-text-secondary hover:text-accent hover:bg-accent-muted"
          aria-label="Close menu"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </motion.button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col p-4 pt-14 lg:pt-6 lg:p-5 overflow-hidden">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">Notes</h2>
          {onCreateFolder && (
            <motion.button
              type="button"
              onClick={() => onCreateFolder()}
              className="shrink-0 p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent-muted transition-colors"
              title="Создать папку"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </motion.button>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3 shrink-0">
            <button
              type="button"
              onClick={() => setTagFilterId(null)}
              className={`px-2 py-1 rounded text-xs ${tagFilterId == null ? "bg-accent text-white" : "bg-bg text-text-muted hover:bg-accent-muted"}`}
            >
              Все
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => setTagFilterId(tagFilterId === tag.id ? null : tag.id)}
                className={`px-2 py-1 rounded text-xs truncate max-w-[120px] ${tagFilterId === tag.id ? "ring-1 ring-accent" : "hover:bg-accent-muted"}`}
                style={{ backgroundColor: tag.color ? `${tag.color}30` : undefined, color: tag.color || undefined }}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
          {isLoading ? (
            <div className="space-y-2 p-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : (
          <>
          <div
            className={`rounded-xl transition-colors ${isRootDroppableHovered ? "bg-accent-muted" : ""}`}
            onDragOver={handleRootDragOver}
            onDragLeave={handleRootDragLeave}
            onDrop={handleRootDrop}
          >
            {pinnedNotes.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78 0.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-0.76a2 2 0 0 0-1.11-1.79l-1.78-0.9A2 2 0 0 1 15 10.76V10" />
                    <path d="M12 2v5" />
                    <path d="M12 7v3" />
                  </svg>
                  Закреплённые
                </div>
                <div className="space-y-1">
                  {pinnedNotes.map((note) => (
                    <PinnedNoteRow
                      key={note.id}
                      note={note}
                      isNew={lastCreatedIds.has(note.id)}
                      isSelected={selectedNoteId === note.id}
                      isMobile={isMobile}
                      onNoteClick={handleNoteClick}
                      onLongPressNote={handleLongPressNote}
                      onContextMenuNote={handleContextMenuNote}
                      onDeleteNote={onDeleteNote}
                    />
                  ))}
                </div>
              </div>
            )}
            {unpinnedRootNotes.map((note, i) => (
              <UnpinnedRootNoteRow
                key={note.id}
                note={note}
                index={i}
                isNew={lastCreatedIds.has(note.id)}
                isSelected={selectedNoteId === note.id}
                isMobile={isMobile}
                container={container}
                onNoteClick={handleNoteClick}
                onLongPressNote={handleLongPressNote}
                onContextMenuNote={handleContextMenuNote}
                onDeleteNote={onDeleteNote}
              />
            ))}
          </div>
          {rootsFiltered.map((folder) => (
            <FolderNode
              key={folder.id}
              folder={folder}
              onNoteSelect={onNoteSelect}
              onDeleteNote={onDeleteNote}
              onDeleteFolder={onDeleteFolder}
              onContextMenuNote={handleContextMenuNote}
              onContextMenuFolder={handleContextMenuFolder}
              onLongPressNote={isMobile ? handleLongPressNote : undefined}
              onLongPressFolder={isMobile ? handleLongPressFolder : undefined}
              onMoveNote={onMoveNote}
              onMoveFolder={onMoveFolder}
              onCreateFolder={onCreateFolder}
            />
          ))}
          </>
          )}
          {onTrashClick && (
            <button
              type="button"
              onClick={onTrashClick}
              className="mt-3 pt-3 border-t border-border shrink-0 flex items-center gap-2 text-sm text-text-secondary hover:text-accent hover:bg-accent-muted rounded-xl px-3 py-2 w-full text-left transition-all duration-200 active:scale-[0.99] min-h-[48px] sm:min-h-0 mb-1"
              aria-label="Корзина"
            >
              <svg className="shrink-0 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Корзина
            </button>
          )}
        </div>
      </div>
      {contextMenu != null && isMobile && (
        <BottomSheet
          open={contextMenu != null}
          onClose={closeContextMenu}
          title={contextMenu.noteId != null ? "Действия с заметкой" : "Действия с папкой"}
          maxHeight="75dvh"
        >
          <div className="p-4 space-y-1">
            {contextMenu.folderId != null && (
              <>
                {onCreateNoteInFolder && (
                  <button
                    type="button"
                    className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-accent hover:bg-accent-muted transition-all duration-200 active:scale-[0.99]"
                    onClick={async () => {
                      await onCreateNoteInFolder(contextMenu!.folderId!);
                      closeContextMenu();
                    }}
                  >
                    Новая заметка
                  </button>
                )}
                <button
                  type="button"
                  className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-secondary hover:bg-accent-muted"
                  onClick={onRenameFolderClick}
                >
                  Переименовать
                </button>
              </>
            )}
            {contextMenu.noteId != null && (
              <>
                {onPinNote && (
                  <button
                    type="button"
                    className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-secondary hover:bg-accent-muted transition-all duration-200 active:scale-[0.99]"
                    onClick={async () => {
                      const pinned = pinnedNotes.some((n) => n.id === contextMenu!.noteId);
                      await onPinNote(contextMenu!.noteId!, !pinned);
                      closeContextMenu();
                    }}
                  >
                    {pinnedNotes.some((n) => n.id === contextMenu!.noteId) ? "Открепить" : "Закрепить"}
                  </button>
                )}
                {onDuplicateNote && (
                  <button
                    type="button"
                    className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-secondary hover:bg-accent-muted transition-all duration-200 active:scale-[0.99]"
                    onClick={async () => {
                      await onDuplicateNote(contextMenu!.noteId!);
                      closeContextMenu();
                    }}
                  >
                    Дублировать
                  </button>
                )}
                {onOpenInSplit && (
                  <button
                    type="button"
                    className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-secondary hover:bg-accent-muted transition-all duration-200 active:scale-[0.99]"
                    onClick={() => {
                      onOpenInSplit(contextMenu!.noteId!);
                      closeContextMenu();
                    }}
                  >
                    Открыть в Split
                  </button>
                )}
                {onMoveNote && (
                  <button
                    type="button"
                    className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-secondary hover:bg-accent-muted transition-all duration-200 active:scale-[0.99]"
                    onClick={() => {
                      setMoveNoteId(contextMenu!.noteId!);
                      closeContextMenu();
                    }}
                  >
                    Переместить в папку
                  </button>
                )}
                <button
                  type="button"
                  className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-error hover:bg-error/10 transition-all duration-200 active:scale-[0.99]"
                  onClick={() => onDeleteNoteClick()}
                >
                  Удалить заметку
                </button>
              </>
            )}
            {contextMenu.folderId != null && (
              <button
                type="button"
                className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-error hover:bg-error/10"
                onClick={() => onDeleteFolderClick()}
              >
                Удалить папку
              </button>
            )}
          </div>
        </BottomSheet>
      )}
      {moveNoteId != null && onMoveNote && (
        <BottomSheet
          open={moveNoteId != null}
          onClose={() => setMoveNoteId(null)}
          title="Переместить в папку"
          maxHeight="60dvh"
        >
          <div className="p-4 space-y-1 overflow-auto max-h-[50dvh]">
            {flattenFolders(roots).map((f) => (
              <button
                key={f.id ?? "root"}
                type="button"
                className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-primary hover:bg-accent-muted"
                onClick={async () => {
                  await onMoveNote(moveNoteId, f.id);
                  setMoveNoteId(null);
                }}
              >
                {f.name}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
      {contextMenu != null && !isMobile && (
        <div
          className="fixed z-[100] min-w-[120px] py-1 rounded-xl border border-border/60 bg-surface shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.folderId != null && (
            <>
              {onCreateNoteInFolder && (
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-accent hover:bg-accent-muted"
                  onClick={async () => {
                    await onCreateNoteInFolder(contextMenu!.folderId!);
                    closeContextMenu();
                  }}
                >
                  Новая заметка
                </button>
              )}
              <button
                type="button"
                className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-accent-muted"
                onClick={onRenameFolderClick}
              >
                Rename
              </button>
            </>
          )}
          {contextMenu.noteId != null && (
            <>
              {onPinNote && (
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-accent-muted"
                  onClick={async () => {
                    const pinned = pinnedNotes.some((n) => n.id === contextMenu!.noteId);
                    await onPinNote(contextMenu!.noteId!, !pinned);
                    closeContextMenu();
                  }}
                >
                  {pinnedNotes.some((n) => n.id === contextMenu!.noteId) ? "Unpin" : "Pin"}
                </button>
              )}
              {onDuplicateNote && (
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-accent-muted"
                  onClick={async () => {
                    await onDuplicateNote(contextMenu!.noteId!);
                    closeContextMenu();
                  }}
                >
                  Duplicate
                </button>
              )}
              {onOpenInSplit && (
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-accent-muted"
                  onClick={() => {
                    onOpenInSplit(contextMenu!.noteId!);
                    closeContextMenu();
                  }}
                >
                  Open in split
                </button>
              )}
              {onMoveNote && (
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-accent-muted"
                  onClick={() => {
                    setMoveNoteId(contextMenu!.noteId!);
                    closeContextMenu();
                  }}
                >
                  Move to folder
                </button>
              )}
              <button
                type="button"
                className="w-full text-left px-4 py-2 text-sm text-error hover:bg-error/10"
                onClick={onDeleteNoteClick}
              >
                Delete note
              </button>
            </>
          )}
          {contextMenu.folderId != null && (
            <button
              type="button"
              className="w-full text-left px-4 py-2 text-sm text-error hover:bg-error/10"
              onClick={onDeleteFolderClick}
            >
              Delete folder
            </button>
          )}
        </div>
      )}
    </motion.aside>
  );
}
