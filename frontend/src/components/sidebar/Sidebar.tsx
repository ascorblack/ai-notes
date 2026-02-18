import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { useTreeStore } from "../../store/treeStore";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useIsMobile } from "../../hooks/useIsMobile";
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

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  onNoteSelect?: () => void;
  onDeleteNote?: (id: number) => void | Promise<void>;
  onDeleteFolder?: (id: number) => void | Promise<void>;
  onTrashClick?: () => void;
  /** When set (desktop), sidebar uses this width instead of fixed w-64 */
  width?: number;
  isLoading?: boolean;
}

export function Sidebar({ open = false, onClose, onNoteSelect, onDeleteNote, onDeleteFolder, onTrashClick, width, isLoading = false }: SidebarProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isMobile = useIsMobile();
  const roots = useTreeStore((s) => s.roots);
  const rootNotes = useTreeStore((s) => s.rootNotes);
  const selectedNoteId = useTreeStore((s) => s.selectedNoteId);
  const setSelectedNote = useTreeStore((s) => s.setSelectedNote);
  const lastCreatedIds = useTreeStore((s) => s.lastCreatedIds);
  const [contextMenu, setContextMenu] = useState<ContextTarget | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
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

  const DeleteIcon = ({ onClick, ariaLabel }: { onClick: (e: React.MouseEvent) => void; ariaLabel: string }) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className="shrink-0 touch-target-48 p-1 rounded-md opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-error/20 text-text-muted hover:text-error transition-opacity"
      aria-label={ariaLabel}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    </button>
  );

  const NoteIcon = () => (
    <svg className="shrink-0 w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );

  const NoteButton = ({
    note,
    index,
    className,
  }: {
    note: { id: number; title: string };
    index: number;
    className?: string;
  }) => {
    const isNew = lastCreatedIds.has(note.id);
    const longPress = useLongPress({
      onLongPress: () => handleLongPressNote(note.id),
      onClick: () => handleNoteClick(note.id),
    });
    return (
      <motion.div
        key={note.id}
        className={`group flex items-center gap-2 w-full min-w-0 ${className?.replace("block ", "")}`}
        variants={container}
        initial="hidden"
        animate="visible"
        custom={index}
      >
        <motion.button
          type="button"
          {...(isMobile
            ? longPress
            : {
                onClick: () => handleNoteClick(note.id),
                onContextMenu: (e: React.MouseEvent) => handleContextMenuNote(e, note.id),
              })}
          className={`flex-1 min-w-0 flex items-center gap-2 text-left py-2.5 px-3 rounded-xl text-sm min-h-[48px] sm:min-h-0 ${
            selectedNoteId === note.id ? "bg-accent-muted text-accent" : "hover:bg-accent-muted text-text-secondary"
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
          <DeleteIcon
            ariaLabel="Delete note"
            onClick={() => onDeleteNote(note.id)}
          />
        )}
      </motion.div>
    );
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
          ? "w-[min(360px,calc(100vw-24px))] lg:w-64"
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
        <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-4 shrink-0">Notes</h2>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : (
          <>
          {rootNotes.map((note, i) => (
            <NoteButton key={note.id} note={note} index={i} />
          ))}
          {roots.map((folder) => (
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
            />
          ))}
          </>
          )}
        </div>
        {onTrashClick && (
          <button
            type="button"
            onClick={onTrashClick}
            className="mt-3 pt-3 border-t border-border shrink-0 flex items-center gap-2 text-sm text-text-secondary hover:text-accent hover:bg-accent-muted rounded-xl px-3 py-2 w-full text-left transition-colors min-h-[48px] sm:min-h-0"
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
      {contextMenu != null && isMobile && (
        <BottomSheet
          open={contextMenu != null}
          onClose={closeContextMenu}
          title={contextMenu.noteId != null ? "Действия с заметкой" : "Действия с папкой"}
          maxHeight="30dvh"
        >
          <div className="p-4 space-y-1">
            {contextMenu.noteId != null && (
              <button
                type="button"
                className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-error hover:bg-error/10"
                onClick={() => onDeleteNoteClick()}
              >
                Удалить заметку
              </button>
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
      {contextMenu != null && !isMobile && (
        <div
          className="fixed z-[100] min-w-[120px] py-1 rounded-xl border border-border/60 bg-surface shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.noteId != null && (
            <button
              type="button"
              className="w-full text-left px-4 py-2 text-sm text-error hover:bg-error/10"
              onClick={onDeleteNoteClick}
            >
              Delete note
            </button>
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
