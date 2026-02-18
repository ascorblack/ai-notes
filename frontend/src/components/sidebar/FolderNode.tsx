import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { FolderTree, NoteRef } from "../../api/client";
import { useTreeStore } from "../../store/treeStore";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useLongPress } from "../../hooks/useLongPress";

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

interface FolderNodeProps {
  folder: FolderTree;
  onNoteSelect?: () => void;
  onDeleteNote?: (id: number) => void | Promise<void>;
  onDeleteFolder?: (id: number) => void | Promise<void>;
  onContextMenuNote?: (e: React.MouseEvent, noteId: number) => void;
  onContextMenuFolder?: (e: React.MouseEvent, folderId: number) => void;
  onLongPressNote?: (noteId: number) => void;
  onLongPressFolder?: (folderId: number) => void;
}

const FolderChevron = ({ open }: { open: boolean }) => (
  <span className={`shrink-0 w-4 flex items-center justify-center text-text-muted text-xs font-bold transition-transform duration-200 ${open ? "" : "-rotate-90"}`}>▸</span>
);

const FolderShapeIcon = () => (
  <svg className="shrink-0 w-4 h-4 text-accent-secondary/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const NoteIconSmall = () => (
  <svg className="shrink-0 w-3.5 h-3.5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

export function FolderNode({ folder, onNoteSelect, onDeleteNote, onDeleteFolder, onContextMenuNote, onContextMenuFolder, onLongPressNote, onLongPressFolder }: FolderNodeProps) {
  const [open, setOpen] = useState(true);
  const isMobile = useIsMobile();
  const selectedNoteId = useTreeStore((s) => s.selectedNoteId);
  const setSelectedNote = useTreeStore((s) => s.setSelectedNote);
  const lastCreatedIds = useTreeStore((s) => s.lastCreatedIds);

  const handleNoteClick = (note: NoteRef) => {
    setSelectedNote(note.id);
    onNoteSelect?.();
  };

  const folderLongPress = useLongPress({
    onLongPress: () => onLongPressFolder?.(folder.id),
    onClick: () => setOpen((o) => !o),
  });

  return (
    <div className="ml-2 mt-1">
      <div className="group flex items-center gap-2 w-full min-w-0">
        <motion.button
          type="button"
          {...(isMobile && onLongPressFolder
            ? folderLongPress
            : {
                onClick: () => setOpen((o) => !o),
                onContextMenu: (e: React.MouseEvent) => onContextMenuFolder?.(e, folder.id),
              })}
          className="flex-1 flex items-center gap-2 min-w-0 text-left py-2.5 px-3 rounded-xl hover:bg-accent-secondary-muted text-text-primary hover:text-accent-secondary min-h-[48px] sm:min-h-0"
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.98 }}
        >
          <FolderShapeIcon />
          <FolderChevron open={open} />
          <span className="font-medium line-clamp-2 break-words text-sm flex-1 min-w-0">{folder.name}</span>
        </motion.button>
        {onDeleteFolder && (
          <DeleteIcon ariaLabel="Delete folder" onClick={() => onDeleteFolder(folder.id)} />
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-3 border-l border-border/60 pl-2 py-1">
              {folder.notes.map((note) => (
                  <div key={note.id} className="group flex items-center gap-2 w-full min-w-0">
                    <NoteRow
                      note={note}
                      isSelected={selectedNoteId === note.id}
                      isNew={lastCreatedIds.has(note.id)}
                      onNoteClick={handleNoteClick}
                      onContextMenuNote={onContextMenuNote}
                      onLongPressNote={onLongPressNote}
                      onDeleteNote={onDeleteNote}
                    />
                  </div>
              ))}
              {folder.children.map((child) => (
                <FolderNode
                  key={child.id}
                  folder={child}
                  onNoteSelect={onNoteSelect}
                  onDeleteNote={onDeleteNote}
                  onDeleteFolder={onDeleteFolder}
                  onContextMenuNote={onContextMenuNote}
                  onContextMenuFolder={onContextMenuFolder}
                  onLongPressNote={onLongPressNote}
                  onLongPressFolder={onLongPressFolder}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NoteRow({
  note,
  isSelected,
  isNew,
  onNoteClick,
  onContextMenuNote,
  onLongPressNote,
  onDeleteNote,
}: {
  note: NoteRef;
  isSelected: boolean;
  isNew: boolean;
  onNoteClick: (note: NoteRef) => void;
  onContextMenuNote?: (e: React.MouseEvent, noteId: number) => void;
  onLongPressNote?: (noteId: number) => void;
  onDeleteNote?: (id: number) => void | Promise<void>;
}) {
  const isMobile = useIsMobile();
  const longPress = useLongPress({
    onLongPress: () => onLongPressNote?.(note.id),
    onClick: () => onNoteClick(note),
  });
  return (
    <>
      <motion.button
        type="button"
        {...(isMobile && onLongPressNote
          ? longPress
          : {
              onClick: () => onNoteClick(note),
              onContextMenu: (e: React.MouseEvent) => onContextMenuNote?.(e, note.id),
            })}
        className={`flex-1 min-w-0 flex items-center gap-2 text-left py-2 px-3 rounded-xl text-sm min-h-[48px] sm:min-h-0 ${
          isSelected ? "bg-accent-muted text-accent" : "hover:bg-accent-muted text-text-secondary"
        }`}
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.98 }}
      >
        <NoteIconSmall />
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
    </>
  );
}
