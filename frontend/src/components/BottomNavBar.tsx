import { Link, useLocation } from "react-router-dom";
import { useAppModalsStore } from "../store/appModalsStore";

interface BottomNavBarProps {
  onAddClick?: () => void;
  onMoreClick?: () => void;
}

const NotesIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const ChatIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const AddIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const HamburgerIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const MoreIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </svg>
);

export function BottomNavBar({ onAddClick, onMoreClick }: BottomNavBarProps) {
  const location = useLocation();
  const setChatSessionsOpen = useAppModalsStore((s) => s.setChatSessionsOpen);
  const isNotes = location.pathname === "/";
  const isChat = location.pathname === "/chat";

  return (
    <nav
      className="sm:hidden flex-shrink-0 flex items-center justify-around bg-surface/95 border-t border-border/60 safe-area-pb"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Нижняя навигация"
    >
      <Link
        to="/chat"
        className={`flex flex-col items-center justify-center min-w-[64px] py-2 touch-target-48 ${
          isChat ? "text-accent" : "text-text-muted"
        }`}
        aria-label="Обсудить"
        aria-current={isChat ? "page" : undefined}
      >
        <ChatIcon />
        <span className="text-xs mt-0.5">Обсудить</span>
      </Link>

      <Link
        to="/"
        className={`flex flex-col items-center justify-center min-w-[64px] py-2 touch-target-48 ${
          isNotes ? "text-accent" : "text-text-muted"
        }`}
        aria-label="Заметки"
        aria-current={isNotes ? "page" : undefined}
      >
        <NotesIcon />
        <span className="text-xs mt-0.5">Заметки</span>
      </Link>

      {isChat ? (
        <button
          type="button"
          onClick={() => setChatSessionsOpen(true)}
          className="flex flex-col items-center justify-center min-w-[64px] py-2 touch-target-48 text-text-muted hover:text-accent transition-colors"
          aria-label="Диалоги"
        >
          <HamburgerIcon />
          <span className="text-xs mt-0.5">Диалоги</span>
        </button>
      ) : onAddClick ? (
        <button
          type="button"
          onClick={onAddClick}
          className="flex flex-col items-center justify-center min-w-[64px] py-2 touch-target-48 text-text-muted hover:text-accent transition-colors"
          aria-label="Создать заметку"
        >
          <AddIcon />
          <span className="text-xs mt-0.5">Создать заметку</span>
        </button>
      ) : null}

      {onMoreClick && (
        <button
          type="button"
          onClick={onMoreClick}
          className="flex flex-col items-center justify-center min-w-[64px] py-2 touch-target-48 text-text-muted"
          aria-label="Ещё"
        >
          <MoreIcon />
          <span className="text-xs mt-0.5">Ещё</span>
        </button>
      )}
    </nav>
  );
}
